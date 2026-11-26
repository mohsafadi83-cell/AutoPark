import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../../config/app.config';
import { AppCacheService } from '../../common/cache.module';
import { AuthUser, RequestMeta } from '../../common/decorators';
import {
  AlarmSeverity, CommandStatus, EventCategory, IN_FLIGHT_COMMAND_STATUSES, Protocol, RequestType, SpaceStatus,
} from '../../common/enums';
import { AppError } from '../../common/errors';
import { pageParams, paginated, PaginationQuery } from '../../common/pagination';
import { decryptSecret, encryptSecret, iso, MASK } from '../../common/utils';
import { IndustrialCommandEntity, IntegrationConfigEntity, ParkingSpaceEntity } from '../../database/entities';
import { AlarmsService } from '../alarms/alarms.module';
import { AuditService } from '../audit/audit.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CustomTcpAdapter, MqttAdapter, RestGatewayAdapter } from './adapters/gateway-and-tcp.adapters';
import { ModbusTcpAdapter } from './adapters/modbus-tcp.adapter';
import { MockIndustrialAdapter, MockScenario, MockState } from './adapters/mock-industrial.adapter';
import { OpcUaAdapter } from './adapters/opc-ua.adapter';
import { EmergencyRecoveryAction, PlcSensorsSnapshot, SiemensS7Adapter } from './adapters/siemens-s7.adapter';
import { VncHmiAdapter } from './adapters/vnc-hmi.adapter';
import {
  CommandFeedback, ConnectionTestResult, ControllerCommand, ControllerEvent, ControllerStatus,
  IndustrialController, OFFLINE_STATUS,
} from './industrial-controller.interface';
import {
  DEFAULT_PLC_ALARM_DEFINITIONS, DEFAULT_TAG_DESCRIPTIONS, DEFAULT_VERIFIED_S7_TAG_MAP, IntegrationSettings, SECRET_FIELDS, TAG_KEYS, TagDefinition, TagMap,
} from './integration-settings';
import { VncBridgeService } from './vnc-web.controller';

export type CommandFeedbackHandler = (feedback: CommandFeedback) => Promise<void>;

@Injectable()
export class IndustrialIntegrationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndustrialIntegrationService.name);
  private controller: IndustrialController | null = null;
  private unsubscribeController: (() => void) | null = null;
  private lastControllerStatus: ControllerStatus = { ...OFFLINE_STATUS };
  private lastPublishedState: string | null = null;
  private feedbackHandlers = new Set<CommandFeedbackHandler>();
  private sequenceCounter = Math.floor(Date.now() / 1000) % 1000000;
  private destroyed = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnecting = false;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @InjectRepository(IntegrationConfigEntity) private readonly configRepo: Repository<IntegrationConfigEntity>,
    @InjectRepository(IndustrialCommandEntity) private readonly cmdRepo: Repository<IndustrialCommandEntity>,
    private readonly alarms: AlarmsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly vncBridge: VncBridgeService,
    private readonly cache: AppCacheService,
  ) {}

  async onModuleInit() {
    this.destroyed = false;
    await this.reloadAdapter();
  }

  async onModuleDestroy() {
    this.destroyed = true;
    await this.teardownAdapter();
  }

  onCommandFeedback(handler: CommandFeedbackHandler) {
    this.feedbackHandlers.add(handler);
  }

  nextSequence(): number {
    this.sequenceCounter = (this.sequenceCounter + 1) % 2147483647;
    return this.sequenceCounter;
  }

  getActiveController(): IndustrialController | null {
    return this.controller;
  }

  getSensorsSnapshot(): PlcSensorsSnapshot {
    if (this.controller instanceof SiemensS7Adapter) {
      return this.controller.getSensorsSnapshot();
    }
    const cs = this.lastControllerStatus;
    return {
      connected: cs.connected,
      mode: 'SIMULATED_FALLBACK',
      timestamp: new Date().toISOString(),
      photocellClear: cs.safetyOk,
      obstacleExist: !cs.safetyOk,
      emergencyStop: cs.emergencyStop,
      emergencyDuringMove: false,
      stopperFault: false,
      liftInvalidPos: false,
      errorInPosition: false,
      maintenanceDue: false,
      autoMode: true,
      manualMode: cs.machineState === 'MAINTENANCE',
      alarmWord: cs.emergencyStop ? 1 : 0,
      alarmSection: 0,
      lanes: [1, 2, 3, 4].map((lane) => ({
        lane,
        lsTop: false,
        lsMid: false,
        lsBtm: true,
        mgProt: true,
        checkLocation: true,
        currentFloor: 1,
      })),
      spots: {},
    };
  }

  async executeEmergencyRecovery(action: EmergencyRecoveryAction, user: AuthUser, meta: RequestMeta) {
    let result: { ok: boolean; action: EmergencyRecoveryAction; message: string };
    if (this.controller instanceof SiemensS7Adapter) {
      result = await this.controller.emergencyRecovery(action);
    } else if (this.controller instanceof MockIndustrialAdapter) {
      if (action === 'ESTOP_ON') await this.controller.applyScenario('EMERGENCY_STOP');
      else if (action === 'ESTOP_OFF' || action === 'COMPLETE_SEQ' || action === 'RETURN_PARK') {
        await this.controller.applyScenario('CLEAR_EMERGENCY');
      } else if (action === 'SAFE_RESET') {
        await this.controller.applyScenario('CLEAR_ALARMS');
      }
      result = { ok: true, action, message: `Mock adapter executed ${action}` };
    } else {
      result = { ok: false, action, message: 'Active adapter does not support emergency recovery' };
    }

    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: `EMERGENCY_${action}`,
      entity: 'industrial_safety',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { action, result },
    });
    await this.broadcastStatus();
    return result;
  }

  async executeManualControl(controlKey: string, active: boolean, user: AuthUser, meta: RequestMeta) {
    let result: { ok: boolean; controlKey: string; active: boolean; message: string };
    if (this.controller instanceof SiemensS7Adapter) {
      result = await this.controller.manualControl(controlKey, active);
    } else {
      result = { ok: true, controlKey, active, message: `Simulated manual control: ${controlKey}=${active}` };
    }

    // When performing a Manual Slot Reset (spot_L11_tag .. spot_L43_tag -> false),
    // also clear occupancy in PostgreSQL parking_spaces & invalidate cache so PLC [DB2] and DB stay 100% in sync!
    const spotMatch = /^spot_(L[1-4][1-3])_tag$/i.exec(controlKey);
    if (spotMatch && !active) {
      const spaceNumber = spotMatch[1].toUpperCase();
      try {
        // Use entity property names (DB uses snake_case columns via SnakeNamingStrategy)
        await this.cmdRepo.manager.update(
          ParkingSpaceEntity,
          { spaceNumber },
          {
            status: SpaceStatus.AVAILABLE,
            vehicleId: null,
            parkedByUserId: null,
            parkedByUsername: null,
            isOtherVehicle: false,
            statusReason: null,
          },
        );
        this.cache.invalidatePrefix('parking:');
        this.cache.invalidatePrefix('vehicles:');
        result = {
          ...result,
          message: `تم تصفير المصف ${spaceNumber} من الـ PLC (ParkDB [DB2]) ومن قاعدة البيانات بنجاح.`,
        };
      } catch (err) {
        this.logger.warn(`Failed to sync manual slot reset for ${spaceNumber} to DB: ${(err as Error).message}`);
      }
    }

    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'MANUAL_PLC_CONTROL',
      entity: 'industrial_manual',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { controlKey, active, result },
    });
    return result;
  }

  async writeLiveS7Tag(address: string, value: boolean | number, pulseMs: number | undefined, user: AuthUser, meta: RequestMeta) {
    if (!(this.controller instanceof SiemensS7Adapter)) {
      return { ok: false, message: 'Active adapter is not SIEMENS_S7' };
    }
    const res = await this.controller.writePlcTag(address, value, pulseMs);
    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'DIRECT_PLC_WRITE',
      entity: 'industrial_plc',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { address, value, pulseMs, ok: res.ok },
    });
    return res;
  }

  getMockAdapter(): MockIndustrialAdapter {
    if (!(this.controller instanceof MockIndustrialAdapter)) {
      throw new AppError('SIMULATION_ONLY', 'Simulation control is only available when using the MOCK adapter');
    }
    return this.controller;
  }

  async getSimulationState(): Promise<MockState> {
    return this.getMockAdapter().getState();
  }

  async applySimulationScenario(scenario: MockScenario, user: AuthUser, meta: RequestMeta): Promise<MockState> {
    const state = await this.getMockAdapter().applyScenario(scenario);
    this.cache.invalidatePrefix('industrial:');
    this.cache.invalidatePrefix('alarms:');
    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'SIMULATION_SCENARIO',
      entity: 'simulation',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { scenario, state },
    });
    await this.broadcastStatus();
    return state;
  }

  /* ───────────────────────── Configuration Management ───────────────────────── */

  async getRuntimeSettings(): Promise<{ settings: IntegrationSettings; updatedAt: Date | null; updatedBy: string | null }> {
    return this.cache.getOrSet('industrial:runtime_settings', 30_000, async () => {
      const row = await this.configRepo.findOne({ where: { id: 1 } });
      const s = (row?.settings ?? {}) as Record<string, unknown>;
      const secrets = (row?.secrets ?? {}) as Record<string, string>;
      const dec = (field: string): string | null => {
        const val = secrets[field];
        if (!val) return null;
        try {
          return decryptSecret(val, this.cfg.encryptionKey);
        } catch {
          return null;
        }
      };

      const protocolRaw = (row?.protocol ?? this.cfg.industrial.protocol ?? 'MOCK').toUpperCase();
      const protocol = (Object.values(Protocol).includes(protocolRaw as Protocol) ? protocolRaw : Protocol.MOCK) as Protocol;

      const tagMap: TagMap = {};
      const rawTags = (row?.tagMap ?? {}) as Record<string, TagDefinition>;
      const s7Defaults = protocol === Protocol.SIEMENS_S7 ? DEFAULT_VERIFIED_S7_TAG_MAP : {};

      // Seed verified S7-1200 absolute tag map defaults when protocol is SIEMENS_S7
      for (const [k, def] of Object.entries(s7Defaults)) {
        tagMap[k] = { ...def };
      }

      for (const k of TAG_KEYS) {
        const d = DEFAULT_TAG_DESCRIPTIONS[k];
        const r = rawTags[k];
        const defS7 = s7Defaults[k];
        tagMap[k] = {
          address: (r?.address && r.address.trim()) ? r.address.trim() : (defS7?.address ?? ''),
          dataType: r?.dataType ?? defS7?.dataType ?? d.dataType,
          access: r?.access ?? defS7?.access ?? d.access,
          description: r?.description ?? defS7?.description ?? d.description,
        };
      }
      // Preserve all extended TIA Portal tags (limit switches, spots, manual controls, 2-step handshake)
      for (const [k, r] of Object.entries(rawTags)) {
        if (r && typeof r === 'object' && r.address && r.address.trim()) {
          tagMap[k] = {
            address: r.address.trim(),
            dataType: r.dataType ?? s7Defaults[k]?.dataType ?? 'BOOL',
            access: r.access ?? s7Defaults[k]?.access ?? 'RW',
            description: r.description ?? s7Defaults[k]?.description ?? k,
          };
        }
      }

      return {
        settings: {
          protocol,
          plcModel: (s.plcModel as string) ?? this.cfg.industrial.plcModel ?? null,
          host: (s.host as string) ?? this.cfg.industrial.host ?? null,
          port: (s.port as number) ?? this.cfg.industrial.port ?? null,
          rack: (s.rack as number) ?? this.cfg.industrial.rack ?? 0,
          slot: (s.slot as number) ?? this.cfg.industrial.slot ?? 1,
          opcuaEndpoint: (s.opcuaEndpoint as string) ?? this.cfg.industrial.opcuaEndpoint ?? null,
          opcuaSecurityMode: ((s.opcuaSecurityMode as 'None' | 'Sign' | 'SignAndEncrypt') ?? 'None'),
          opcuaUsername: (s.opcuaUsername as string) ?? null,
          opcuaPassword: dec('opcuaPassword'),
          modbusUnitId: (s.modbusUnitId as number) ?? 1,
          mqttUrl: (s.mqttUrl as string) ?? this.cfg.industrial.mqttUrl ?? null,
          mqttTopicPrefix: (s.mqttTopicPrefix as string) ?? 'autopark/plc',
          mqttUsername: (s.mqttUsername as string) ?? null,
          mqttPassword: dec('mqttPassword'),
          restBaseUrl: (s.restBaseUrl as string) ?? this.cfg.industrial.restBaseUrl ?? null,
          restApiKey: dec('restApiKey'),
          pollIntervalMs: Number(s.pollIntervalMs ?? this.cfg.industrial.pollIntervalMs),
          ackTimeoutMs: Number(s.ackTimeoutMs ?? this.cfg.industrial.ackTimeoutMs),
          completionTimeoutMs: Number(s.completionTimeoutMs ?? this.cfg.industrial.completionTimeoutMs),
          heartbeatTimeoutMs: Number(s.heartbeatTimeoutMs ?? this.cfg.industrial.heartbeatTimeoutMs),
          supportsIdempotentCommands: Boolean(s.supportsIdempotentCommands ?? false),
          readOnly: Boolean(s.readOnly ?? false),
          syncSpacesFromController: Boolean(s.syncSpacesFromController ?? false),
          alarmDefinitions:
            Array.isArray(s.alarmDefinitions) && s.alarmDefinitions.length > 0
              ? (s.alarmDefinitions as IntegrationSettings['alarmDefinitions'])
              : DEFAULT_PLC_ALARM_DEFINITIONS,
          tagMap,
        },
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    });
  }

  async getPublicConfig() {
    const { settings, updatedAt, updatedBy } = await this.getRuntimeSettings();
    return {
      protocol: settings.protocol,
      plcModel: settings.plcModel,
      host: settings.host,
      port: settings.port,
      rack: settings.rack,
      slot: settings.slot,
      opcuaEndpoint: settings.opcuaEndpoint,
      opcuaSecurityMode: settings.opcuaSecurityMode,
      opcuaUsername: settings.opcuaUsername,
      opcuaPassword: settings.opcuaPassword ? MASK : null,
      modbusUnitId: settings.modbusUnitId,
      mqttUrl: settings.mqttUrl,
      mqttTopicPrefix: settings.mqttTopicPrefix,
      mqttUsername: settings.mqttUsername,
      mqttPassword: settings.mqttPassword ? MASK : null,
      restBaseUrl: settings.restBaseUrl,
      restApiKey: settings.restApiKey ? MASK : null,
      pollIntervalMs: settings.pollIntervalMs,
      ackTimeoutMs: settings.ackTimeoutMs,
      completionTimeoutMs: settings.completionTimeoutMs,
      heartbeatTimeoutMs: settings.heartbeatTimeoutMs,
      supportsIdempotentCommands: settings.supportsIdempotentCommands,
      readOnly: settings.readOnly,
      tagMap: settings.tagMap,
      updatedAt: iso(updatedAt),
      updatedBy,
    };
  }

  async updateConfig(patch: Record<string, unknown>, user: AuthUser, meta: RequestMeta) {
    const inFlight = await this.cmdRepo.count({ where: { status: In(IN_FLIGHT_COMMAND_STATUSES) } });
    if (inFlight > 0) {
      throw new AppError('COMMAND_IN_PROGRESS', 'Cannot change industrial configuration while a physical command is in progress');
    }

    let row = await this.configRepo.findOne({ where: { id: 1 } });
    if (!row) {
      row = this.configRepo.create({ id: 1, protocol: Protocol.MOCK, settings: {}, secrets: {}, tagMap: {} });
    }

    if (typeof patch.protocol === 'string') {
      const p = patch.protocol.toUpperCase() as Protocol;
      if (!Object.values(Protocol).includes(p)) {
        throw AppError.badRequest(`Unsupported protocol: ${patch.protocol}`);
      }
      row.protocol = p;
    }

    // Auto-split "192.168.0.30:5900" if user typed host:port in the host field
    if (typeof patch.host === 'string' && patch.host.includes(':')) {
      const rawHost = patch.host.trim().replace(/^vnc:\/\//i, '').replace(/^http:\/\//i, '');
      const colonIdx = rawHost.lastIndexOf(':');
      if (colonIdx > 0) {
        const hPart = rawHost.slice(0, colonIdx).trim();
        const pPart = Number(rawHost.slice(colonIdx + 1).trim());
        if (hPart && Number.isFinite(pPart) && pPart > 0) {
          patch.host = hPart;
          patch.port = pPart < 100 ? 5900 + pPart : pPart;
        }
      }
    }

    const nextSettings: Record<string, unknown> = { ...(row.settings ?? {}) };
    const scalarFields = [
      'plcModel', 'host', 'port', 'rack', 'slot', 'opcuaEndpoint', 'opcuaSecurityMode', 'opcuaUsername',
      'modbusUnitId', 'mqttUrl', 'mqttTopicPrefix', 'mqttUsername', 'restBaseUrl', 'pollIntervalMs',
      'ackTimeoutMs', 'completionTimeoutMs', 'heartbeatTimeoutMs', 'supportsIdempotentCommands', 'readOnly',
      'syncSpacesFromController', 'alarmDefinitions',
    ];
    for (const f of scalarFields) {
      if (f in patch) nextSettings[f] = patch[f];
    }
    row.settings = nextSettings;

    const nextSecrets: Record<string, string> = { ...(row.secrets ?? {}) };
    for (const sf of SECRET_FIELDS) {
      if (sf in patch) {
        const val = patch[sf];
        if (val === null || val === '') delete nextSecrets[sf];
        else if (typeof val === 'string' && val !== MASK) {
          nextSecrets[sf] = encryptSecret(val, this.cfg.encryptionKey);
        }
      }
    }
    row.secrets = nextSecrets;

    if (patch.tagMap && typeof patch.tagMap === 'object') {
      row.tagMap = { ...(row.tagMap ?? {}), ...(patch.tagMap as Record<string, unknown>) };
    }
    row.updatedBy = user.username;
    await this.configRepo.save(row);
    this.cache.invalidatePrefix('industrial:');

    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'INDUSTRIAL_CONFIG_UPDATE',
      entity: 'integration_config',
      entityId: '1',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { protocol: row.protocol, host: nextSettings.host, port: nextSettings.port, readOnly: nextSettings.readOnly },
    });

    await this.reloadAdapter();
    return this.getPublicConfig();
  }

  async testConnection(override?: Record<string, unknown>): Promise<ConnectionTestResult> {
    const { settings } = await this.getRuntimeSettings();
    const cleanOverride = { ...(override ?? {}) };
    if (typeof cleanOverride.host === 'string' && cleanOverride.host.includes(':')) {
      const rawHost = cleanOverride.host.trim().replace(/^vnc:\/\//i, '').replace(/^http:\/\//i, '');
      const colonIdx = rawHost.lastIndexOf(':');
      if (colonIdx > 0) {
        const hPart = rawHost.slice(0, colonIdx).trim();
        const pPart = Number(rawHost.slice(colonIdx + 1).trim());
        if (hPart && Number.isFinite(pPart) && pPart > 0) {
          cleanOverride.host = hPart;
          cleanOverride.port = pPart < 100 ? 5900 + pPart : pPart;
        }
      }
    }
    const merged: IntegrationSettings = {
      ...settings,
      ...cleanOverride,
      protocol: ((cleanOverride?.protocol as string)?.toUpperCase() as Protocol) ?? settings.protocol,
    };
    const temp = this.instantiateAdapter(merged);
    return temp.testConnection();
  }

  /* ───────────────────────── Adapter Lifecycle & Status ───────────────────────── */

  private instantiateAdapter(settings: IntegrationSettings): IndustrialController {
    const writeAllowed = this.cfg.mode === 'SIMULATION' || (this.cfg.industrial.writeEnabled && !settings.readOnly);
    switch (settings.protocol) {
      case Protocol.MOCK:
        return new MockIndustrialAdapter(this.cfg.mock);
      case Protocol.SIEMENS_S7:
        return new SiemensS7Adapter(settings, writeAllowed, this.vncBridge);
      case Protocol.OPC_UA:
        return new OpcUaAdapter(settings, writeAllowed);
      case Protocol.MODBUS_TCP:
        return new ModbusTcpAdapter(settings, writeAllowed);
      case Protocol.MQTT:
        return new MqttAdapter(settings, writeAllowed);
      case Protocol.REST_GATEWAY:
        return new RestGatewayAdapter(settings, writeAllowed);
      case Protocol.VNC:
        return new VncHmiAdapter(settings, this.vncBridge);
      case Protocol.CUSTOM_TCP:
        return new CustomTcpAdapter(settings, writeAllowed);
      default:
        return new MockIndustrialAdapter(this.cfg.mock);
    }
  }

  async reloadAdapter() {
    await this.teardownAdapter();
    const { settings } = await this.getRuntimeSettings();
    this.controller = this.instantiateAdapter(settings);
    this.unsubscribeController = this.controller.subscribeToEvents((ev) => void this.handleControllerEvent(ev));
    try {
      await this.controller.connect();
      this.lastControllerStatus = await this.controller.getSystemStatus();
      const activeAlarms = await this.controller.getActiveAlarms();
      await this.alarms.syncControllerAlarms(activeAlarms);
    } catch (e) {
      this.logger.warn(`Industrial controller (${settings.protocol}) not connected yet: ${(e as Error).message}`);
      this.lastControllerStatus = { ...OFFLINE_STATUS };
    }
    this.startReconnectWatchdog();
    await this.broadcastStatus();
  }

  private startReconnectWatchdog() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectTimer = setInterval(() => {
      void this.tryReconnectIfOffline();
      void this.syncSpacesFromLivePlc();
    }, 10000);
    this.reconnectTimer.unref?.();
    void this.syncSpacesFromLivePlc();
  }

  /**
   * Mirrors live PLC ParkDB [DB2] bay occupancy bits (L11..L43) into PostgreSQL parking_spaces
   * so the database and all screens always match the physical PLC state.
   */
  private async syncSpacesFromLivePlc() {
    if (!(this.controller instanceof SiemensS7Adapter) || !this.controller.isConnected()) return;
    try {
      const plcSpaces = await this.controller.getParkingStatus();
      if (!plcSpaces || plcSpaces.length === 0) return;
      let changed = false;
      const spaceRepo = this.cmdRepo.manager.getRepository(ParkingSpaceEntity);
      for (const item of plcSpaces) {
        const sp = await spaceRepo.findOne({ where: { spaceNumber: item.controllerRef.toUpperCase() } });
        if (!sp) continue;
        if (
          sp.status === SpaceStatus.RESERVED ||
          sp.status === SpaceStatus.MOVING ||
          sp.status === SpaceStatus.MAINTENANCE ||
          sp.status === SpaceStatus.BLOCKED
        ) {
          continue;
        }
        if (!item.occupied && sp.status === SpaceStatus.OCCUPIED) {
          await spaceRepo.update(sp.id, {
            status: SpaceStatus.AVAILABLE,
            vehicleId: null,
            parkedByUserId: null,
            parkedByUsername: null,
            isOtherVehicle: false,
            statusReason: null,
          });
          changed = true;
        } else if (item.occupied && sp.status === SpaceStatus.AVAILABLE) {
          await spaceRepo.update(sp.id, { status: SpaceStatus.OCCUPIED, statusReason: null });
          changed = true;
        }
      }
      if (changed) {
        this.cache.invalidatePrefix('parking:');
        this.cache.invalidatePrefix('vehicles:');
        this.realtime.emitToAll('parking.space.updated', { syncedFromPlc: true });
      }
    } catch {
      // Non-fatal; retry on next poll interval
    }
  }

  private async tryReconnectIfOffline() {
    if (this.destroyed || this.reconnecting || !this.controller || this.controller.isConnected()) return;
    this.reconnecting = true;
    try {
      await this.controller.connect();
      this.lastControllerStatus = await this.controller.getSystemStatus();
      const activeAlarms = await this.controller.getActiveAlarms();
      await this.alarms.syncControllerAlarms(activeAlarms);
      this.logger.log(`Industrial controller (${this.controller.protocol}) reconnected automatically.`);
      await this.broadcastStatus();
    } catch {
      // Controller still unreachable; next watchdog tick will retry
    } finally {
      this.reconnecting = false;
    }
  }

  private async teardownAdapter() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.unsubscribeController) {
      this.unsubscribeController();
      this.unsubscribeController = null;
    }
    if (this.controller) {
      await this.controller.disconnect().catch(() => undefined);
      this.controller = null;
    }
  }

  private async handleControllerEvent(ev: ControllerEvent) {
    if (this.destroyed) return;
    try {
      if (ev.type === 'STATUS') {
        this.lastControllerStatus = ev.status;
        await this.broadcastStatus();
      } else if (ev.type === 'CONNECTION') {
        if (!ev.connected) {
          this.lastControllerStatus = { ...OFFLINE_STATUS };
          const st = await this.getSystemStatus();
          this.realtime.emitToAll('controller.offline', st);
          await this.audit.recordEvent({
            eventType: 'CONTROLLER_OFFLINE',
            category: EventCategory.PLC,
            severity: AlarmSeverity.WARNING,
            message: ev.reason ?? 'Controller disconnected',
            source: 'INDUSTRIAL_SERVICE',
          });
        } else {
          if (this.controller) {
            this.lastControllerStatus = await this.controller.getSystemStatus().catch(() => ({ ...OFFLINE_STATUS }));
          }
          const st = await this.getSystemStatus();
          this.realtime.emitToAll('controller.online', st);
          await this.audit.recordEvent({
            eventType: 'CONTROLLER_ONLINE',
            category: EventCategory.PLC,
            severity: AlarmSeverity.INFO,
            message: 'Controller connected',
            source: 'INDUSTRIAL_SERVICE',
          });
        }
        await this.broadcastStatus();
      } else if (ev.type === 'ALARMS') {
        await this.alarms.syncControllerAlarms(ev.alarms);
        await this.broadcastStatus();
      } else if (ev.type === 'COMMAND') {
        for (const h of this.feedbackHandlers) {
          await h(ev.feedback).catch((err) => this.logger.error('Command feedback handler failed', err));
        }
      }
    } catch {
      if (!this.destroyed) {
        /* ignore transient errors during shutdown */
      }
    }
  }

  async getSystemStatus() {
    const { settings } = await this.getRuntimeSettings();
    if (this.controller) {
      this.lastControllerStatus = await this.controller.getSystemStatus().catch(() => ({ ...OFFLINE_STATUS }));
    } else {
      this.lastControllerStatus = { ...OFFLINE_STATUS };
    }

    const cs = this.lastControllerStatus;
    const now = Date.now();
    const hbAge = cs.lastHeartbeat ? Math.max(0, now - cs.lastHeartbeat.getTime()) : null;
    const hbStale = hbAge !== null && hbAge > settings.heartbeatTimeoutMs * 2;
    const alarmCounts = await this.alarms.countUnresolved();

    let state: 'ONLINE' | 'WARNING' | 'ERROR' | 'OFFLINE' = 'ONLINE';
    let message: string | null = null;
    if (cs.emergencyStop) {
      state = 'ERROR';
      message = 'Emergency Stop is active';
    } else if (!cs.connected || !cs.plcConnected) {
      state = 'OFFLINE';
      message = 'Industrial controller is offline';
    } else if (!cs.safetyOk) {
      state = 'ERROR';
      message = 'Safety interlock tripped';
    } else if (cs.machineState === 'FAULT' || alarmCounts.critical > 0) {
      state = 'ERROR';
      message = 'Critical fault / alarm active';
    } else if (hbStale || !cs.systemReady || alarmCounts.total > 0) {
      state = 'WARNING';
      message = !cs.systemReady ? 'System not ready' : alarmCounts.total > 0 ? 'Active warning alarm(s)' : 'Heartbeat delayed';
    }

    const communication: 'OK' | 'DEGRADED' | 'LOST' = !cs.connected ? 'LOST' : hbStale ? 'DEGRADED' : 'OK';

    return {
      mode: this.cfg.mode,
      adapter: settings.protocol,
      state,
      controllerConnected: cs.connected,
      plcConnected: cs.plcConnected,
      machineState: cs.machineState,
      emergencyStop: cs.emergencyStop,
      safetyOk: cs.safetyOk,
      systemReady: cs.systemReady,
      communication,
      lastHeartbeat: iso(cs.lastHeartbeat),
      heartbeatAgeMs: hbAge,
      activeCommandId: cs.activeCommandId,
      lastUpdate: new Date().toISOString(),
      message,
    };
  }

  async broadcastStatus() {
    const st = await this.getSystemStatus();
    const sig = `${st.state}:${st.machineState}:${st.controllerConnected}:${st.emergencyStop}:${st.safetyOk}:${st.activeCommandId}`;
    if (sig !== this.lastPublishedState) {
      this.lastPublishedState = sig;
      this.realtime.emitToAll('system.status.changed', st);
    }
    return st;
  }

  /**
   * Dispatches a command to the active adapter (NEVER retries automatically!).
   */
  async dispatchCommand(cmd: ControllerCommand): Promise<void> {
    if (!this.controller || !this.controller.isConnected()) {
      throw new AppError('SYSTEM_OFFLINE', 'Industrial controller is offline');
    }
    const { settings } = await this.getRuntimeSettings();
    if (settings.readOnly) {
      throw new AppError('CONTROLLER_READ_ONLY', 'Industrial integration is in read-only monitoring mode');
    }
    if (this.cfg.mode === 'PRODUCTION' && !this.cfg.industrial.writeEnabled) {
      throw new AppError('WRITE_DISABLED', 'Physical PLC writes are disabled (set INDUSTRIAL_WRITE_ENABLED=true after commissioning)');
    }
    // If live VNC bridge is connected to the Siemens KTP400 Basic (192.168.0.30:5900), tap the spot button on the HMI screen!
    if (this.vncBridge.getStatus().connected) {
      await this.vncBridge.tapSpot(cmd.spaceNumber).catch(() =>
        this.vncBridge.tapSpot(cmd.controllerRef).catch(() => undefined),
      );
    }
    if (cmd.type === RequestType.PARK) {
      await this.controller.sendParkCommand(cmd);
    } else {
      await this.controller.sendRetrieveCommand(cmd);
    }
  }

  /* ───────────────────────── Industrial Command Log Queries ───────────────────────── */

  async listCommands(q: PaginationQuery & { status?: CommandStatus; type?: RequestType }) {
    const { page, limit, skip, take } = pageParams(q);
    const qb = this.cmdRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.requestedByUser', 'u')
      .orderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(take);
    if (q.status) qb.andWhere('c.status = :st', { st: q.status });
    if (q.type) qb.andWhere('c.command_type = :tp', { tp: q.type });
    const [rows, total] = await qb.getManyAndCount();
    return paginated(rows.map((r) => this.toCommandDto(r)), total, page, limit);
  }

  async getCommand(idOrCommandId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCommandId);
    const cmd = await this.cmdRepo.findOne({
      where: isUuid ? [{ id: idOrCommandId }, { commandId: idOrCommandId }] : { commandId: idOrCommandId },
      relations: ['requestedByUser'],
    });
    if (!cmd) throw AppError.notFound('Industrial command');
    return this.toCommandDto(cmd);
  }

  toCommandDto(c: IndustrialCommandEntity) {
    return {
      id: c.id,
      commandId: c.commandId,
      commandType: c.commandType,
      status: c.status,
      requestedBy: c.requestedBy
        ? { id: c.requestedBy, fullName: c.requestedByUser?.fullName ?? 'Authorized User' }
        : null,
      vehicleId: c.vehicleId,
      parkingSpaceId: c.parkingSpaceId,
      parkingRequestId: c.parkingRequestId,
      payload: c.payload,
      controllerResponse: c.controllerResponse,
      progress: c.progress,
      phase: c.phase,
      createdAt: iso(c.createdAt),
      sentAt: iso(c.sentAt),
      acknowledgedAt: iso(c.acknowledgedAt),
      completedAt: iso(c.completedAt),
      errorMessage: c.errorMessage,
    };
  }
}

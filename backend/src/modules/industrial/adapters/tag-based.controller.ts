import { AlarmSeverity, Protocol } from '../../../common/enums';
import {
  CommandFeedback, ConnectionTestResult, ControllerAlarm, ControllerCommand, ControllerError, ControllerEvent,
  ControllerEventListener, ControllerSpaceStatus, ControllerStatus, IndustrialController, MachineState, OFFLINE_STATUS,
} from '../industrial-controller.interface';
import { IntegrationSettings, REQUIRED_COMMAND_TAGS, REQUIRED_READ_TAGS, TagDefinition, TagKey } from '../integration-settings';

/** Low level I/O implemented per protocol (S7 / Modbus / OPC UA). */
export interface TagIO {
  open(): Promise<void>;
  close(): Promise<void>;
  read(tags: Partial<Record<TagKey, TagDefinition>>): Promise<Partial<Record<TagKey, unknown>>>;
  write(values: Array<{ key: TagKey; tag: TagDefinition; value: number | boolean | string }>): Promise<void>;
}

const MACHINE_STATES: Record<number, MachineState> = {
  0: 'UNKNOWN', 1: 'IDLE', 2: 'BUSY', 3: 'FAULT', 4: 'EMERGENCY_STOP', 5: 'MAINTENANCE',
};

/**
 * Generic tag-handshake controller.
 *
 * PROPOSED HANDSHAKE (must be confirmed with the Auto Park supplier before enabling writes):
 *   1. Backend checks system_ready_tag = TRUE, emergency_status_tag = FALSE, safety_ok_tag = TRUE.
 *   2. Backend writes command_id_tag = <sequence>, target_space_tag = <bay>, then sets park_command_tag / retrieve_command_tag = TRUE.
 *   3. PLC validates & echoes the sequence in command_acknowledgement_tag  → ACKNOWLEDGED. Backend resets the request bit.
 *   4. PLC runs the movement (machine_state_tag = BUSY, vehicle_position_tag = progress)      → EXECUTING.
 *   5. PLC echoes the sequence in command_complete_tag                         → COMPLETED.
 *      OR command_error_tag ≠ 0 while acknowledgement = sequence              → FAILED.
 *   The backend NEVER re-writes a request bit for the same sequence (no automatic resend).
 */
export abstract class TagBasedController implements IndustrialController {
  abstract readonly protocol: Protocol;
  readonly capabilities = { idempotentCommands: false, spaceSync: false, pushEvents: false };

  protected listeners = new Set<ControllerEventListener>();
  protected connected = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastHeartbeatValue: unknown = undefined;
  private lastHeartbeatAt: Date | null = null;
  private lastValues: Partial<Record<TagKey, unknown>> = {};
  /** commandId -> sequence, for commands issued by this process. */
  private active = new Map<string, { sequence: number; feedback: CommandFeedback; requestBit: TagKey; bitReset: boolean }>();
  private polling = false;

  protected constructor(protected readonly settings: IntegrationSettings, protected readonly writeEnabled: boolean) {
    this.capabilities = { ...this.capabilities, idempotentCommands: settings.supportsIdempotentCommands };
  }

  protected abstract createIO(): TagIO;
  private io: TagIO | null = null;

  async connect(): Promise<void> {
    const missing = REQUIRED_READ_TAGS.filter((k) => !this.settings.tagMap[k]?.address);
    if (missing.length) throw new ControllerError(`Tag map incomplete — missing: ${missing.join(', ')}`, 'NOT_CONFIGURED');
    this.io = this.createIO();
    await this.io.open();
    this.connected = true;
    this.emit({ type: 'CONNECTION', connected: true });
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    try {
      await this.io?.close();
    } finally {
      this.io = null;
      if (this.connected) this.emit({ type: 'CONNECTION', connected: false, reason: 'disconnect requested' });
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getSystemStatus(): Promise<ControllerStatus> {
    if (!this.connected) return { ...OFFLINE_STATUS };
    const v = this.lastValues;
    const machineState = MACHINE_STATES[Number(v.machine_state_tag ?? 0)] ?? 'UNKNOWN';
    const emergencyStop = Boolean(v.emergency_status_tag);
    const safetyOk = this.settings.tagMap.safety_ok_tag ? Boolean(v.safety_ok_tag) : !emergencyStop;
    const running = [...this.active.entries()].find(([, a]) => !['COMPLETED', 'FAILED'].includes(a.feedback.status));
    return {
      connected: true,
      plcConnected: true,
      systemReady: Boolean(v.system_ready_tag),
      emergencyStop,
      safetyOk,
      machineState,
      lastHeartbeat: this.lastHeartbeatAt,
      activeCommandId: running?.[0] ?? null,
      raw: { ...v },
    };
  }

  async getParkingStatus(): Promise<ControllerSpaceStatus[] | null> {
    return null; // bay mapping is plant-specific — enable once the supplier's tag list is known
  }

  sendParkCommand(cmd: ControllerCommand): Promise<void> {
    return this.writeCommand(cmd, 'park_command_tag');
  }

  sendRetrieveCommand(cmd: ControllerCommand): Promise<void> {
    return this.writeCommand(cmd, 'retrieve_command_tag');
  }

  private async writeCommand(cmd: ControllerCommand, bit: TagKey): Promise<void> {
    if (!this.connected || !this.io) throw new ControllerError('Controller not connected', 'NOT_CONNECTED');
    if (!this.writeEnabled || this.settings.readOnly) throw new ControllerError('Writes disabled by configuration', 'REJECTED');
    const missing = REQUIRED_COMMAND_TAGS.filter((k) => !this.settings.tagMap[k]?.address);
    if (missing.length) throw new ControllerError(`Command tags not configured: ${missing.join(', ')}`, 'NOT_CONFIGURED');
    if (this.active.has(cmd.commandId)) return; // never write the same command twice
    const map = this.settings.tagMap;
    const target = Number.parseInt(cmd.controllerRef, 10);
    if (!Number.isFinite(target)) throw new ControllerError(`Bay ${cmd.spaceNumber} has no numeric controllerRef`, 'NOT_CONFIGURED');

    this.active.set(cmd.commandId, { sequence: cmd.sequence, requestBit: bit, bitReset: false, feedback: { commandId: cmd.commandId, status: 'RECEIVED', progress: 0 } });
    try {
      await this.io.write([
        { key: 'command_id_tag', tag: map.command_id_tag!, value: cmd.sequence },
        { key: 'target_space_tag', tag: map.target_space_tag!, value: target },
      ]);
      await this.io.write([{ key: bit, tag: map[bit]!, value: true }]);
    } catch (e) {
      this.active.delete(cmd.commandId);
      throw new ControllerError(`Write failed: ${(e as Error).message}`, 'WRITE_FAILED');
    }
  }

  async getCommandStatus(commandId: string): Promise<CommandFeedback> {
    const a = this.active.get(commandId);
    return a ? { ...a.feedback } : { commandId, status: 'UNKNOWN' };
  }

  async getActiveAlarms(): Promise<ControllerAlarm[]> {
    return this.decodeAlarms(this.lastValues.alarm_tag);
  }

  subscribeToEvents(listener: ControllerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const t = Date.now();
    const io = this.createIO();
    try {
      await io.open();
      const tags: Partial<Record<TagKey, TagDefinition>> = {};
      for (const k of REQUIRED_READ_TAGS) if (this.settings.tagMap[k]?.address) tags[k] = this.settings.tagMap[k];
      const values = Object.keys(tags).length ? await io.read(tags) : {};
      return { ok: true, message: `Connected. Read ${Object.keys(values).length} tag(s).`, latencyMs: Date.now() - t };
    } catch (e) {
      return { ok: false, message: (e as Error).message, latencyMs: null };
    } finally {
      await io.close().catch(() => undefined);
    }
  }

  /* ───────────── polling loop ───────────── */
  private startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => void this.poll(), Math.max(200, this.settings.pollIntervalMs));
    this.pollTimer.unref?.();
    void this.poll();
  }

  private async poll() {
    if (this.polling || !this.io) return;
    this.polling = true;
    try {
      const readable: Partial<Record<TagKey, TagDefinition>> = {};
      for (const [k, def] of Object.entries(this.settings.tagMap) as Array<[TagKey, TagDefinition]>) {
        if (def?.address && def.access !== 'W') readable[k] = def;
      }
      const values = await this.io.read(readable);
      const prevAlarm = this.lastValues.alarm_tag;
      this.lastValues = values;
      if (values.heartbeat_tag !== this.lastHeartbeatValue) {
        this.lastHeartbeatValue = values.heartbeat_tag;
        this.lastHeartbeatAt = new Date();
      }
      await this.processHandshake(values);
      if (prevAlarm !== values.alarm_tag) this.emit({ type: 'ALARMS', alarms: this.decodeAlarms(values.alarm_tag) });
      this.emit({ type: 'STATUS', status: await this.getSystemStatus() });
    } catch (e) {
      this.emit({ type: 'LOG', level: 'error', message: `Poll failed: ${(e as Error).message}` });
      if (this.connected) {
        this.connected = false;
        this.emit({ type: 'CONNECTION', connected: false, reason: (e as Error).message });
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    } finally {
      this.polling = false;
    }
  }

  private async processHandshake(v: Partial<Record<TagKey, unknown>>) {
    const ack = Number(v.command_acknowledgement_tag ?? -1);
    const done = Number(v.command_complete_tag ?? -1);
    const err = Number(v.command_error_tag ?? 0);
    const progress = v.vehicle_position_tag !== undefined ? Math.max(0, Math.min(100, Number(v.vehicle_position_tag))) : undefined;
    for (const [commandId, a] of this.active) {
      if (['COMPLETED', 'FAILED'].includes(a.feedback.status)) continue;
      let next: Partial<CommandFeedback> | null = null;
      if (done === a.sequence) next = { status: 'COMPLETED', progress: 100 };
      else if (ack === a.sequence && err !== 0) next = { status: 'FAILED', errorCode: `PLC_${err}`, errorMessage: `Controller reported error ${err}` };
      else if (ack === a.sequence && v.machine_state_tag !== undefined && Number(v.machine_state_tag) === 2) next = { status: 'EXECUTING', progress };
      else if (ack === a.sequence && a.feedback.status === 'RECEIVED') next = { status: 'ACKNOWLEDGED' };
      else if (a.feedback.status === 'EXECUTING' && progress !== undefined && progress !== a.feedback.progress) next = { status: 'EXECUTING', progress };

      if (ack === a.sequence && !a.bitReset && this.io) {
        // reset the request bit once the PLC has latched the command
        a.bitReset = true;
        await this.io.write([{ key: a.requestBit, tag: this.settings.tagMap[a.requestBit]!, value: false }]).catch((e) =>
          this.emit({ type: 'LOG', level: 'error', message: `Failed to reset ${a.requestBit}: ${(e as Error).message}` }),
        );
      }
      if (next && (next.status !== a.feedback.status || next.progress !== a.feedback.progress)) {
        a.feedback = { ...a.feedback, ...next, raw: { ack, done, err } };
        this.emit({ type: 'COMMAND', feedback: { ...a.feedback } });
      }
    }
  }

  private decodeAlarms(raw: unknown): ControllerAlarm[] {
    const mask = Number(raw ?? 0);
    if (!Number.isFinite(mask) || mask === 0) return [];
    const out: ControllerAlarm[] = [];
    for (let bit = 0; bit < 32; bit++) {
      if ((mask & (1 << bit)) === 0) continue;
      const def = this.settings.alarmDefinitions.find((d) => d.bit === bit);
      out.push(
        def
          ? { code: def.code, severity: def.severity as AlarmSeverity, description: def.description, source: 'PLC' }
          : { code: `PLC_ALARM_BIT_${bit}`, severity: AlarmSeverity.CRITICAL, description: `Undefined PLC alarm bit ${bit} (add it to the alarm definitions)`, source: 'PLC' },
      );
    }
    return out;
  }

  protected emit(e: ControllerEvent) {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        /* ignore */
      }
    }
  }
}

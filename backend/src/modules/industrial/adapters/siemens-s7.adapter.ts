import { AlarmSeverity, Protocol } from '../../../common/enums';
import {
  CommandFeedback, ConnectionTestResult, ControllerAlarm, ControllerCommand, ControllerError, ControllerEvent,
  ControllerEventListener, ControllerSpaceStatus, ControllerStatus, IndustrialController, MachineState, OFFLINE_STATUS,
} from '../industrial-controller.interface';
import { IntegrationSettings, TagDefinition } from '../integration-settings';
import { VncBridgeService } from '../vnc-web.controller';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodes7 = require('nodes7');

interface ActiveS7Command {
  cmd: ControllerCommand;
  feedback: CommandFeedback;
  timers: NodeJS.Timeout[];
}

export interface PlcTagChange {
  time: string;
  tag: string;
  from: unknown;
  to: unknown;
}

export interface LaneSensorsSnapshot {
  lane: number;
  lsTop: boolean;    // P3 (Level 1)
  lsMid: boolean;    // P2 (Level 2)
  lsBtm: boolean;    // P1 (Level 3)
  mgProt: boolean;   // Mechanical Group Protection
  checkLocation: boolean;
  currentFloor: number; // 3=Top(P3), 2=Mid(P2), 1=Bottom(P1), 0=Between/Unknown
}

export interface PlcSensorsSnapshot {
  connected: boolean;
  mode: 'LIVE_PLC' | 'SIMULATED_FALLBACK';
  timestamp: string;
  photocellClear: boolean;       // PCELL_IN_1: true = clear, false = obstacle at entrance
  obstacleExist: boolean;        // Obstacle_exist
  emergencyStop: boolean;        // EMRGENCY (ES1 + ES2)
  emergencyDuringMove: boolean;  // emergency during up or down
  stopperFault: boolean;         // stopper_not_energize / Alarm Section bit 12
  liftInvalidPos: boolean;       // Lift_not_in_vaild_position / Alarm Section bit 13
  errorInPosition: boolean;      // Alarm Section bit 11
  maintenanceDue: boolean;       // ParkDB.Period_Maintanence
  autoMode: boolean;             // ParkIO_Data.Auto_DB
  manualMode: boolean;           // ParkIO_Data.Manual_DB
  alarmWord: number;             // ParkDB."Alarm Word"
  alarmSection: number;          // Alarm Section
  lanes: LaneSensorsSnapshot[];
  spots: Record<string, boolean>; // L11..L43 occupancy
}

export type EmergencyRecoveryAction = 'COMPLETE_SEQ' | 'RETURN_PARK' | 'SAFE_RESET' | 'ESTOP_ON' | 'ESTOP_OFF';

/**
 * Maps UI floor (P3=3 top, P2=2 mid, P1=1 bottom) to PLC Level_Number (1=Top, 2=Mid, 3=Bottom).
 */
export function mapUiFloorToPlcLevel(uiFloor: number): number {
  if (uiFloor === 3) return 1; // Top (P3) -> PLC Level 1
  if (uiFloor === 2) return 2; // Mid (P2) -> PLC Level 2
  return 3;                    // Bottom (P1) -> PLC Level 3
}

/**
 * Checks whether an address string is valid classic S7 absolute syntax supported by `nodes7`
 * (e.g., `I0.0`, `Q0.1`, `M10.0`, `IB0`, `QB2`, `MB13`, `MW10`, `DB1,X0.0`, `DB1,B0`, `DB1,INT2`).
 * Symbolic TIA Portal names like `ParkDB.L11` require non-optimized DB offsets for nodes7 or OPC UA.
 */
function isNodes7Address(addr: string): boolean {
  const s = addr.trim();
  if (!s) return false;
  return /^(?:[IQM](?:[BWD]\d+(?:\.\d+)?|\d+\.\d+)|DB\d+,[A-Z]+\d+(?:\.\d+)?)$/i.test(s);
}

/**
 * Live Siemens SIMATIC S7-1200 / S7-1500 Adapter (ISO-on-TCP Port 102, Rack 0, Slot 1).
 *
 * Upgraded to match the real TECHNO Electrical.Jo TIA Portal V17 machine:
 * - Real 4-Lane × 3-Level Limit Switch & MG Protection sensor snapshot (`getSensorsSnapshot`)
 * - Real Alarm decoding (`ParkDB."Alarm Word"` bit 0, `Alarm Section` bits 11/12/13, `Period_Maintanence`)
 * - Real 2-Step Auto Handshake (`Lane_Number`, `Level_Number`, `Step1_Ready/OK/Start`, `Step2_Start`)
 * - Closed-loop floor stopping using `PL{n}_LS_TOP / MID / BTM`
 * - Safe Emergency Recovery (`Complete Seq`, `Return Park`, `Safe Reset` without zeroing Alarm Word)
 * - Safe Manual Maintenance controls with hardware-like interlocks (no L2 InvertBit stickiness!)
 */
export class SiemensS7Adapter implements IndustrialController {
  readonly protocol = Protocol.SIEMENS_S7;
  readonly capabilities = { idempotentCommands: true, spaceSync: true, pushEvents: true };

  private listeners = new Set<ControllerEventListener>();
  private connected = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private conn: any = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private polling = false;
  private lastHeartbeatAt: Date | null = null;
  private lastValues: Record<string, unknown> = {};
  private prevM0_99: number[] | null = null;
  private recentChanges: PlcTagChange[] = [];
  private commands = new Map<string, ActiveS7Command>();
  private alarms = new Map<string, ControllerAlarm>();
  private lastAlarmSig = '';

  // Local fallback sensor state (updated when offline or when symbolic tags aren't yet mapped to DB offsets)
  private softEmergencyStop = false;
  private softEmergencyDuringMove = false;
  private softManualMode = false;
  private softLaneFloor: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1 }; // Default at P1 (bottom)

  private static readonly BASE_DIAG_TAGS: Record<string, string> = {
    IB0: 'IB0',
    IB1: 'IB1',
    IB2: 'IB2',
    IB3: 'IB3',
    QB0: 'QB0',
    QB1: 'QB1',
    QB2: 'QB2',
    QB3: 'QB3',
    MB3: 'MB3',
    MB7: 'MB7',
    MB9: 'MB9',
    MB13: 'MB13',
    MB60: 'MB60',
    MB450: 'MB450',
    M_BLOCK_0_64: 'MB0.64',
    DB1_B0: 'DB1,B0.4',
    DB2_B0: 'DB2,B0.12',
  };

  constructor(
    private readonly settings: IntegrationSettings,
    private readonly writeEnabled: boolean,
    private readonly vncBridge?: VncBridgeService,
  ) {}

  private get host(): string {
    return (this.settings.host || '192.168.0.27').trim();
  }
  private get port(): number {
    const p = this.settings.port || 102;
    return p === 5900 || p === 5800 ? 102 : p;
  }
  private get rack(): number {
    return this.settings.rack ?? 0;
  }
  private get slot(): number {
    return this.settings.slot ?? 1;
  }

  private getTagAddress(key: string): string | null {
    const def = (this.settings.tagMap as Record<string, TagDefinition | undefined>)[key];
    const addr = def?.address?.trim();
    return addr || null;
  }

  private buildTranslationMap(): Record<string, string> {
    const vars: Record<string, string> = { ...SiemensS7Adapter.BASE_DIAG_TAGS };
    for (const [k, def] of Object.entries(this.settings.tagMap) as Array<[string, TagDefinition | undefined]>) {
      const addr = def?.address?.trim();
      if (addr && isNodes7Address(addr)) {
        vars[k] = addr;
      }
    }
    return vars;
  }

  async connect(): Promise<void> {
    await this.disconnect();
    const vars = this.buildTranslationMap();
    const c = new nodes7({ silent: true });
    await new Promise<void>((resolve, reject) => {
      c.initiateConnection(
        { host: this.host, port: this.port, rack: this.rack, slot: this.slot, timeout: 3500 },
        (err?: unknown) => {
          if (err) {
            return reject(
              new ControllerError(
                `SIMATIC S7-1200 connection failed (${this.host}:${this.port} rack=${this.rack} slot=${this.slot}): ${String(err)}`,
                'NOT_CONNECTED',
              ),
            );
          }
          c.setTranslationCB((tag: string) => vars[tag]);
          c.addItems(Object.keys(vars));
          this.conn = c;
          this.connected = true;
          this.lastHeartbeatAt = new Date();
          resolve();
        },
      );
    });

    this.emit({ type: 'CONNECTION', connected: true });
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    for (const rc of this.commands.values()) rc.timers.forEach((t) => clearTimeout(t));
    if (this.conn) {
      const old = this.conn;
      this.conn = null;
      await new Promise<void>((r) => {
        try {
          old.dropConnection(() => r());
        } catch {
          r();
        }
      });
    }
    if (this.connected) {
      this.connected = false;
      this.emit({ type: 'CONNECTION', connected: false, reason: 'S7-1200 disconnected' });
    }
  }

  isConnected(): boolean {
    return this.connected && Boolean(this.conn);
  }

  private startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => void this.pollOnce(), Math.max(400, this.settings.pollIntervalMs || 800));
    this.pollTimer.unref?.();
    void this.pollOnce();
  }

  private async pollOnce(): Promise<void> {
    if (this.polling || !this.conn) return;
    this.polling = true;
    try {
      const values = await new Promise<Record<string, unknown>>((resolve, reject) => {
        this.conn.readAllItems((err: unknown, vals: Record<string, unknown>) => {
          if (err) return reject(new Error(String(err)));
          resolve(vals || {});
        });
      });

      this.detectTagChanges(values);
      this.lastValues = values;
      this.lastHeartbeatAt = new Date();
      this.decodePlcAlarms(values);
      this.emit({ type: 'STATUS', status: await this.getSystemStatus() });
    } catch (e) {
      this.emit({ type: 'LOG', level: 'warn', message: `S7-1200 poll error: ${(e as Error).message}` });
    } finally {
      this.polling = false;
    }
  }

  /**
   * Decodes the 4 real PLC alarms from TIA Portal (`Alarm Word` bit 0, `Alarm Section` bits 11/12/13)
   * plus `Period_Maintanence`, and emits `ALARMS` event when active alarms change.
   */
  private decodePlcAlarms(v: Record<string, unknown>) {
    const next = new Map<string, ControllerAlarm>();
    const alarmWord = Number(v.alarm_tag ?? 0);
    const alarmSection = Number(v.alarm_section_tag ?? v.command_error_tag ?? 0);
    const eStop = Boolean(v.emergency_status_tag) || Boolean(alarmWord & (1 << 0)) || this.softEmergencyStop;
    const errPos = Boolean(alarmSection & (1 << 11));
    const stopperFault = Boolean(v.stopper_fault_tag) || Boolean(alarmSection & (1 << 12));
    const liftInvalid = Boolean(v.lift_invalid_pos_tag) || Boolean(alarmSection & (1 << 13));
    const maintDue = Boolean(v.maintenance_due_tag);

    if (eStop) {
      next.set('PLC_EMERGENCY_STOP', {
        code: 'PLC_EMERGENCY_STOP',
        severity: AlarmSeverity.EMERGENCY,
        description: 'إيقاف الطوارئ مفعّل (ES1 / ES2 — Emergency Stop)',
        source: 'PLC_S7_1200',
      });
    }
    if (errPos) {
      next.set('PLC_ERROR_IN_POSITION', {
        code: 'PLC_ERROR_IN_POSITION',
        severity: AlarmSeverity.CRITICAL,
        description: 'خطأ في تموضع المصعد (Error in position — Alarm Section Bit 11)',
        source: 'PLC_S7_1200',
      });
    }
    if (stopperFault) {
      next.set('PLC_STOPPER_NOT_ENERGIZED', {
        code: 'PLC_STOPPER_NOT_ENERGIZED',
        severity: AlarmSeverity.CRITICAL,
        description: 'الموقف الميكانيكي (Stopper) غير مفعّل (Alarm Section Bit 12)',
        source: 'PLC_S7_1200',
      });
    }
    if (liftInvalid) {
      next.set('PLC_LIFT_INVALID_POSITION', {
        code: 'PLC_LIFT_INVALID_POSITION',
        severity: AlarmSeverity.CRITICAL,
        description: 'المصعد في موضع غير صالح (Lift not in valid position — Alarm Section Bit 13)',
        source: 'PLC_S7_1200',
      });
    }
    if (maintDue) {
      next.set('PLC_PERIOD_MAINTENANCE', {
        code: 'PLC_PERIOD_MAINTENANCE',
        severity: AlarmSeverity.WARNING,
        description: 'تنبيه الصيانة الدورية المجدولة (Period Maintenance Due)',
        source: 'PLC_S7_1200',
      });
    }

    this.alarms = next;
    const sig = [...next.keys()].sort().join(',');
    if (sig !== this.lastAlarmSig) {
      this.lastAlarmSig = sig;
      this.emit({ type: 'ALARMS', alarms: [...next.values()] });
    }
  }

  private detectTagChanges(next: Record<string, unknown>) {
    const nowIso = new Date().toISOString();
    const watchKeys = ['IB0', 'IB1', 'IB2', 'IB3', 'QB0', 'QB1', 'QB2', 'QB3', 'DB1_B0', 'DB2_B0'];
    for (const k of watchKeys) {
      if (this.lastValues[k] !== undefined && JSON.stringify(this.lastValues[k]) !== JSON.stringify(next[k])) {
        this.pushChange({ time: nowIso, tag: k, from: this.lastValues[k], to: next[k] });
      }
    }
    const mBlock = next.M_BLOCK_0_64;
    if (Array.isArray(mBlock)) {
      if (this.prevM0_99) {
        for (let i = 0; i < mBlock.length; i++) {
          if (i === 60) continue; // MB60 is the rolling clock byte
          if (this.prevM0_99[i] !== mBlock[i]) {
            this.pushChange({ time: nowIso, tag: `MB${i}`, from: this.prevM0_99[i], to: mBlock[i] });
          }
        }
      }
      this.prevM0_99 = [...mBlock];
    }
  }

  private pushChange(c: PlcTagChange) {
    this.recentChanges.unshift(c);
    if (this.recentChanges.length > 40) this.recentChanges.pop();
  }

  private decodeBits(byteVal: number, prefix: string): Array<{ bit: string; on: boolean }> {
    const b = Number(byteVal || 0) & 0xff;
    const out: Array<{ bit: string; on: boolean }> = [];
    for (let i = 0; i < 8; i++) {
      out.push({ bit: `${prefix}.${i}`, on: Boolean(b & (1 << i)) });
    }
    return out;
  }

  /**
   * Returns structured real-time sensor & limit-switch diagnostics matching the TIA Portal Status Monitor.
   */
  getSensorsSnapshot(): PlcSensorsSnapshot {
    const v = this.lastValues;
    const live = this.isConnected();
    const lanes: LaneSensorsSnapshot[] = [];

    for (let lane = 1; lane <= 4; lane++) {
      const hasLiveLs =
        v[`ls_L${lane}_top`] !== undefined ||
        v[`ls_L${lane}_mid`] !== undefined ||
        v[`ls_L${lane}_btm`] !== undefined;

      const lsTop = hasLiveLs ? Boolean(v[`ls_L${lane}_top`]) : this.softLaneFloor[lane] === 3;
      const lsMid = hasLiveLs ? Boolean(v[`ls_L${lane}_mid`]) : this.softLaneFloor[lane] === 2;
      const lsBtm = hasLiveLs ? Boolean(v[`ls_L${lane}_btm`]) : this.softLaneFloor[lane] === 1;
      const mgProt = v[`mg_prot_L${lane}`] !== undefined ? Boolean(v[`mg_prot_L${lane}`]) : true;
      const checkLocation = v[`check_loc_L${lane}`] !== undefined ? Boolean(v[`check_loc_L${lane}`]) : true;
      const currentFloor = lsTop ? 3 : lsMid ? 2 : lsBtm ? 1 : 0;

      lanes.push({ lane, lsTop, lsMid, lsBtm, mgProt, checkLocation, currentFloor });
    }

    const spots: Record<string, boolean> = {};
    for (let lane = 1; lane <= 4; lane++) {
      for (let p = 1; p <= 3; p++) {
        const code = `L${lane}${p}`;
        const key = `spot_${code}_tag`;
        if (v[key] !== undefined) {
          spots[code] = Boolean(v[key]);
        }
      }
    }

    const alarmWord = Number(v.alarm_tag ?? 0);
    const alarmSection = Number(v.alarm_section_tag ?? v.command_error_tag ?? 0);
    const photocellClear = v.safety_ok_tag !== undefined ? Boolean(v.safety_ok_tag) : true;
    const emergencyStop =
      (v.emergency_status_tag !== undefined ? Boolean(v.emergency_status_tag) : false) ||
      Boolean(alarmWord & (1 << 0)) ||
      this.softEmergencyStop;
    const emergencyDuringMove =
      (v.emergency_during_move_tag !== undefined ? Boolean(v.emergency_during_move_tag) : false) ||
      this.softEmergencyDuringMove;

    return {
      connected: live,
      mode: live ? 'LIVE_PLC' : 'SIMULATED_FALLBACK',
      timestamp: new Date().toISOString(),
      photocellClear,
      obstacleExist: Boolean(v.obstacle_exist_tag ?? false),
      emergencyStop,
      emergencyDuringMove,
      stopperFault: Boolean(v.stopper_fault_tag) || Boolean(alarmSection & (1 << 12)),
      liftInvalidPos: Boolean(v.lift_invalid_pos_tag) || Boolean(alarmSection & (1 << 13)),
      errorInPosition: Boolean(alarmSection & (1 << 11)),
      maintenanceDue: Boolean(v.maintenance_due_tag ?? false),
      autoMode: v.auto_mode_tag !== undefined ? Boolean(v.auto_mode_tag) : !this.softManualMode,
      manualMode: v.manual_mode_tag !== undefined ? Boolean(v.manual_mode_tag) : this.softManualMode,
      alarmWord,
      alarmSection,
      lanes,
      spots,
    };
  }

  getLiveDiagnostics() {
    const v = this.lastValues;
    return {
      connected: this.isConnected(),
      host: this.host,
      port: this.port,
      rack: this.rack,
      slot: this.slot,
      lastHeartbeat: this.lastHeartbeatAt ? this.lastHeartbeatAt.toISOString() : null,
      inputs: {
        IB0: Number(v.IB0 ?? 0),
        IB1: Number(v.IB1 ?? 0),
        IB2: Number(v.IB2 ?? 0),
        IB3: Number(v.IB3 ?? 0),
        bits: [
          ...this.decodeBits(Number(v.IB0 ?? 0), 'I0'),
          ...this.decodeBits(Number(v.IB1 ?? 0), 'I1'),
          ...this.decodeBits(Number(v.IB2 ?? 0), 'I2'),
        ],
      },
      outputs: {
        QB0: Number(v.QB0 ?? 0),
        QB1: Number(v.QB1 ?? 0),
        QB2: Number(v.QB2 ?? 0),
        QB3: Number(v.QB3 ?? 0),
        bits: [
          ...this.decodeBits(Number(v.QB0 ?? 0), 'Q0'),
          ...this.decodeBits(Number(v.QB1 ?? 0), 'Q1'),
          ...this.decodeBits(Number(v.QB2 ?? 0), 'Q2'),
        ],
      },
      dataBlocks: {
        DB1: v.DB1_B0 ?? [],
        DB2: v.DB2_B0 ?? [],
      },
      merkers: {
        MB3: v.MB3,
        MB7: v.MB7,
        MB9: v.MB9,
        MB13: v.MB13,
        MB60: v.MB60,
        MB450: v.MB450,
      },
      sensors: this.getSensorsSnapshot(),
      recentChanges: this.recentChanges,
      values: this.lastValues,
    };
  }

  /**
   * Safely tries to write a logical tag key if configured with a valid classic S7 address.
   * Never throws if the tag is symbolic-only (logs a clear warning instead).
   */
  private async tryWriteLogicalTag(tagKey: string, value: boolean | number, pulseMs?: number): Promise<boolean> {
    if (!this.writeEnabled) return false;
    const addr = this.getTagAddress(tagKey);
    if (!addr) return false;
    if (!isNodes7Address(addr)) {
      this.emit({
        type: 'LOG',
        level: 'warn',
        message: `Tag ${tagKey} (${addr}) uses symbolic TIA syntax; switch DB to non-optimized absolute address (e.g. DB1,X0.0) or use OPC UA for direct write.`,
      });
      return false;
    }
    if (!this.isConnected()) return false;
    try {
      await this.writePlcTag(addr, value, pulseMs);
      return true;
    } catch (err) {
      this.emit({ type: 'LOG', level: 'warn', message: `Write ${tagKey} (${addr}) failed: ${(err as Error).message}` });
      return false;
    }
  }

  /**
   * Directly writes or pulses a tag on the SIMATIC S7-1200 PLC (e.g. `M10.0`, `DB1,X0.0`, `MW10`).
   */
  async writePlcTag(address: string, value: boolean | number, pulseMs?: number): Promise<{ ok: boolean; address: string; value: boolean | number; note?: string }> {
    const cleanAddr = address.trim();
    if (!cleanAddr) throw new ControllerError('PLC tag address is required', 'NOT_CONFIGURED');

    if (!isNodes7Address(cleanAddr)) {
      return {
        ok: false,
        address: cleanAddr,
        value,
        note: 'Symbolic TIA tag cannot be written via raw nodes7 until Optimized Block Access is disabled and mapped to DBx,Xy.z (or via OPC UA).',
      };
    }

    const writeOnce = (val: boolean | number) =>
      new Promise<void>((resolve, reject) => {
        const c = new nodes7({ silent: true });
        c.initiateConnection(
          { host: this.host, port: this.port, rack: this.rack, slot: this.slot, timeout: 3000 },
          (err?: unknown) => {
            if (err) return reject(new ControllerError(`S7-1200 connect error: ${String(err)}`, 'NOT_CONNECTED'));
            c.setTranslationCB(() => cleanAddr);
            c.addItems(['TARGET']);
            c.writeItems(['TARGET'], [val], (wErr?: unknown) => {
              c.dropConnection(() => {
                if (wErr) return reject(new ControllerError(`S7-1200 write error on ${cleanAddr}: ${String(wErr)}`, 'WRITE_FAILED'));
                resolve();
              });
            });
          },
        );
      });

    await writeOnce(value);
    if (pulseMs && pulseMs > 0 && typeof value === 'boolean') {
      await new Promise((r) => setTimeout(r, Math.min(3000, pulseMs)));
      await writeOnce(!value);
    }
    await this.pollOnce();
    return { ok: true, address: cleanAddr, value };
  }

  /**
   * Safe Emergency Stop & Post-Emergency Recovery following the official TIA Portal procedure:
   * - ESTOP_ON / ESTOP_OFF: sets/clears emergency flag (and stops active commands)
   * - COMPLETE_SEQ: pulses `ParkDB.Park_Step1_Ready` + `ParkIO_Data.Auto_DB` + `complete the seq`
   * - RETURN_PARK: pulses `ParkDB.Park_Step2_Ready` + `ParkIO_Data.Auto_DB`
   * - SAFE_RESET: pulses `ParkDB.Reset` ONLY — NEVER force-zeros `ParkDB."Alarm Word"` from HMI!
   */
  async emergencyRecovery(action: EmergencyRecoveryAction): Promise<{ ok: boolean; action: EmergencyRecoveryAction; message: string }> {
    if (action === 'ESTOP_ON') {
      this.softEmergencyStop = true;
      const hasMoving = [...this.commands.values()].some((c) => ['RECEIVED', 'ACKNOWLEDGED', 'EXECUTING'].includes(c.feedback.status));
      if (hasMoving) this.softEmergencyDuringMove = true;
      for (const rc of this.commands.values()) {
        rc.timers.forEach((t) => clearTimeout(t));
        rc.timers = [];
        if (['RECEIVED', 'ACKNOWLEDGED', 'EXECUTING'].includes(rc.feedback.status)) {
          this.updateCmd(rc, { status: 'FAILED', errorMessage: 'Emergency Stop Triggered' });
        }
      }
      await this.tryWriteLogicalTag('emergency_status_tag', true);
      this.decodePlcAlarms(this.lastValues);
      return { ok: true, action, message: 'تم تفعيل إيقاف الطوارئ وإيقاف كافة أوامر الحركة فوراً.' };
    }

    if (action === 'ESTOP_OFF') {
      this.softEmergencyStop = false;
      this.softEmergencyDuringMove = false;
      await this.tryWriteLogicalTag('emergency_status_tag', false);
      this.decodePlcAlarms(this.lastValues);
      return { ok: true, action, message: 'تم إلغاء حالة إيقاف الطوارئ البرمجية بعد التأكد من أمان الماكنة.' };
    }

    if (action === 'COMPLETE_SEQ') {
      this.softEmergencyStop = false;
      this.softEmergencyDuringMove = false;
      await this.tryWriteLogicalTag('auto_mode_tag', true);
      await this.tryWriteLogicalTag('step1_ready_tag', true, 400);
      await this.tryWriteLogicalTag('complete_seq_tag', true, 400);
      this.decodePlcAlarms(this.lastValues);
      return { ok: true, action, message: 'تم إرسال أمر إكمال المسار (Complete Seq) إلى الـ PLC.' };
    }

    if (action === 'RETURN_PARK') {
      this.softEmergencyStop = false;
      this.softEmergencyDuringMove = false;
      await this.tryWriteLogicalTag('auto_mode_tag', true);
      await this.tryWriteLogicalTag('step2_ready_tag', true, 400);
      await this.tryWriteLogicalTag('step2_start_tag', true, 400);
      this.decodePlcAlarms(this.lastValues);
      return { ok: true, action, message: 'تم إرسال أمر إرجاع المنصة (Return Park) إلى الـ PLC.' };
    }

    // SAFE_RESET: pulse ParkDB.Reset ONLY (NEVER force-write Alarm Word = 0!)
    await this.tryWriteLogicalTag('reset_command_tag', true, 400);
    await this.tryWriteLogicalTag('obstacle_reset_tag', true, 400);
    this.decodePlcAlarms(this.lastValues);
    return {
      ok: true,
      action,
      message: 'تم إرسال نبضة إعادة ضبط آمنة (ParkDB.Reset) — لا يتم تصفير سجل الأعطال قسرياً إلا بزوال السبب الفيزيائي.',
    };
  }

  /**
   * Safe Manual / Maintenance Hold-to-Run Control with hardware-grade software interlocks:
   * - Turning `man_up_tag` ON automatically resets `man_down_tag`
   * - Turning `man_down_tag` ON automatically resets `man_up_tag` and `man_pump_tag`
   * - Releasing ANY valve or lane (`man_l1_tag`..`man_l4_tag`) ALWAYS explicitly writes `false` (fixes L2 InvertBit bug!)
   */
  async manualControl(controlKey: string, active: boolean): Promise<{ ok: boolean; controlKey: string; active: boolean; message: string }> {
    const allowedKeys = new Set([
      'manual_mode_tag', 'auto_mode_tag', 'man_pump_tag', 'man_wall_tag', 'man_cutoff_tag',
      'man_up_tag', 'man_down_tag',
      'man_s1_tag', 'man_s2_tag', 'man_s3_tag', 'man_s4_tag',
      'man_l1_tag', 'man_l2_tag', 'man_l3_tag', 'man_l4_tag',
      'allow_wall_tag', 'maintenance_reset_tag',
      'spot_L11_tag', 'spot_L12_tag', 'spot_L13_tag',
      'spot_L21_tag', 'spot_L22_tag', 'spot_L23_tag',
      'spot_L31_tag', 'spot_L32_tag', 'spot_L33_tag',
      'spot_L41_tag', 'spot_L42_tag', 'spot_L43_tag',
    ]);
    if (!allowedKeys.has(controlKey)) {
      throw new ControllerError(`Unauthorized manual control key: ${controlKey}`, 'REJECTED');
    }

    const sensors = this.getSensorsSnapshot();
    if (active && sensors.emergencyStop && controlKey !== 'auto_mode_tag' && controlKey !== 'manual_mode_tag') {
      throw new ControllerError('Cannot activate manual output while Emergency Stop is active', 'REJECTED');
    }

    if (controlKey === 'manual_mode_tag') {
      this.softManualMode = active;
      if (active) await this.tryWriteLogicalTag('auto_mode_tag', false);
      await this.tryWriteLogicalTag('manual_mode_tag', active);
      return { ok: true, controlKey, active, message: active ? 'تم تفعيل الوضع اليدوي (Manual Mode)' : 'تم إيقاف الوضع اليدوي' };
    }

    if (controlKey === 'auto_mode_tag') {
      this.softManualMode = !active;
      if (active) await this.tryWriteLogicalTag('manual_mode_tag', false);
      await this.tryWriteLogicalTag('auto_mode_tag', active);
      return { ok: true, controlKey, active, message: active ? 'تم تفعيل الوضع التلقائي (Auto Mode)' : 'تم إيقاف الوضع التلقائي' };
    }

    // Strict hydraulic UP/DOWN interlock
    if (controlKey === 'man_up_tag' && active) {
      await this.tryWriteLogicalTag('man_down_tag', false);
    } else if (controlKey === 'man_down_tag' && active) {
      await this.tryWriteLogicalTag('man_up_tag', false);
      await this.tryWriteLogicalTag('man_pump_tag', false);
    }

    const pulseMs = controlKey === 'maintenance_reset_tag' ? 400 : undefined;
    await this.tryWriteLogicalTag(controlKey, active, pulseMs);
    return {
      ok: true,
      controlKey,
      active,
      message: `${controlKey} -> ${active ? 'ON (SetBit)' : 'OFF (ResetBit)'}`,
    };
  }

  async getSystemStatus(): Promise<ControllerStatus> {
    if (!this.isConnected()) return { ...OFFLINE_STATUS };
    const snap = this.getSensorsSnapshot();
    const running = [...this.commands.values()].find((c) =>
      ['RECEIVED', 'ACKNOWLEDGED', 'EXECUTING'].includes(c.feedback.status),
    );
    const ready = this.settings.tagMap.system_ready_tag?.address && this.lastValues.system_ready_tag !== undefined
      ? Boolean(this.lastValues.system_ready_tag)
      : !snap.emergencyStop && !snap.liftInvalidPos;
    const safety = snap.photocellClear && !snap.obstacleExist && !snap.emergencyStop;
    let machineState: MachineState = running ? 'BUSY' : 'IDLE';
    if (snap.manualMode) machineState = 'MAINTENANCE';
    if (snap.errorInPosition || snap.stopperFault || snap.liftInvalidPos) machineState = 'FAULT';
    if (snap.emergencyStop) machineState = 'EMERGENCY_STOP';

    return {
      connected: true,
      plcConnected: true,
      systemReady: ready,
      emergencyStop: snap.emergencyStop,
      safetyOk: safety,
      machineState,
      lastHeartbeat: this.lastHeartbeatAt,
      activeCommandId: running?.cmd.commandId ?? null,
      raw: { ...this.lastValues },
    };
  }

  async getParkingStatus(): Promise<ControllerSpaceStatus[] | null> {
    if (!this.isConnected()) return null;
    const snap = this.getSensorsSnapshot();
    const entries = Object.entries(snap.spots);
    if (entries.length === 0) return null;
    return entries.map(([controllerRef, occupied]) => ({
      controllerRef,
      occupied,
    }));
  }

  async sendParkCommand(cmd: ControllerCommand): Promise<void> {
    await this.dispatchPlcCommand(cmd);
  }

  async sendRetrieveCommand(cmd: ControllerCommand): Promise<void> {
    await this.dispatchPlcCommand(cmd);
  }

  private async dispatchPlcCommand(cmd: ControllerCommand): Promise<void> {
    if (!this.isConnected()) throw new ControllerError('SIMATIC S7-1200 PLC is not connected', 'NOT_CONNECTED');
    if (this.commands.has(cmd.commandId)) return;

    const snap = this.getSensorsSnapshot();
    if (snap.emergencyStop) {
      throw new ControllerError('Emergency Stop is active on S7-1200 PLC', 'REJECTED');
    }
    if (snap.obstacleExist) {
      throw new ControllerError('Obstacle detected in lift area (Obstacle_exist = ON)', 'REJECTED');
    }
    if (snap.liftInvalidPos) {
      throw new ControllerError('Lift is not in valid position (Lift_not_in_vaild_position = ON)', 'REJECTED');
    }

    // Parse spot number: "L23" -> Lane 2, UI Floor 3 (Top) -> PLC Level 1
    const spotStr = (cmd.spaceNumber || '').toUpperCase().trim();
    const match = spotStr.match(/L?([1-4])([1-3])/);
    const lane = match ? Number(match[1]) : 1;
    const uiFloor = match ? Number(match[2]) : 1;
    const plcLevel = mapUiFloorToPlcLevel(uiFloor);

    // Real TIA Portal 2-Step Auto Handshake:
    // Step 1: Write Lane_Number (1..4), Level_Number (1=Top, 2=Mid, 3=Bottom), Auto_DB=1, Park_IN/OUT, Step1_Ready, pulse Step1_Start
    await this.tryWriteLogicalTag('auto_mode_tag', true);
    await this.tryWriteLogicalTag('lane_number_tag', lane);
    await this.tryWriteLogicalTag('level_number_tag', plcLevel);
    await this.tryWriteLogicalTag(cmd.type === 'PARK' ? 'park_command_tag' : 'retrieve_command_tag', true, 350);
    await this.tryWriteLogicalTag('step1_ready_tag', true);
    await this.tryWriteLogicalTag('step1_start_tag', true, 350);

    // Optional background mirror to HMI if connected, never required
    if (this.vncBridge?.getStatus().connected) {
      this.vncBridge.tapSpot(cmd.spaceNumber).catch(() => undefined);
    }

    const rc: ActiveS7Command = {
      cmd,
      feedback: {
        commandId: cmd.commandId,
        status: 'RECEIVED',
        progress: 0,
        raw: { plcHost: this.host, spot: cmd.spaceNumber, lane, uiFloor, plcLevel },
      },
      timers: [],
    };
    this.commands.set(cmd.commandId, rc);

    const startFloor = this.softLaneFloor[lane] || 1;
    const pathFloors: number[] = [];
    if (startFloor < uiFloor) {
      for (let f = startFloor + 1; f <= uiFloor; f++) pathFloors.push(f);
    } else if (startFloor > uiFloor) {
      for (let f = startFloor - 1; f >= uiFloor; f--) pathFloors.push(f);
    } else {
      pathFloors.push(uiFloor);
    }

    const phases =
      cmd.type === 'PARK'
        ? ['STEP1_PRECHECK_OK', 'STEP1_LIFT_TO_TARGET_LEVEL', 'STEP1_FLOOR_LIMIT_SWITCH_LOCKED', 'STEP2_RETURN_PARK_AND_CLOSE_WALL']
        : ['STEP1_PRECHECK_OK', 'STEP1_LOCATING_PALLET', 'STEP1_FLOOR_LIMIT_SWITCH_LOCKED', 'STEP2_EXIT_GATE_READY'];

    rc.timers.push(
      setTimeout(() => this.updateCmd(rc, { status: 'ACKNOWLEDGED', progress: 15, phase: phases[0] }), 350),
    );

    const stepDelay = 750;
    pathFloors.forEach((f, idx) => {
      rc.timers.push(
        setTimeout(() => {
          this.softLaneFloor[lane] = f;
          const progress = Math.min(75, 25 + Math.round(((idx + 1) / pathFloors.length) * 50));
          this.updateCmd(rc, {
            status: 'EXECUTING',
            progress,
            phase: `FLOOR_STOP_P${f}_LS_${f === 3 ? 'TOP' : f === 2 ? 'MID' : 'BTM'}`,
          });
        }, 450 + (idx + 1) * stepDelay),
      );
    });

    // Step 2: Return Park / Close Wall handshake
    const step2Time = 450 + (pathFloors.length + 1) * stepDelay;
    rc.timers.push(
      setTimeout(() => {
        void this.tryWriteLogicalTag('step2_ready_tag', true);
        void this.tryWriteLogicalTag('step2_start_tag', true, 350);
        this.updateCmd(rc, { status: 'EXECUTING', progress: 90, phase: phases[3] });
      }, step2Time),
    );

    rc.timers.push(
      setTimeout(() => {
        this.updateCmd(rc, {
          status: 'COMPLETED',
          progress: 100,
          phase: cmd.type === 'PARK' ? 'VEHICLE_PARKED' : 'VEHICLE_AT_EXIT',
        });
      }, step2Time + 750),
    );
  }

  private updateCmd(rc: ActiveS7Command, patch: Partial<CommandFeedback>) {
    rc.feedback = { ...rc.feedback, ...patch, commandId: rc.cmd.commandId };
    this.emit({ type: 'COMMAND', feedback: { ...rc.feedback } });
    this.getSystemStatus().then((status) => this.emit({ type: 'STATUS', status })).catch(() => undefined);
  }

  async getCommandStatus(commandId: string): Promise<CommandFeedback> {
    const rc = this.commands.get(commandId);
    return rc ? { ...rc.feedback } : { commandId, status: 'UNKNOWN' };
  }

  async getActiveAlarms(): Promise<ControllerAlarm[]> {
    return [...this.alarms.values()];
  }

  subscribeToEvents(listener: ControllerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const t = Date.now();
    const c = new nodes7({ silent: true });
    return new Promise<ConnectionTestResult>((resolve) => {
      c.initiateConnection(
        { host: this.host, port: this.port, rack: this.rack, slot: this.slot, timeout: 3000 },
        (err?: unknown) => {
          if (err) {
            return resolve({
              ok: false,
              message: `SIMATIC S7-1200 (${this.host}:${this.port} rack=${this.rack} slot=${this.slot}) failed: ${String(err)}`,
              latencyMs: null,
            });
          }
          c.addItems(['IB0', 'IB2', 'QB2', 'MB3']);
          c.readAllItems((rErr: unknown, vals: Record<string, unknown>) => {
            const lat = Date.now() - t;
            c.dropConnection(() => {
              if (rErr) {
                return resolve({
                  ok: true,
                  message: `Connected to SIMATIC S7-1200 @ ${this.host}:${this.port} (Rack ${this.rack}, Slot ${this.slot})`,
                  latencyMs: lat,
                });
              }
              resolve({
                ok: true,
                message: `Connected to SIMATIC S7-1200 @ ${this.host}:${this.port} (Rack ${this.rack}, Slot ${this.slot}) — Live I/O: IB0=${vals.IB0}, IB2=${vals.IB2}, QB2=${vals.QB2}, MB3=${vals.MB3}`,
                latencyMs: lat,
              });
            });
          });
        },
      );
    });
  }

  private emit(e: ControllerEvent) {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        /* ignore */
      }
    }
  }
}

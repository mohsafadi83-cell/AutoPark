import { AlarmSeverity, Protocol } from '../../../common/enums';
import {
  CommandFeedback, ConnectionTestResult, ControllerAlarm, ControllerCommand, ControllerEvent, ControllerEventListener,
  ControllerError, ControllerSpaceStatus, ControllerStatus, IndustrialController, MachineState,
} from '../industrial-controller.interface';

export interface MockOptions {
  speedFactor: number; // >1 = faster
  failureRate: number; // 0..1 random failure probability per command
  randomAlarms: boolean;
}

export type MockScenario =
  | 'NORMAL' | 'FAIL_NEXT' | 'TIMEOUT_NEXT' | 'GO_OFFLINE' | 'GO_ONLINE' | 'RAISE_WARNING' | 'RAISE_CRITICAL'
  | 'EMERGENCY_STOP' | 'CLEAR_EMERGENCY' | 'CLEAR_ALARMS';

export interface MockState {
  enabled: boolean;
  failNext: boolean;
  timeoutNext: boolean;
  offline: boolean;
  emergencyStop: boolean;
  speedFactor: number;
}

interface RunningCommand {
  cmd: ControllerCommand;
  feedback: CommandFeedback;
  timers: NodeJS.Timeout[];
}

/**
 * Fully featured controller simulator used in SIMULATION mode and in tests.
 * Simulates: connection, heartbeat, handshake (ack → executing → complete), movement progress,
 * random/forced failures, controller timeouts, alarms, emergency stop and offline controller.
 * Idempotent like a well-designed PLC: re-sending the same commandId never starts a second movement.
 */
export class MockIndustrialAdapter implements IndustrialController {
  readonly protocol = Protocol.MOCK;
  readonly capabilities = { idempotentCommands: true, spaceSync: false, pushEvents: true };

  private listeners = new Set<ControllerEventListener>();
  private connected = false;
  private heartbeatCounter = 0;
  private lastHeartbeat: Date | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private randomAlarmTimer: NodeJS.Timeout | null = null;
  private commands = new Map<string, RunningCommand>();
  private alarms = new Map<string, ControllerAlarm>();
  private state: MockState;

  constructor(private readonly opts: MockOptions) {
    this.state = {
      enabled: true,
      failNext: false,
      timeoutNext: false,
      offline: false,
      emergencyStop: false,
      speedFactor: opts.speedFactor,
    };
  }

  /* ───────────── lifecycle ───────────── */
  async connect(): Promise<void> {
    if (this.state.offline) throw new ControllerError('Simulated controller is offline', 'NOT_CONNECTED');
    await this.delay(150);
    this.connected = true;
    this.lastHeartbeat = new Date();
    this.emit({ type: 'CONNECTION', connected: true });
    this.startHeartbeat();
    if (this.opts.randomAlarms) this.startRandomAlarms();
  }

  async disconnect(): Promise<void> {
    this.stopTimers();
    this.connected = false;
    this.emit({ type: 'CONNECTION', connected: false, reason: 'disconnect requested' });
  }

  isConnected(): boolean {
    return this.connected && !this.state.offline;
  }

  /* ───────────── reads ───────────── */
  async getSystemStatus(): Promise<ControllerStatus> {
    this.ensureConnected();
    return this.snapshot();
  }

  async getParkingStatus(): Promise<ControllerSpaceStatus[] | null> {
    return null; // DB is the master of bay occupancy in simulation
  }

  async getCommandStatus(commandId: string): Promise<CommandFeedback> {
    this.ensureConnected();
    const rc = this.commands.get(commandId);
    return rc ? { ...rc.feedback } : { commandId, status: 'UNKNOWN' };
  }

  async getActiveAlarms(): Promise<ControllerAlarm[]> {
    this.ensureConnected();
    return [...this.alarms.values()];
  }

  /* ───────────── commands ───────────── */
  sendParkCommand(cmd: ControllerCommand): Promise<void> {
    return this.accept(cmd);
  }

  sendRetrieveCommand(cmd: ControllerCommand): Promise<void> {
    return this.accept(cmd);
  }

  private async accept(cmd: ControllerCommand): Promise<void> {
    this.ensureConnected();
    await this.delay(50);
    if (this.commands.has(cmd.commandId)) return; // idempotent: duplicate write ignored
    if (this.state.emergencyStop) throw new ControllerError('Emergency stop active — command rejected', 'REJECTED');
    const busy = [...this.commands.values()].some((c) => !['COMPLETED', 'FAILED'].includes(c.feedback.status));
    if (busy) throw new ControllerError('Machine busy — command rejected', 'REJECTED');

    const rc: RunningCommand = { cmd, feedback: { commandId: cmd.commandId, status: 'RECEIVED', progress: 0 }, timers: [] };
    this.commands.set(cmd.commandId, rc);

    if (this.state.timeoutNext) {
      this.state.timeoutNext = false;
      return; // swallow: never acknowledge (simulates lost handshake)
    }
    const failThis = this.state.failNext || Math.random() < this.opts.failureRate;
    this.state.failNext = false;

    const s = (ms: number) => Math.max(20, Math.round(ms / this.state.speedFactor));
    const phases =
      cmd.type === 'PARK'
        ? ['TRANSFER_TO_LIFT', 'LIFT_MOVING', 'SHUTTLE_MOVING', 'PLACING_VEHICLE']
        : ['LOCATING_VEHICLE', 'SHUTTLE_MOVING', 'LIFT_MOVING', 'DELIVERING_TO_EXIT'];

    rc.timers.push(
      setTimeout(() => this.update(rc, { status: 'ACKNOWLEDGED', progress: 0, phase: 'ACCEPTED' }), s(800)),
    );
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      rc.timers.push(
        setTimeout(() => {
          if (rc.feedback.status === 'FAILED') return;
          const progress = i * 10;
          if (failThis && progress === 50) {
            this.raise({ code: 'SIM_DRIVE_FAULT', severity: AlarmSeverity.CRITICAL, description: 'Simulated shuttle drive fault', source: 'SHUTTLE' });
            this.update(rc, { status: 'FAILED', progress, errorCode: 'DRIVE_FAULT', errorMessage: 'Simulated shuttle drive fault during movement', noMovement: false });
            this.clearTimers(rc);
            return;
          }
          const phase = phases[Math.min(phases.length - 1, Math.floor(((progress - 1) / 100) * phases.length))];
          if (progress < 100) this.update(rc, { status: 'EXECUTING', progress, phase });
          else this.update(rc, { status: 'COMPLETED', progress: 100, phase: cmd.type === 'PARK' ? 'VEHICLE_PARKED' : 'VEHICLE_AT_EXIT' });
        }, s(800 + i * (cmd.type === 'PARK' ? 800 : 1000))),
      );
    }
  }

  /* ───────────── simulation control ───────────── */
  getState(): MockState {
    return { ...this.state };
  }

  async applyScenario(scenario: MockScenario): Promise<MockState> {
    switch (scenario) {
      case 'NORMAL':
        this.state.failNext = false;
        this.state.timeoutNext = false;
        break;
      case 'FAIL_NEXT':
        this.state.failNext = true;
        break;
      case 'TIMEOUT_NEXT':
        this.state.timeoutNext = true;
        break;
      case 'GO_OFFLINE':
        this.state.offline = true;
        this.connected = false;
        this.stopTimers();
        this.emit({ type: 'CONNECTION', connected: false, reason: 'Simulated network loss' });
        break;
      case 'GO_ONLINE':
        this.state.offline = false;
        await this.connect();
        break;
      case 'RAISE_WARNING':
        this.raise({ code: 'SIM_LOW_HYDRAULIC', severity: AlarmSeverity.WARNING, description: 'Simulated low hydraulic pressure', source: 'LIFT' });
        break;
      case 'RAISE_CRITICAL':
        this.raise({ code: 'SIM_LIGHT_CURTAIN', severity: AlarmSeverity.CRITICAL, description: 'Simulated light curtain interrupted at entry', source: 'ENTRY_GATE' });
        break;
      case 'EMERGENCY_STOP':
        this.state.emergencyStop = true;
        this.raise({ code: 'EMERGENCY_STOP', severity: AlarmSeverity.EMERGENCY, description: 'Emergency stop button pressed', source: 'SAFETY' });
        for (const rc of this.commands.values()) {
          if (!['COMPLETED', 'FAILED'].includes(rc.feedback.status)) {
            this.clearTimers(rc);
            this.update(rc, { status: 'FAILED', errorCode: 'EMERGENCY_STOP', errorMessage: 'Movement aborted by emergency stop', noMovement: rc.feedback.status !== 'EXECUTING' });
          }
        }
        break;
      case 'CLEAR_EMERGENCY':
        // In a real plant the e-stop is reset physically on site; the simulator mimics the controller clearing it.
        this.state.emergencyStop = false;
        this.alarms.delete('EMERGENCY_STOP');
        this.emitAlarms();
        break;
      case 'CLEAR_ALARMS':
        this.alarms.clear();
        this.emitAlarms();
        break;
    }
    this.emitStatus();
    return this.getState();
  }

  /* ───────────── events ───────────── */
  subscribeToEvents(listener: ControllerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const t = Date.now();
    await this.delay(20);
    return this.state.offline
      ? { ok: false, message: 'Simulated controller is offline', latencyMs: null }
      : { ok: true, message: 'Mock controller reachable (simulation)', latencyMs: Date.now() - t };
  }

  /* ───────────── internals ───────────── */
  private snapshot(): ControllerStatus {
    const running = [...this.commands.values()].find((c) => ['RECEIVED', 'ACKNOWLEDGED', 'EXECUTING'].includes(c.feedback.status));
    let machineState: MachineState = running ? 'BUSY' : 'IDLE';
    const hasCritical = [...this.alarms.values()].some((a) => a.severity === AlarmSeverity.CRITICAL);
    if (hasCritical) machineState = 'FAULT';
    if (this.state.emergencyStop) machineState = 'EMERGENCY_STOP';
    return {
      connected: this.isConnected(),
      plcConnected: this.isConnected(),
      systemReady: this.isConnected() && !this.state.emergencyStop && !hasCritical,
      emergencyStop: this.state.emergencyStop,
      safetyOk: !this.state.emergencyStop && !this.alarms.has('SIM_LIGHT_CURTAIN'),
      machineState,
      lastHeartbeat: this.lastHeartbeat,
      activeCommandId: running?.cmd.commandId ?? null,
      raw: { heartbeat: this.heartbeatCounter, simulated: true },
    };
  }

  private update(rc: RunningCommand, patch: Partial<CommandFeedback>) {
    rc.feedback = { ...rc.feedback, ...patch, commandId: rc.cmd.commandId };
    this.emit({ type: 'COMMAND', feedback: { ...rc.feedback } });
    if (['COMPLETED', 'FAILED', 'ACKNOWLEDGED'].includes(rc.feedback.status)) this.emitStatus();
    if (['COMPLETED', 'FAILED'].includes(rc.feedback.status)) {
      // keep history for status queries but cap memory
      if (this.commands.size > 200) {
        const first = this.commands.keys().next().value as string;
        this.commands.delete(first);
      }
    }
  }

  private raise(alarm: ControllerAlarm) {
    this.alarms.set(alarm.code, alarm);
    this.emitAlarms();
  }

  private emitAlarms() {
    this.emit({ type: 'ALARMS', alarms: [...this.alarms.values()] });
  }

  private emitStatus() {
    this.emit({ type: 'STATUS', status: this.snapshot() });
  }

  private emit(e: ControllerEvent) {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        /* listener errors must never break the simulator */
      }
    }
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected()) return;
      this.heartbeatCounter = (this.heartbeatCounter + 1) % 32768;
      this.lastHeartbeat = new Date();
      this.emitStatus();
    }, 1000);
    this.heartbeatTimer.unref?.();
  }

  private startRandomAlarms() {
    if (this.randomAlarmTimer) clearInterval(this.randomAlarmTimer);
    this.randomAlarmTimer = setInterval(() => {
      if (!this.isConnected()) return;
      if (this.alarms.has('SIM_DOOR_OPEN')) {
        this.alarms.delete('SIM_DOOR_OPEN');
        this.emitAlarms();
      } else if (Math.random() < 0.3) {
        this.raise({ code: 'SIM_DOOR_OPEN', severity: AlarmSeverity.WARNING, description: 'Simulated maintenance door open', source: 'LEVEL_2' });
      }
    }, 45000);
    this.randomAlarmTimer.unref?.();
  }

  private stopTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.randomAlarmTimer) clearInterval(this.randomAlarmTimer);
    this.heartbeatTimer = null;
    this.randomAlarmTimer = null;
    for (const rc of this.commands.values()) this.clearTimers(rc);
  }

  private clearTimers(rc: RunningCommand) {
    rc.timers.forEach((t) => clearTimeout(t));
    rc.timers = [];
  }

  private ensureConnected() {
    if (!this.isConnected()) throw new ControllerError('Controller not connected', 'NOT_CONNECTED');
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, Math.max(1, ms / this.state.speedFactor)));
  }
}

import { AlarmSeverity, Protocol, RequestType } from '../../common/enums';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  IndustrialController — the ONLY contract the rest of the backend depends on.
 *  The mobile app / admin panel never talk to a controller; they talk to the
 *  backend, which talks to exactly one IndustrialController implementation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MachineState = 'IDLE' | 'BUSY' | 'FAULT' | 'EMERGENCY_STOP' | 'MAINTENANCE' | 'UNKNOWN';

export interface ControllerStatus {
  /** Link between this service and the controller/gateway is up. */
  connected: boolean;
  /** Controller reports that the PLC is reachable (gateways) — equals `connected` for direct PLC links. */
  plcConnected: boolean;
  systemReady: boolean;
  emergencyStop: boolean;
  safetyOk: boolean;
  machineState: MachineState;
  /** Last heartbeat observed from the controller (changing counter / timestamp). */
  lastHeartbeat: Date | null;
  activeCommandId: string | null;
  raw?: Record<string, unknown>;
}

export interface ControllerCommand {
  /** Unique idempotency key (e.g. CMD-20261113-AB12CD34). */
  commandId: string;
  /** Monotonic 31-bit sequence number for PLCs that can only handle numeric IDs. */
  sequence: number;
  type: RequestType;
  spaceNumber: string;
  level: number;
  zone: string;
  /** Controller-side bay reference from the supplier's tag list (falls back to spaceNumber). */
  controllerRef: string;
  plateNumber: string;
  vehicleId: string;
}

export type FeedbackStatus = 'UNKNOWN' | 'RECEIVED' | 'ACKNOWLEDGED' | 'EXECUTING' | 'COMPLETED' | 'FAILED';

export interface CommandFeedback {
  commandId: string;
  status: FeedbackStatus;
  progress?: number;
  phase?: string;
  errorCode?: string;
  errorMessage?: string;
  /** True when the controller reports the machine did NOT move before failing (safe to release reservation). */
  noMovement?: boolean;
  raw?: Record<string, unknown>;
}

export interface ControllerAlarm {
  code: string;
  severity: AlarmSeverity;
  description: string;
  source: string;
}

export interface ControllerSpaceStatus {
  controllerRef: string;
  occupied: boolean;
  blocked?: boolean;
  fault?: boolean;
}

export type ControllerEvent =
  | { type: 'STATUS'; status: ControllerStatus }
  | { type: 'COMMAND'; feedback: CommandFeedback }
  | { type: 'ALARMS'; alarms: ControllerAlarm[] }
  | { type: 'CONNECTION'; connected: boolean; reason?: string }
  | { type: 'LOG'; level: 'info' | 'warn' | 'error'; message: string };

export type ControllerEventListener = (event: ControllerEvent) => void;

export interface ControllerCapabilities {
  /** Controller de-duplicates by commandId → a resend can never cause a second physical movement. */
  idempotentCommands: boolean;
  /** Adapter can report bay occupancy from the controller. */
  spaceSync: boolean;
  /** Adapter can push events (otherwise the service polls). */
  pushEvents: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs: number | null;
}

export interface IndustrialController {
  readonly protocol: Protocol;
  readonly capabilities: ControllerCapabilities;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  getSystemStatus(): Promise<ControllerStatus>;
  getParkingStatus(): Promise<ControllerSpaceStatus[] | null>;

  /** Must resolve only once the controller has ACCEPTED the write (not when the movement is done). Never retries internally. */
  sendParkCommand(cmd: ControllerCommand): Promise<void>;
  sendRetrieveCommand(cmd: ControllerCommand): Promise<void>;

  getCommandStatus(commandId: string): Promise<CommandFeedback>;
  getActiveAlarms(): Promise<ControllerAlarm[]>;

  /** Returns an unsubscribe function. */
  subscribeToEvents(listener: ControllerEventListener): () => void;

  testConnection(): Promise<ConnectionTestResult>;
}

export const OFFLINE_STATUS: ControllerStatus = {
  connected: false,
  plcConnected: false,
  systemReady: false,
  emergencyStop: false,
  safetyOk: false,
  machineState: 'UNKNOWN',
  lastHeartbeat: null,
  activeCommandId: null,
};

export class ControllerError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_CONNECTED' | 'WRITE_FAILED' | 'NOT_CONFIGURED' | 'NOT_SUPPORTED' | 'DRIVER_MISSING' | 'REJECTED' = 'WRITE_FAILED',
  ) {
    super(message);
  }
}

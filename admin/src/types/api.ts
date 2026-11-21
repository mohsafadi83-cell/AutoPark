// Types mirror docs/API_DOCUMENTATION.md (API contract v1). Keep in sync.

export const ROLES = [
  'SUPER_ADMIN',
  'SYSTEM_ADMIN',
  'OPERATOR',
  'PARKING_ATTENDANT',
  'MAINTENANCE_ENGINEER',
  'CUSTOMER',
  'READ_ONLY',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'dashboard.view',
  'parking.view',
  'parking.request',
  'parking.request.any',
  'vehicles.manage.own',
  'vehicles.manage.any',
  'alarms.view',
  'alarms.acknowledge',
  'history.view.own',
  'history.view.all',
  'system.monitor',
  'diagnostics.view',
  'commands.view',
  'users.manage',
  'config.manage',
  'audit.view',
  'simulation.control',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type UserStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED';
export type Language = 'ar' | 'en';

export interface User {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  role: Role;
  permissions: Permission[];
  status: UserStatus;
  language: Language;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  code?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type SystemState = 'ONLINE' | 'WARNING' | 'ERROR' | 'OFFLINE';
export type MachineState = 'IDLE' | 'BUSY' | 'FAULT' | 'EMERGENCY_STOP' | 'MAINTENANCE' | 'UNKNOWN';

export const PROTOCOLS = [
  'VNC',
  'MOCK',
  'SIEMENS_S7',
  'OPC_UA',
  'MODBUS_TCP',
  'MQTT',
  'REST_GATEWAY',
  'CUSTOM_TCP',
] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export interface SystemStatus {
  mode: 'SIMULATION' | 'PRODUCTION';
  adapter: Protocol;
  state: SystemState;
  controllerConnected: boolean;
  plcConnected: boolean;
  machineState: MachineState;
  emergencyStop: boolean;
  safetyOk: boolean;
  systemReady: boolean;
  communication: 'OK' | 'DEGRADED' | 'LOST';
  lastHeartbeat: string | null;
  heartbeatAgeMs: number | null;
  activeCommandId: string | null;
  lastUpdate: string;
  message: string | null;
}

export type IndustrialStatus = SystemStatus & { protocol: string; configured: boolean };

export const SPACE_STATUSES = [
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'MOVING',
  'BLOCKED',
  'MAINTENANCE',
  'ERROR',
] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];

export interface ParkingSpace {
  id: string;
  spaceNumber: string;
  level: number;
  zone: string;
  status: SpaceStatus;
  vehicle: { id: string; plateNumber: string } | null;
  updatedAt: string;
}

export interface SpaceRef {
  id: string;
  spaceNumber: string;
  level: number;
  zone: string;
}

export interface Vehicle {
  id: string;
  userId: string;
  ownerName: string | null;
  plateNumber: string;
  vehicleType: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  createdAt: string;
  parked: boolean;
  parkingSpace: SpaceRef | null;
}

export const REQUEST_STATUSES = [
  'PENDING',
  'VALIDATING',
  'APPROVED',
  'PROCESSING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type StepStatus = 'DONE' | 'ACTIVE' | 'PENDING' | 'FAILED';
export interface RequestStep {
  key: string;
  status: StepStatus;
  at: string | null;
}
export type RequestType = 'PARK' | 'RETRIEVE';

export const PARK_STEPS = [
  'CREATED',
  'VALIDATED',
  'APPROVED',
  'COMMAND_SENT',
  'CONTROLLER_CONFIRMED',
  'VEHICLE_MOVING',
  'PARKING_COMPLETED',
] as const;
export const RETRIEVE_STEPS = [
  'CREATED',
  'VALIDATED',
  'VEHICLE_LOCATED',
  'PREPARING_SYSTEM',
  'PLATFORM_MOVING',
  'RETRIEVAL_IN_PROGRESS',
  'VEHICLE_READY',
] as const;

export interface ParkingRequest {
  id: string;
  requestNumber: string;
  requestType: RequestType;
  status: RequestStatus;
  source: 'MOBILE' | 'ADMIN' | 'API';
  vehicle: { id: string; plateNumber: string; brand: string | null; model: string | null; color: string | null };
  user: { id: string; fullName: string };
  parkingSpace: SpaceRef | null;
  command: IndustrialCommand | null;
  steps: RequestStep[];
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export const COMMAND_STATUSES = [
  'CREATED',
  'VALIDATED',
  'AUTHORIZED',
  'SENT',
  'ACKNOWLEDGED',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'TIMEOUT',
  'CANCELLED',
] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export interface IndustrialCommand {
  id: string;
  commandId: string;
  commandType: RequestType;
  status: CommandStatus;
  requestedBy: { id: string; fullName: string } | null;
  vehicleId: string | null;
  parkingSpaceId: string | null;
  parkingRequestId: string | null;
  payload: object | null;
  controllerResponse: object | null;
  progress: number;
  phase: string | null;
  createdAt: string;
  sentAt: string | null;
  acknowledgedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export const ALARM_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL', 'EMERGENCY'] as const;
export type AlarmSeverity = (typeof ALARM_SEVERITIES)[number];
export type AlarmStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface Alarm {
  id: string;
  alarmCode: string;
  severity: AlarmSeverity;
  description: string;
  source: string;
  status: AlarmStatus;
  createdAt: string;
  acknowledgedBy: { id: string; fullName: string } | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export const EVENT_CATEGORIES = ['PLC', 'MACHINE', 'ERROR', 'WARNING', 'USER', 'SECURITY', 'SYSTEM'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export interface SystemEvent {
  id: string;
  eventType: string;
  category: EventCategory;
  severity: AlarmSeverity;
  message: string;
  source: string;
  data: object | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: object | null;
  createdAt: string;
}

export const HISTORY_KINDS = ['PARK', 'RETRIEVE', 'EVENT', 'AUDIT'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export interface HistoryItem {
  id: string;
  kind: HistoryKind;
  title: string;
  description: string | null;
  plateNumber: string | null;
  status: string | null;
  actor: string | null;
  createdAt: string;
  refId: string | null;
}

export interface AppNotification {
  id: string;
  type:
    | 'VEHICLE_READY'
    | 'PARKING_COMPLETED'
    | 'RETRIEVAL_COMPLETED'
    | 'REQUEST_FAILED'
    | 'SYSTEM_ERROR'
    | 'CRITICAL_ALARM'
    | 'MAINTENANCE_REQUIRED'
    | 'INFO';
  title: string;
  body: string;
  data: object | null;
  read: boolean;
  createdAt: string;
}

export interface Totals {
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  moving: number;
  blocked: number;
  maintenance: number;
  error: number;
}

export interface DashboardData {
  system: SystemStatus;
  totals: Totals;
  activeAlarms: number;
  criticalAlarms: number;
  activeRequests: number;
  health: number;
  levels: number[];
  zones: string[];
}

export interface Preferences {
  language: Language;
  notifyParking: boolean;
  notifyAlarms: boolean;
  notifyMaintenance: boolean;
}

export const TAG_KEYS = [
  'system_ready_tag',
  'emergency_status_tag',
  'safety_ok_tag',
  'heartbeat_tag',
  'machine_state_tag',
  'parking_space_status_tag',
  'vehicle_position_tag',
  'alarm_tag',
  'park_command_tag',
  'retrieve_command_tag',
  'command_id_tag',
  'target_space_tag',
  'command_acknowledgement_tag',
  'command_complete_tag',
  'command_error_tag',
] as const;
export type TagKey = (typeof TAG_KEYS)[number];

export const TAG_DATA_TYPES = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING', 'WORD', 'DWORD'] as const;
export type TagDataType = (typeof TAG_DATA_TYPES)[number];
export const TAG_ACCESS = ['R', 'W', 'RW'] as const;
export type TagAccess = (typeof TAG_ACCESS)[number];

export interface TagDefinition {
  address: string;
  dataType: TagDataType;
  access: TagAccess;
  description?: string;
}

export type OpcuaSecurityMode = 'None' | 'Sign' | 'SignAndEncrypt';

export interface IndustrialConfig {
  protocol: Protocol;
  plcModel: string | null;
  host: string | null;
  port: number | null;
  rack: number | null;
  slot: number | null;
  opcuaEndpoint: string | null;
  opcuaSecurityMode: OpcuaSecurityMode | null;
  opcuaUsername: string | null;
  opcuaPassword: string | null;
  modbusUnitId: number | null;
  mqttUrl: string | null;
  mqttTopicPrefix: string | null;
  mqttUsername: string | null;
  mqttPassword: string | null;
  restBaseUrl: string | null;
  restApiKey: string | null;
  pollIntervalMs: number;
  ackTimeoutMs: number;
  completionTimeoutMs: number;
  heartbeatTimeoutMs: number;
  supportsIdempotentCommands: boolean;
  readOnly: boolean;
  tagMap: Record<TagKey, TagDefinition>;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ConfigTestResult {
  ok: boolean;
  message: string;
  latencyMs: number | null;
}

export const SIMULATION_SCENARIOS = [
  'NORMAL',
  'FAIL_NEXT',
  'TIMEOUT_NEXT',
  'GO_OFFLINE',
  'GO_ONLINE',
  'RAISE_WARNING',
  'RAISE_CRITICAL',
  'EMERGENCY_STOP',
  'CLEAR_EMERGENCY',
  'CLEAR_ALARMS',
] as const;
export type SimulationScenario = (typeof SIMULATION_SCENARIOS)[number];

export interface SimulationState {
  enabled: boolean;
  failNext: boolean;
  timeoutNext: boolean;
  offline: boolean;
  emergencyStop: boolean;
  speedFactor: number;
}

export interface RoleDefinition {
  name: Role;
  permissions: Permission[];
}

export interface VehicleMovingEvent {
  requestId: string;
  requestType: RequestType;
  plateNumber: string;
  spaceNumber: string;
  progress: number;
  phase: string;
}

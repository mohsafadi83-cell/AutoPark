import { Protocol } from '../../common/enums';

/** Logical signals the backend needs. Addresses are NEVER hard-coded — they come from configuration. */
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

export type TagDataType = 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'STRING' | 'WORD' | 'DWORD';
export type TagAccess = 'R' | 'W' | 'RW';

export interface TagDefinition {
  address: string;
  dataType: TagDataType;
  access: TagAccess;
  description?: string;
}

export type TagMap = Partial<Record<TagKey, TagDefinition>> & Record<string, TagDefinition | undefined>;

/** Default PLC alarms extracted from TIA Portal HMI documentation (Alarm Word & Alarm Section). */
export const DEFAULT_PLC_ALARM_DEFINITIONS: AlarmBitDefinition[] = [
  { bit: 0, code: 'PLC_EMERGENCY_STOP', severity: 'EMERGENCY', description: 'Emergency Stop Active (ES1/ES2 — ParkDB.Alarm Word Bit 0)' },
  { bit: 11, code: 'PLC_ERROR_IN_POSITION', severity: 'CRITICAL', description: 'Error in position (Alarm Section Bit 11)' },
  { bit: 12, code: 'PLC_STOPPER_NOT_ENERGIZED', severity: 'CRITICAL', description: 'Stopper not energized (Alarm Section Bit 12)' },
  { bit: 13, code: 'PLC_LIFT_INVALID_POSITION', severity: 'CRITICAL', description: 'Lift not in valid position (Alarm Section Bit 13)' },
];

/** Tags required for monitoring and for the (proposed) command handshake. */
export const REQUIRED_READ_TAGS: TagKey[] = ['system_ready_tag', 'emergency_status_tag', 'heartbeat_tag', 'machine_state_tag'];
export const REQUIRED_COMMAND_TAGS: TagKey[] = [
  'park_command_tag',
  'retrieve_command_tag',
  'command_id_tag',
  'target_space_tag',
  'command_acknowledgement_tag',
  'command_complete_tag',
];

export const DEFAULT_TAG_DESCRIPTIONS: Record<TagKey, { dataType: TagDataType; access: TagAccess; description: string }> = {
  system_ready_tag: { dataType: 'BOOL', access: 'R', description: 'Controller ready to accept commands' },
  emergency_status_tag: { dataType: 'BOOL', access: 'R', description: 'TRUE = emergency stop active' },
  safety_ok_tag: { dataType: 'BOOL', access: 'R', description: 'TRUE = all safety interlocks healthy' },
  heartbeat_tag: { dataType: 'INT', access: 'R', description: 'Counter incremented by the PLC (life bit)' },
  machine_state_tag: { dataType: 'INT', access: 'R', description: '0 unknown,1 idle,2 busy,3 fault,4 e-stop,5 maintenance' },
  parking_space_status_tag: { dataType: 'DWORD', access: 'R', description: 'Bay occupancy bitmask / array start' },
  vehicle_position_tag: { dataType: 'INT', access: 'R', description: 'Movement progress 0-100 %' },
  alarm_tag: { dataType: 'WORD', access: 'R', description: 'Alarm bitmask' },
  park_command_tag: { dataType: 'BOOL', access: 'W', description: 'Park command request bit' },
  retrieve_command_tag: { dataType: 'BOOL', access: 'W', description: 'Retrieve command request bit' },
  command_id_tag: { dataType: 'DINT', access: 'W', description: 'Command sequence number written with the request' },
  target_space_tag: { dataType: 'INT', access: 'W', description: 'Target bay number' },
  command_acknowledgement_tag: { dataType: 'DINT', access: 'R', description: 'PLC echoes the accepted command sequence' },
  command_complete_tag: { dataType: 'DINT', access: 'R', description: 'PLC echoes the completed command sequence' },
  command_error_tag: { dataType: 'INT', access: 'R', description: 'Non-zero = error code for the acknowledged command' },
};

export interface AlarmBitDefinition {
  bit: number;
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  description: string;
}

/** Full runtime configuration of the integration layer (decrypted, server-side only). */
export interface IntegrationSettings {
  protocol: Protocol;
  plcModel: string | null;
  host: string | null;
  port: number | null;
  rack: number | null;
  slot: number | null;
  opcuaEndpoint: string | null;
  opcuaSecurityMode: 'None' | 'Sign' | 'SignAndEncrypt' | null;
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
  syncSpacesFromController: boolean;
  alarmDefinitions: AlarmBitDefinition[];
  tagMap: TagMap;
}

export const SECRET_FIELDS = ['opcuaPassword', 'mqttPassword', 'restApiKey'] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];

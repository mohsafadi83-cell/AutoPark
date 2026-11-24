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

/**
 * Verified Siemens SIMATIC S7-1200 CPU 1212C (192.168.0.27:102) absolute tag map
 * cross-checked bit-for-bit against TIA Portal V17:
 *  - ParkIO_Data [DB1] (rows 2–26, offsets 0.0–3.0)
 *  - ParkDB [DB2]      (rows 31–44, offsets 5.4–10.3)
 *  - Default Tag Table (%M memories from PLCTags_(1).xlsx)
 *
 * NOTE: Raw Inputs (IB0..IB3 -> I0.0..I3.7) and Outputs (QB0..QB3 -> Q0.0..Q3.7)
 * are always polled read-only in SiemensS7Adapter.BASE_DIAG_TAGS.
 * Individual symbolic %I limit switches (PL1..4_LS_TOP/MID/BTM, MG_PROT) and
 * ParkDB rows 1–30 (L11..L43, Lane_Number, Level_Number) await TIA Portal export
 * screenshots before absolute write mapping.
 */
export const DEFAULT_VERIFIED_S7_TAG_MAP: Record<string, TagDefinition> = {
  // ─── ParkIO_Data [DB1] (all 25 verified Booleans: 0.0 .. 3.0) ───
  fault_db_tag: { address: 'DB1,X0.0', dataType: 'BOOL', access: 'R', description: 'ParkIO_Data.FAULT_DB' },
  emg_db_tag: { address: 'DB1,X0.1', dataType: 'BOOL', access: 'R', description: 'ParkIO_Data.EMG_DB' },
  pfail_db_tag: { address: 'DB1,X0.2', dataType: 'BOOL', access: 'R', description: 'ParkIO_Data.PFAIL_DB' },
  auto_mode_tag: { address: 'DB1,X0.3', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Auto_DB' },
  machine_state_tag: { address: 'DB1,X0.3', dataType: 'BOOL', access: 'R', description: 'ParkIO_Data.Auto_DB (Active Auto State)' },
  auto_ok_tag: { address: 'DB1,X0.4', dataType: 'BOOL', access: 'R', description: 'ParkIO_Data.AutoOK_DB' },
  manual_mode_tag: { address: 'DB1,X0.5', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Manual_DB' },
  manual_ok_tag: { address: 'DB1,X0.6', dataType: 'BOOL', access: 'R', description: 'ParkIO_Data.ManualOK_DB' },
  pcell_inside_db_tag: { address: 'DB1,X0.7', dataType: 'BOOL', access: 'R', description: 'ParkIO_Data.PCELL_inside_DB' },
  safety_ok_tag: { address: 'DB1,X0.7', dataType: 'BOOL', access: 'R', description: 'ParkIO_Data.PCELL_inside_DB (Photocell Safety)' },
  pcell_outside_db_tag: { address: 'DB1,X1.0', dataType: 'BOOL', access: 'R', description: 'ParkIO_Data.PCELL_outside_DB' },
  man_pump_tag: { address: 'DB1,X1.1', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_Pump_DB' },
  man_wall_tag: { address: 'DB1,X1.2', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_Wall_DB' },
  man_up_tag: { address: 'DB1,X1.3', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_Up_DB' },
  man_down_tag: { address: 'DB1,X1.4', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_Down_DB' },
  man_cutoff_tag: { address: 'DB1,X1.5', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_Cuttoff_DB' },
  man_l1_tag: { address: 'DB1,X1.6', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_L1_DB' },
  man_l2_tag: { address: 'DB1,X1.7', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_L2_DB' },
  man_l3_tag: { address: 'DB1,X2.0', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_L3_DB' },
  man_l4_tag: { address: 'DB1,X2.1', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_L4_DB' },
  man_s1_tag: { address: 'DB1,X2.2', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_LQ1_DB' },
  man_s2_tag: { address: 'DB1,X2.3', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_LQ2_DB' },
  man_s3_tag: { address: 'DB1,X2.4', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_LQ3_DB' },
  man_s4_tag: { address: 'DB1,X2.5', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.Man_LQ4_DB' },
  user_logoff_tag: { address: 'DB1,X2.6', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.User_Logoff' },
  sim_manual_tag: { address: 'DB1,X2.7', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data."Sim Manual"' },
  wall_sim_up_tag: { address: 'DB1,X3.0', dataType: 'BOOL', access: 'RW', description: 'ParkIO_Data.wall_sim_mun' },

  // ─── ParkDB [DB2] (all 14 verified rows 31–44: offsets 5.4 .. 10.3) ───
  step1_ready_tag: { address: 'DB2,X5.4', dataType: 'BOOL', access: 'RW', description: 'ParkDB.Park_Step1_Ready' },
  step1_done_tag: { address: 'DB2,X5.5', dataType: 'BOOL', access: 'R', description: 'ParkDB.Park_Step1_Done' },
  step2_ready_tag: { address: 'DB2,X5.6', dataType: 'BOOL', access: 'RW', description: 'ParkDB.Park_Step2_Ready' },
  step2_done_tag: { address: 'DB2,X5.7', dataType: 'BOOL', access: 'R', description: 'ParkDB.Park_Step2_Done' },
  step1_ok_tag: { address: 'DB2,X6.0', dataType: 'BOOL', access: 'R', description: 'ParkDB.Park_Step1_OK' },
  command_acknowledgement_tag: { address: 'DB2,X6.0', dataType: 'BOOL', access: 'R', description: 'ParkDB.Park_Step1_OK' },
  step2_ok_tag: { address: 'DB2,X6.1', dataType: 'BOOL', access: 'R', description: 'ParkDB.Park_Step2_OK' },
  command_complete_tag: { address: 'DB2,X6.1', dataType: 'BOOL', access: 'R', description: 'ParkDB.Park_Step2_OK' },
  auto_no_progress_tag: { address: 'DB2,X6.2', dataType: 'BOOL', access: 'R', description: 'ParkDB.Park_Auto_NoProgress' },
  park_command_tag: { address: 'DB2,X6.3', dataType: 'BOOL', access: 'RW', description: 'ParkDB.Park_IN' },
  retrieve_command_tag: { address: 'DB2,X6.4', dataType: 'BOOL', access: 'RW', description: 'ParkDB.Park_OUT' },
  alarm_tag: { address: 'DB2,W8', dataType: 'WORD', access: 'R', description: 'ParkDB."Alarm Word" (UInt @ 8.0)' },
  reset_command_tag: { address: 'DB2,X10.0', dataType: 'BOOL', access: 'RW', description: 'ParkDB.Reset' },
  maintenance_due_tag: { address: 'DB2,X10.1', dataType: 'BOOL', access: 'R', description: 'ParkDB.Period_Maintanence' },
  maintenance_reset_tag: { address: 'DB2,X10.2', dataType: 'BOOL', access: 'RW', description: 'ParkDB.New_Maintanence_period' },
  wall_valve_db_tag: { address: 'DB2,X10.3', dataType: 'BOOL', access: 'R', description: 'ParkDB.Wall_valve' },

  // ─── Memories (%M — verified from PLCTags_(1).xlsx) ───
  manual_trig_tag: { address: 'M0.0', dataType: 'BOOL', access: 'R', description: 'Manual_TRIG' },
  manual_action_tag: { address: 'M0.3', dataType: 'BOOL', access: 'RW', description: 'manual_action (required for Stoppers S1-S4 & Lanes L1-L4)' },
  accept_manual_tag: { address: 'M0.4', dataType: 'BOOL', access: 'R', description: 'Accept_action_manual' },
  reset_m_tag: { address: 'M0.5', dataType: 'BOOL', access: 'RW', description: 'Reset (%M0.5)' },
  fault_signal_tag: { address: 'M1.0', dataType: 'BOOL', access: 'R', description: 'Fault_Signal' },
  auto_signal_tag: { address: 'M1.1', dataType: 'BOOL', access: 'R', description: 'Auto_Signal' },
  manual_signal_tag: { address: 'M1.2', dataType: 'BOOL', access: 'R', description: 'Manual_Signal' },
  warning_tag: { address: 'M1.3', dataType: 'BOOL', access: 'R', description: 'warning' },
  cancel_step_tag: { address: 'M3.1', dataType: 'BOOL', access: 'RW', description: 'cancel_this_step' },
  cancel_mg_down_tag: { address: 'M3.2', dataType: 'BOOL', access: 'RW', description: 'Cancel MG for down' },
  obstacle_exist_tag: { address: 'M3.3', dataType: 'BOOL', access: 'R', description: 'Obstacle_exist' },
  check_loc_L1: { address: 'M3.4', dataType: 'BOOL', access: 'RW', description: 'Lane1_check_location' },
  check_loc_L2: { address: 'M3.5', dataType: 'BOOL', access: 'RW', description: 'Lane2_check_location' },
  check_loc_L3: { address: 'M3.6', dataType: 'BOOL', access: 'RW', description: 'Lane3_check_location' },
  check_loc_L4: { address: 'M3.7', dataType: 'BOOL', access: 'RW', description: 'Lane4_check_location' },
  alarm_up_lane_tag: { address: 'M4.0', dataType: 'BOOL', access: 'R', description: 'Alarm up lane' },
  wall_auto_tag: { address: 'M4.2', dataType: 'BOOL', access: 'R', description: 'wall_auto' },
  alarm_down_lane_tag: { address: 'M4.4', dataType: 'BOOL', access: 'R', description: 'Alarm down lane' },
  manual_action_sim_tag: { address: 'M5.2', dataType: 'BOOL', access: 'RW', description: 'manual_action sim' },
  obstacle_reset_tag: { address: 'M5.7', dataType: 'BOOL', access: 'RW', description: 'rest obstcal' },
  cancel_inside_sensor_tag: { address: 'M6.1', dataType: 'BOOL', access: 'RW', description: 'Cancel inside sensor' },
  cancel_outside_sensor_tag: { address: 'M6.2', dataType: 'BOOL', access: 'RW', description: 'Cancel outside sensor' },
  emergency_during_move_tag: { address: 'M7.0', dataType: 'BOOL', access: 'R', description: 'emergency during up or down' },
  complete_seq_tag: { address: 'M7.1', dataType: 'BOOL', access: 'RW', description: 'complete the seq' },
  wall_sim_down_tag: { address: 'M7.2', dataType: 'BOOL', access: 'RW', description: 'wall down_hmi' },
  allow_up_wall_auto_tag: { address: 'M7.3', dataType: 'BOOL', access: 'R', description: 'allow to up wall auto' },
  siren_manual_tag: { address: 'M9.0', dataType: 'BOOL', access: 'R', description: 'Siren_Manual_HMI' },
  siren_auto_tag: { address: 'M9.1', dataType: 'BOOL', access: 'R', description: 'Siren_Auto' },
  siren_silencer_tag: { address: 'M9.7', dataType: 'BOOL', access: 'RW', description: 'Siren Silencer' },
  step1_start_tag: { address: 'M10.0', dataType: 'BOOL', access: 'RW', description: 'Park_IN_Step1_Start' },
  step2_start_tag: { address: 'M10.1', dataType: 'BOOL', access: 'RW', description: 'Park_IN_Step2_Start' },
  group_alarm_word_tag: { address: 'MW12', dataType: 'WORD', access: 'R', description: 'Group_Alarm_Word (%MW12)' },
  emergency_status_tag: { address: 'M50.0', dataType: 'BOOL', access: 'R', description: 'Emergency Stop' },
  pump_overload_tag: { address: 'M50.1', dataType: 'BOOL', access: 'R', description: 'Hydrulic Pump O.L' },
  compressor_overload_tag: { address: 'M50.2', dataType: 'BOOL', access: 'R', description: 'Compressor O.L' },
  error_in_position_tag: { address: 'M50.3', dataType: 'BOOL', access: 'R', description: 'Error_in_Position' },
  stopper_fault_tag: { address: 'M50.4', dataType: 'BOOL', access: 'R', description: 'stopper_not_energize' },
  lift_invalid_pos_tag: { address: 'M50.5', dataType: 'BOOL', access: 'R', description: 'Lift_not_in_vaild_position' },
  alarm_section_tag: { address: 'MW50', dataType: 'WORD', access: 'R', description: 'Alarm Section (%MW50)' },
  command_error_tag: { address: 'MW50', dataType: 'WORD', access: 'R', description: 'Alarm Section (%MW50)' },
  heartbeat_tag: { address: 'M60.3', dataType: 'BOOL', access: 'R', description: 'Clock_2Hz (%M60.3)' },
  allow_wall_tag: { address: 'M200.0', dataType: 'BOOL', access: 'RW', description: 'Allow wall' },
  first_scan_tag: { address: 'M450.0', dataType: 'BOOL', access: 'R', description: 'FirstScan' },

  // ─── Physical Digital Inputs (%I — verified from TIA Portal "PLC tags → Inputs [24]" screenshot) ───
  main_pf_in_tag: { address: 'I0.0', dataType: 'BOOL', access: 'R', description: 'MAIN_PF_1 — Phase failure switch closed' },
  pcell_in_1_tag: { address: 'I0.1', dataType: 'BOOL', access: 'R', description: 'PCELL_IN_1 — Photocell switch' },
  out_photocell_tag: { address: 'I0.2', dataType: 'BOOL', access: 'R', description: 'out_photocell — Photocell switch' },
  pump_ol_in_tag: { address: 'I0.3', dataType: 'BOOL', access: 'R', description: 'PUMP_OL — Hydraulic pump overload' },
  comp_ol_in_tag: { address: 'I0.4', dataType: 'BOOL', access: 'R', description: 'COMP_OL — Compressor overload' },
  spare_in2_tag: { address: 'I0.5', dataType: 'BOOL', access: 'R', description: 'SPARE_IN2' },
  spare_in3_tag: { address: 'I0.6', dataType: 'BOOL', access: 'R', description: 'SPARE_IN3' },
  emergency_in_tag: { address: 'I0.7', dataType: 'BOOL', access: 'R', description: 'EMERGENCY — Emergency switch ES1 + ES2' },
  mg_prot_L1: { address: 'I2.0', dataType: 'BOOL', access: 'R', description: 'PL1_MG_PROT — Lane 1 mechanical group protection' },
  mg_prot_L2: { address: 'I2.1', dataType: 'BOOL', access: 'R', description: 'PL2_MG_PROT — Lane 2 mechanical group protection' },
  mg_prot_L3: { address: 'I2.2', dataType: 'BOOL', access: 'R', description: 'PL3_MG_PROT — Lane 3 mechanical group protection' },
  mg_prot_L4: { address: 'I2.3', dataType: 'BOOL', access: 'R', description: 'PL4_MG_PROT — Lane 4 mechanical group protection' },
  ls_L1_btm: { address: 'I2.4', dataType: 'BOOL', access: 'R', description: 'PL1_LS_BTM — Lane 1 bottom limit switch' },
  ls_L2_btm: { address: 'I2.5', dataType: 'BOOL', access: 'R', description: 'PL2_LS_BTM — Lane 2 bottom limit switch' },
  ls_L3_btm: { address: 'I2.6', dataType: 'BOOL', access: 'R', description: 'PL3_LS_BTM — Lane 3 bottom limit switch' },
  ls_L4_btm: { address: 'I2.7', dataType: 'BOOL', access: 'R', description: 'PL4_LS_BTM — Lane 4 bottom limit switch' },
  ls_L1_top: { address: 'I3.0', dataType: 'BOOL', access: 'R', description: 'PL1_LS_TOP — Lane 1 top limit switch' },
  ls_L2_top: { address: 'I3.1', dataType: 'BOOL', access: 'R', description: 'PL2_LS_TOP — Lane 2 top limit switch' },
  ls_L3_top: { address: 'I3.2', dataType: 'BOOL', access: 'R', description: 'PL3_LS_TOP — Lane 3 top limit switch' },
  ls_L4_top: { address: 'I3.3', dataType: 'BOOL', access: 'R', description: 'PL4_LS_TOP — Lane 4 top limit switch' },
  ls_L1_mid: { address: 'I3.4', dataType: 'BOOL', access: 'R', description: 'PL1_LS_MID — Lane 1 middle limit switch' },
  ls_L2_mid: { address: 'I3.5', dataType: 'BOOL', access: 'R', description: 'PL2_LS_MID — Lane 2 middle limit switch' },
  ls_L3_mid: { address: 'I3.6', dataType: 'BOOL', access: 'R', description: 'PL3_LS_MID — Lane 3 middle limit switch' },
  ls_L4_mid: { address: 'I3.7', dataType: 'BOOL', access: 'R', description: 'PL4_LS_MID — Lane 4 middle limit switch' },
};

import { Protocol, RequestType } from '../../../common/enums';
import { IntegrationSettings } from '../integration-settings';
import { mapUiFloorToPlcLevel, SiemensS7Adapter } from './siemens-s7.adapter';

function buildFullVerifiedSettings(): IntegrationSettings {
  return {
    protocol: Protocol.SIEMENS_S7,
    plcModel: 'SIMATIC S7-1200 CPU 1212C',
    host: '192.168.0.27',
    port: 102,
    rack: 0,
    slot: 1,
    opcuaEndpoint: null,
    opcuaSecurityMode: 'None',
    opcuaUsername: null,
    opcuaPassword: null,
    modbusUnitId: 1,
    mqttUrl: null,
    mqttTopicPrefix: 'autopark/plc',
    mqttUsername: null,
    mqttPassword: null,
    restBaseUrl: null,
    restApiKey: null,
    pollIntervalMs: 800,
    ackTimeoutMs: 5000,
    completionTimeoutMs: 30000,
    heartbeatTimeoutMs: 10000,
    supportsIdempotentCommands: true,
    readOnly: false,
    syncSpacesFromController: false,
    alarmDefinitions: [],
    tagMap: {
      // ParkIO_Data [DB1] (verified screenshot)
      auto_mode_tag: { address: 'DB1,X0.3', dataType: 'BOOL', access: 'RW', description: 'Auto_DB' },
      manual_mode_tag: { address: 'DB1,X0.5', dataType: 'BOOL', access: 'RW', description: 'Manual_DB' },
      manual_ok_tag: { address: 'DB1,X0.6', dataType: 'BOOL', access: 'R', description: 'ManualOK_DB' },
      man_pump_tag: { address: 'DB1,X1.1', dataType: 'BOOL', access: 'RW', description: 'Man_Pump_DB' },
      man_wall_tag: { address: 'DB1,X1.2', dataType: 'BOOL', access: 'RW', description: 'Man_Wall_DB' },
      man_up_tag: { address: 'DB1,X1.3', dataType: 'BOOL', access: 'RW', description: 'Man_Up_DB' },
      man_down_tag: { address: 'DB1,X1.4', dataType: 'BOOL', access: 'RW', description: 'Man_Down_DB' },
      man_cutoff_tag: { address: 'DB1,X1.5', dataType: 'BOOL', access: 'RW', description: 'Man_Cuttoff_DB' },
      man_l1_tag: { address: 'DB1,X1.6', dataType: 'BOOL', access: 'RW', description: 'Man_L1_DB' },
      man_l2_tag: { address: 'DB1,X1.7', dataType: 'BOOL', access: 'RW', description: 'Man_L2_DB' },
      man_l3_tag: { address: 'DB1,X2.0', dataType: 'BOOL', access: 'RW', description: 'Man_L3_DB' },
      man_l4_tag: { address: 'DB1,X2.1', dataType: 'BOOL', access: 'RW', description: 'Man_L4_DB' },
      man_s1_tag: { address: 'DB1,X2.2', dataType: 'BOOL', access: 'RW', description: 'Man_LQ1_DB' },
      man_s2_tag: { address: 'DB1,X2.3', dataType: 'BOOL', access: 'RW', description: 'Man_LQ2_DB' },
      man_s3_tag: { address: 'DB1,X2.4', dataType: 'BOOL', access: 'RW', description: 'Man_LQ3_DB' },
      man_s4_tag: { address: 'DB1,X2.5', dataType: 'BOOL', access: 'RW', description: 'Man_LQ4_DB' },
      user_logoff_tag: { address: 'DB1,X2.6', dataType: 'BOOL', access: 'RW', description: 'User_Logoff' },
      sim_manual_tag: { address: 'DB1,X2.7', dataType: 'BOOL', access: 'RW', description: 'Sim Manual' },

      // ParkDB [DB2] (verified rows 31-44 + dry-run test addresses for Lane/Level bytes)
      lane_number_tag: { address: 'DB2,B3', dataType: 'INT', access: 'RW', description: 'ParkDB.Lane_Number' },
      level_number_tag: { address: 'DB2,B4', dataType: 'INT', access: 'RW', description: 'ParkDB.Level_Number' },
      step1_ready_tag: { address: 'DB2,X5.4', dataType: 'BOOL', access: 'RW', description: 'Park_Step1_Ready' },
      step2_ready_tag: { address: 'DB2,X5.6', dataType: 'BOOL', access: 'RW', description: 'Park_Step2_Ready' },
      step1_ok_tag: { address: 'DB2,X6.0', dataType: 'BOOL', access: 'R', description: 'Park_Step1_OK' },
      step2_ok_tag: { address: 'DB2,X6.1', dataType: 'BOOL', access: 'R', description: 'Park_Step2_OK' },
      park_command_tag: { address: 'DB2,X6.3', dataType: 'BOOL', access: 'RW', description: 'Park_IN' },
      retrieve_command_tag: { address: 'DB2,X6.4', dataType: 'BOOL', access: 'RW', description: 'Park_OUT' },
      alarm_tag: { address: 'DB2,W8', dataType: 'INT', access: 'R', description: 'Alarm Word' },
      reset_command_tag: { address: 'DB2,X10.0', dataType: 'BOOL', access: 'RW', description: 'ParkDB.Reset' },
      maintenance_due_tag: { address: 'DB2,X10.1', dataType: 'BOOL', access: 'R', description: 'Period_Maintanence' },
      maintenance_reset_tag: { address: 'DB2,X10.2', dataType: 'BOOL', access: 'RW', description: 'New_Maintanence_period' },

      // Merkers (%M — verified from PLCTags_(1).xlsx)
      manual_action_tag: { address: 'M0.3', dataType: 'BOOL', access: 'RW', description: 'manual_action' },
      reset_m_tag: { address: 'M0.5', dataType: 'BOOL', access: 'RW', description: 'Reset' },
      cancel_step_tag: { address: 'M3.1', dataType: 'BOOL', access: 'RW', description: 'cancel_this_step' },
      obstacle_exist_tag: { address: 'M3.3', dataType: 'BOOL', access: 'R', description: 'Obstacle_exist' },
      check_loc_L1: { address: 'M3.4', dataType: 'BOOL', access: 'RW', description: 'Lane1_check_location' },
      check_loc_L2: { address: 'M3.5', dataType: 'BOOL', access: 'RW', description: 'Lane2_check_location' },
      check_loc_L3: { address: 'M3.6', dataType: 'BOOL', access: 'RW', description: 'Lane3_check_location' },
      check_loc_L4: { address: 'M3.7', dataType: 'BOOL', access: 'RW', description: 'Lane4_check_location' },
      obstacle_reset_tag: { address: 'M5.7', dataType: 'BOOL', access: 'RW', description: 'rest obstcal' },
      emergency_during_move_tag: { address: 'M7.0', dataType: 'BOOL', access: 'R', description: 'emergency during up or down' },
      complete_seq_tag: { address: 'M7.1', dataType: 'BOOL', access: 'RW', description: 'complete the seq' },
      siren_silencer_tag: { address: 'M9.7', dataType: 'BOOL', access: 'RW', description: 'Siren Silencer' },
      step1_start_tag: { address: 'M10.0', dataType: 'BOOL', access: 'RW', description: 'Park_IN_Step1_Start' },
      step2_start_tag: { address: 'M10.1', dataType: 'BOOL', access: 'RW', description: 'Park_IN_Step2_Start' },
      emergency_status_tag: { address: 'M50.0', dataType: 'BOOL', access: 'R', description: 'Emergency Stop' },
      pump_overload_tag: { address: 'M50.1', dataType: 'BOOL', access: 'R', description: 'Hydrulic Pump O.L' },
      compressor_overload_tag: { address: 'M50.2', dataType: 'BOOL', access: 'R', description: 'Compressor O.L' },
      error_in_position_tag: { address: 'M50.3', dataType: 'BOOL', access: 'R', description: 'Error_in_Position' },
      stopper_fault_tag: { address: 'M50.4', dataType: 'BOOL', access: 'R', description: 'stopper_not_energize' },
      lift_invalid_pos_tag: { address: 'M50.5', dataType: 'BOOL', access: 'R', description: 'Lift_not_in_vaild_position' },
      alarm_section_tag: { address: 'MW50', dataType: 'INT', access: 'R', description: 'Alarm Section' },
      allow_wall_tag: { address: 'M200.0', dataType: 'BOOL', access: 'RW', description: 'Allow wall' },
    },
  };
}

describe('SiemensS7Adapter — Safe Dry-Run Simulation (ZERO Physical Movement)', () => {
  let adapter: SiemensS7Adapter;

  beforeEach(() => {
    adapter = new SiemensS7Adapter(buildFullVerifiedSettings(), true);
    adapter.enableDryRun({
      emergency_status_tag: false,
      obstacle_exist_tag: false,
      lift_invalid_pos_tag: false,
      alarm_tag: 0,
      alarm_section_tag: 0,
    });
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  test('mapUiFloorToPlcLevel matches TIA Portal PDF directly (L11=1, L12=2, L13=3)', () => {
    expect(mapUiFloorToPlcLevel(1)).toBe(1);
    expect(mapUiFloorToPlcLevel(2)).toBe(2);
    expect(mapUiFloorToPlcLevel(3)).toBe(3);
  });

  const makeCmd = (commandId: string, sequence: number, type: RequestType, spaceNumber: string) => ({
    commandId,
    sequence,
    type,
    spaceNumber,
    level: Number(spaceNumber.slice(-1)) || 1,
    zone: spaceNumber.slice(0, 2),
    controllerRef: spaceNumber,
    plateNumber: '22-78910',
    vehicleId: 'veh-dry',
    issuedAt: new Date(),
  });

  test('PARK IN (L32) emits exact TIA Portal 2-step sequence without pulsing latched start bits', async () => {
    await adapter.sendParkCommand(makeCmd('CMD-DRY-PARK-L32', 1, RequestType.PARK, 'L32'));

    // Wait for fast dry-run step 2 completion (~200ms)
    await new Promise((r) => setTimeout(r, 260));

    const writes = adapter.getDryRunWrites();
    const seq = writes.map((w) => `${w.tagKey}:${w.address}=${w.value}`);

    // Pre-reset manual/logoff flags (PDF pp. 102-103)
    expect(seq).toContain('user_logoff_tag:DB1,X2.6=false');
    expect(seq).toContain('manual_mode_tag:DB1,X0.5=false');
    expect(seq).toContain('sim_manual_tag:DB1,X2.7=false');
    expect(seq).toContain('manual_action_tag:M0.3=false');

    // Park-IN Lane3_check_location press event (PDF p. 58)
    expect(seq).toContain('check_loc_L3:M3.6=true');

    // Exact Lane & Level (NOT inverted!)
    expect(seq).toContain('lane_number_tag:DB2,B3=3');
    expect(seq).toContain('level_number_tag:DB2,B4=2');

    // Park_IN latched ON (never pulsed false!), Auto_DB ON
    expect(seq).toContain('park_command_tag:DB2,X6.3=true');
    expect(seq).not.toContain('park_command_tag:DB2,X6.3=false');
    expect(seq).toContain('auto_mode_tag:DB1,X0.3=true');

    // Step 1: Ready=true -> Step1_Start latched true -> Ready=false (PDF p. 108)
    expect(seq).toContain('step1_ready_tag:DB2,X5.4=true');
    expect(seq).toContain('step1_start_tag:M10.0=true');
    expect(seq).not.toContain('step1_start_tag:M10.0=false');
    expect(seq).toContain('step1_ready_tag:DB2,X5.4=false');

    // Step 2: Step2_Start latched true -> Step2_Ready=false (PDF p. 104)
    expect(seq).toContain('step2_start_tag:M10.1=true');
    expect(seq).not.toContain('step2_start_tag:M10.1=false');
    expect(seq).toContain('step2_ready_tag:DB2,X5.6=false');

    const fb = await adapter.getCommandStatus('CMD-DRY-PARK-L32');
    expect(fb.status).toBe('COMPLETED');
    expect(fb.progress).toBe(100);
  });

  test('RETRIEVE OUT (L41) sets Lane=4, Level=1 and latches Park_OUT (DB2,X6.4)', async () => {
    await adapter.sendRetrieveCommand(makeCmd('CMD-DRY-RET-L41', 2, RequestType.RETRIEVE, 'L41'));
    await new Promise((r) => setTimeout(r, 260));

    const writes = adapter.getDryRunWrites();
    const seq = writes.map((w) => `${w.tagKey}:${w.address}=${w.value}`);

    expect(seq).toContain('lane_number_tag:DB2,B3=4');
    expect(seq).toContain('level_number_tag:DB2,B4=1');
    expect(seq).toContain('retrieve_command_tag:DB2,X6.4=true');
    expect(seq).not.toContain('retrieve_command_tag:DB2,X6.4=false');
    expect(seq).toContain('step1_start_tag:M10.0=true');
    expect(seq).toContain('step2_start_tag:M10.1=true');
  });

  test('Manual UP / DOWN enforce strict hydraulic interlock (UP clears DOWN+Cutoff; DOWN clears UP+Pump+Cutoff)', async () => {
    await adapter.manualControl('manual_mode_tag', true);
    adapter.clearDryRunWrites();

    await adapter.manualControl('man_up_tag', true);
    let seq = adapter.getDryRunWrites().map((w) => `${w.address}=${w.value}`);
    expect(seq).toEqual(['DB1,X1.4=false', 'DB1,X1.5=false', 'DB1,X1.3=true']);

    adapter.clearDryRunWrites();
    await adapter.manualControl('man_down_tag', true);
    seq = adapter.getDryRunWrites().map((w) => `${w.address}=${w.value}`);
    expect(seq).toEqual(['DB1,X1.3=false', 'DB1,X1.1=false', 'DB1,X1.5=false', 'DB1,X1.4=true']);
  });

  test('Manual Stoppers S1-S4 & Lanes L1-L4 (including L2) set/reset manual_action (%M0.3)', async () => {
    const pairs: Array<[string, string]> = [
      ['man_s1_tag', 'DB1,X2.2'],
      ['man_s2_tag', 'DB1,X2.3'],
      ['man_s3_tag', 'DB1,X2.4'],
      ['man_s4_tag', 'DB1,X2.5'],
      ['man_l1_tag', 'DB1,X1.6'],
      ['man_l2_tag', 'DB1,X1.7'],
      ['man_l3_tag', 'DB1,X2.0'],
      ['man_l4_tag', 'DB1,X2.1'],
    ];

    for (const [key, addr] of pairs) {
      adapter.clearDryRunWrites();
      await adapter.manualControl(key, true);
      expect(adapter.getDryRunWrites().map((w) => `${w.address}=${w.value}`)).toEqual([
        `${addr}=true`,
        'M0.3=true',
      ]);

      adapter.clearDryRunWrites();
      await adapter.manualControl(key, false);
      expect(adapter.getDryRunWrites().map((w) => `${w.address}=${w.value}`)).toEqual([
        `${addr}=false`,
        'M0.3=false',
      ]);
    }
  });

  test('stop_all_manual safely releases all 14 manual actuators and manual_action (%M0.3)', async () => {
    adapter.clearDryRunWrites();
    await adapter.manualControl('stop_all_manual', false);
    const writes = adapter.getDryRunWrites();
    expect(writes.length).toBe(14);
    expect(writes.every((w) => w.value === false)).toBe(true);
    expect(writes.some((w) => w.address === 'M0.3')).toBe(true);
    expect(writes.some((w) => w.address === 'DB1,X1.1')).toBe(true);
  });

  test('Safety Interlocks: E-Stop, Obstacle, and Invalid Lift Position block commands; physical Q writes rejected', async () => {
    // 1. Direct physical output Q write is strictly forbidden
    await expect(adapter.writePlcTag('Q0.0', true)).rejects.toThrow(/prohibited/i);
    await expect(adapter.writePlcTag('QB2', 1)).rejects.toThrow(/prohibited/i);

    // 2. Emergency Stop blocks manual pump & park commands
    adapter.setDryRunSensorValues({ emergency_status_tag: true });
    await expect(adapter.manualControl('man_pump_tag', true)).rejects.toThrow(/Emergency Stop/i);
    await expect(
      adapter.sendParkCommand(makeCmd('CMD-BLOCKED-ESTOP', 3, RequestType.PARK, 'L11')),
    ).rejects.toThrow(/Emergency Stop/i);

    // 3. Obstacle blocks park command
    adapter.setDryRunSensorValues({ emergency_status_tag: false, obstacle_exist_tag: true });
    await expect(
      adapter.sendParkCommand(makeCmd('CMD-BLOCKED-OBS', 4, RequestType.PARK, 'L11')),
    ).rejects.toThrow(/Obstacle/i);

    // 4. Invalid lift position blocks park command
    adapter.setDryRunSensorValues({ obstacle_exist_tag: false, lift_invalid_pos_tag: true });
    await expect(
      adapter.sendParkCommand(makeCmd('CMD-BLOCKED-POS', 5, RequestType.PARK, 'L11')),
    ).rejects.toThrow(/valid position/i);
  });

  test('Motor/Compressor Overload & Alarm decoding + SAFE_RESET never force-zeros DB2,W8', async () => {
    adapter.setDryRunSensorValues({
      pump_overload_tag: true,
      compressor_overload_tag: true,
      error_in_position_tag: true,
      stopper_fault_tag: true,
      maintenance_due_tag: true,
    });
    const alarms = await adapter.getActiveAlarms();
    const codes = alarms.map((a) => a.code);
    expect(codes).toContain('PLC_HYDRAULIC_PUMP_OVERLOAD');
    expect(codes).toContain('PLC_COMPRESSOR_OVERLOAD');
    expect(codes).toContain('PLC_ERROR_IN_POSITION');
    expect(codes).toContain('PLC_STOPPER_NOT_ENERGIZED');
    expect(codes).toContain('PLC_PERIOD_MAINTENANCE');

    adapter.clearDryRunWrites();
    await adapter.emergencyRecovery('SAFE_RESET');
    const writes = adapter.getDryRunWrites().map((w) => `${w.address}=${w.value}`);
    expect(writes).toContain('M0.5=false');
    expect(writes).toContain('DB2,X10.0=true');
    expect(writes.some((w) => w.startsWith('DB2,W8='))).toBe(false);
  });
});

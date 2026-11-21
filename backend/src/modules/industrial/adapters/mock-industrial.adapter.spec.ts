import { RequestType } from '../../../common/enums';
import { MockIndustrialAdapter } from './mock-industrial.adapter';

describe('MockIndustrialAdapter safety & simulation behavior', () => {
  let adapter: MockIndustrialAdapter;

  beforeEach(async () => {
    adapter = new MockIndustrialAdapter({ speedFactor: 20, failureRate: 0, randomAlarms: false });
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('completes a park command through ACKNOWLEDGED -> EXECUTING -> COMPLETED', async () => {
    const statuses: string[] = [];
    adapter.subscribeToEvents((ev) => {
      if (ev.type === 'COMMAND') statuses.push(ev.feedback.status);
    });

    await adapter.sendParkCommand({
      commandId: 'CMD-TEST-1',
      sequence: 1,
      type: RequestType.PARK,
      spaceNumber: 'L1-A01',
      level: 1,
      zone: 'A',
      controllerRef: '1',
      plateNumber: 'ABC 1234',
      vehicleId: 'veh-1',
    });

    await new Promise((r) => setTimeout(r, 1500));
    expect(statuses).toContain('ACKNOWLEDGED');
    expect(statuses).toContain('EXECUTING');
    expect(statuses[statuses.length - 1]).toBe('COMPLETED');
  });

  it('rejects commands when Emergency Stop is active or controller is offline', async () => {
    await adapter.applyScenario('EMERGENCY_STOP');
    await expect(
      adapter.sendParkCommand({
        commandId: 'CMD-TEST-ESTOP',
        sequence: 2,
        type: RequestType.PARK,
        spaceNumber: 'L1-A01',
        level: 1,
        zone: 'A',
        controllerRef: '1',
        plateNumber: 'ABC 1234',
        vehicleId: 'veh-1',
      }),
    ).rejects.toThrow(/Emergency stop/i);

    await adapter.applyScenario('CLEAR_EMERGENCY');
    await adapter.applyScenario('GO_OFFLINE');
    await expect(
      adapter.sendRetrieveCommand({
        commandId: 'CMD-TEST-OFFLINE',
        sequence: 3,
        type: RequestType.RETRIEVE,
        spaceNumber: 'L1-A01',
        level: 1,
        zone: 'A',
        controllerRef: '1',
        plateNumber: 'ABC 1234',
        vehicleId: 'veh-1',
      }),
    ).rejects.toThrow(/not connected/i);
  });
});

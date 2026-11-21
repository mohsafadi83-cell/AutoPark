import { INestApplication } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { spawnEmbeddedPostgresProcess } from '../scripts/embedded-postgres';
import { createConfiguredApp } from '../src/main';

describe('Auto Park Backend E2E (Safety, Security, Industrial Control)', () => {
  let app: INestApplication;
  let pgHandle: { stop: () => Promise<void> } | null = null;
  let superAdminToken = '';
  let operatorToken = '';
  let customerToken = '';
  let viewerToken = '';

  beforeAll(async () => {
    const testDbPort = 54336;
    process.env.NODE_ENV = 'test';
    process.env.APP_MODE = 'SIMULATION';
    process.env.DB_PORT = String(testDbPort);
    process.env.SEED_DEMO = 'true';
    process.env.MOCK_SPEED_FACTOR = '25';
    process.env.COMMAND_ACK_TIMEOUT_MS = '1200';
    process.env.LAYOUT_LEVELS = '2';
    process.env.LAYOUT_ZONES = 'A';
    process.env.LAYOUT_SPACES_PER_ZONE = '4';

    const dataDir = path.join(os.tmpdir(), `autopark-e2e-${Date.now()}`);
    pgHandle = await spawnEmbeddedPostgresProcess({ port: testDbPort, dataDir });

    const created = await createConfiguredApp();
    app = created.app;
    await app.init();

    const login = async (username: string, password: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password })
        .expect(200);
      return res.body.accessToken as string;
    };

    superAdminToken = await login('superadmin', 'Admin@12345');
    operatorToken = await login('operator', 'Operator@123');
    customerToken = await login('customer', 'Customer@123');
    viewerToken = await login('viewer', 'Viewer@1234');
  });

  afterAll(async () => {
    await app?.close();
    await pgHandle?.stop();
  });

  it('GET /api/v1/health returns ok and current mode/adapter', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.mode).toBe('SIMULATION');
    expect(res.body.adapter).toBe('MOCK');
  });

  it('rotates refresh tokens and revokes family on token reuse', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'customer', password: 'Customer@123' })
      .expect(200);
    const rt1 = loginRes.body.refreshToken;

    const ref1 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rt1 })
      .expect(200);
    const rt2 = ref1.body.refreshToken;
    expect(rt2).not.toBe(rt1);

    // Reusing rt1 must fail and revoke rt2's family
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: rt1 }).expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: rt2 }).expect(401);
  });

  it('enforces RBAC: Read-Only and Customer cannot access admin/config endpoints or control other vehicles', async () => {
    // Viewer cannot request parking
    await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ plateNumber: 'ABC 1234' })
      .expect(403);

    // Customer cannot view or change industrial config
    await request(app.getHttpServer())
      .get('/api/v1/industrial/config')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    // Customer cannot park operator's vehicle (RYD 5500)
    await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: 'RYD 5500' })
      .expect(403);
  });

  it('rejects invalid vehicle, already-parked vehicle on PARK, and non-parked vehicle on RETRIEVE', async () => {
    // Unknown vehicle for customer
    const nf = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: 'NON EXISTENT' })
      .expect(404);
    expect(nf.body.code).toBe('VEHICLE_NOT_FOUND');

    // KSA 9080 is already parked in L1-A02
    const ap = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: 'KSA 9080' })
      .expect(409);
    expect(ap.body.code).toBe('VEHICLE_ALREADY_PARKED');

    // ABC 1234 is not parked yet -> cannot retrieve
    const np = await request(app.getHttpServer())
      .post('/api/v1/parking/retrieve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: 'ABC 1234' })
      .expect(409);
    expect(np.body.code).toBe('VEHICLE_NOT_PARKED');
  });

  it('executes full PARK -> COMPLETED and RETRIEVE -> COMPLETED lifecycle and prevents duplicate commands', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: 'ABC 1234' })
      .expect(201);

    const reqId = createRes.body.id;
    expect(createRes.body.command.commandId).toMatch(/^CMD-/);

    // Final step must NOT be marked DONE before controller completes
    const finalStepInitial = createRes.body.steps.find((s: { key: string }) => s.key === 'PARKING_COMPLETED');
    expect(finalStepInitial.status).toBe('PENDING');

    // Duplicate command / active request for same vehicle must be rejected
    const dupRes = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: 'ABC 1234' })
      .expect(409);
    expect(['DUPLICATE_REQUEST', 'MACHINE_BUSY']).toContain(dupRes.body.code);

    // Wait for mock controller to finish parking
    let completed = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const poll = await request(app.getHttpServer())
        .get(`/api/v1/parking/requests/${reqId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      if (poll.body.status === 'COMPLETED') {
        completed = true;
        const finalStep = poll.body.steps.find((s: { key: string }) => s.key === 'PARKING_COMPLETED');
        expect(finalStep.status).toBe('DONE');
        break;
      }
    }
    expect(completed).toBe(true);

    // Now retrieve ABC 1234
    const retRes = await request(app.getHttpServer())
      .post('/api/v1/parking/retrieve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: 'ABC 1234' })
      .expect(201);

    let retCompleted = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const poll = await request(app.getHttpServer())
        .get(`/api/v1/parking/requests/${retRes.body.id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      if (poll.body.status === 'COMPLETED') {
        retCompleted = true;
        const finalStep = poll.body.steps.find((s: { key: string }) => s.key === 'VEHICLE_READY');
        expect(finalStep.status).toBe('DONE');
        break;
      }
    }
    expect(retCompleted).toBe(true);
  });

  it('handles controller offline, critical alarm interlock, acknowledgement, and command timeout safely', async () => {
    // 1. Controller offline -> blocks commands
    await request(app.getHttpServer())
      .post('/api/v1/simulation/scenario')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ scenario: 'GO_OFFLINE' })
      .expect(201);

    const offRes = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: 'ABC 1234' })
      .expect(409);
    expect(offRes.body.code).toBe('SYSTEM_OFFLINE');

    await request(app.getHttpServer())
      .post('/api/v1/simulation/scenario')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ scenario: 'GO_ONLINE' })
      .expect(201);

    // 2. Critical alarm -> blocks commands; operator can acknowledge, but only controller clears
    await request(app.getHttpServer())
      .post('/api/v1/simulation/scenario')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ scenario: 'RAISE_CRITICAL' })
      .expect(201);

    const alarmsRes = await request(app.getHttpServer())
      .get('/api/v1/alarms?status=ACTIVE')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(alarmsRes.body.items.length).toBeGreaterThan(0);
    const alarmId = alarmsRes.body.items[0].id;

    // Acknowledge alarm
    const ackRes = await request(app.getHttpServer())
      .post(`/api/v1/alarms/${alarmId}/acknowledge`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ note: 'Inspected entry gate' })
      .expect(201);
    expect(ackRes.body.status).toBe('ACKNOWLEDGED');

    // Still blocks physical command until controller resolves the critical alarm
    const critRes = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: 'ABC 1234' })
      .expect(409);
    expect(['CRITICAL_ALARM_ACTIVE', 'SAFETY_INTERLOCK', 'SYSTEM_NOT_READY']).toContain(critRes.body.code);

    // Controller clears alarms
    await request(app.getHttpServer())
      .post('/api/v1/simulation/scenario')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ scenario: 'CLEAR_ALARMS' })
      .expect(201);

    // 3. Timeout handling (TIMEOUT_NEXT) — command times out without automatic resend
    await request(app.getHttpServer())
      .post('/api/v1/simulation/scenario')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ scenario: 'TIMEOUT_NEXT' })
      .expect(201);

    const toReq = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: 'ABC 1234' })
      .expect(201);

    await new Promise((r) => setTimeout(r, 1600));
    const afterTo = await request(app.getHttpServer())
      .get(`/api/v1/parking/requests/${toReq.body.id}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(afterTo.body.status).toBe('FAILED');
    expect(afterTo.body.command.status).toBe('TIMEOUT');
  });

  it('allows admins to update industrial protocol/IP/tags at any time and masks secrets', async () => {
    const updated = await request(app.getHttpServer())
      .put('/api/v1/industrial/config')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        protocol: 'MOCK',
        plcModel: 'S7-1500 (Pending Supplier Info)',
        host: '192.168.0.10',
        port: 102,
        rack: 0,
        slot: 1,
        opcuaPassword: 'SuperSecretPlcPassword',
        tagMap: {
          system_ready_tag: { address: 'DB10,X0.0', dataType: 'BOOL', access: 'R' },
        },
      })
      .expect(200);

    expect(updated.body.host).toBe('192.168.0.10');
    expect(updated.body.opcuaPassword).toBe('********');
    expect(updated.body.tagMap.system_ready_tag.address).toBe('DB10,X0.0');
  });
});

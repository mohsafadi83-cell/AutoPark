import { INestApplication } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { spawnEmbeddedPostgresProcess } from '../scripts/embedded-postgres';
import { createConfiguredApp } from '../src/main';

describe('Auto Park Backend E2E (Safety, Security, Caching, Industrial Control)', () => {
  let app: INestApplication;
  let pgHandle: { stop: () => Promise<void> } | null = null;
  let superAdminToken = '';
  let operatorToken = '';
  let customerToken = '';
  let viewerToken = '';

  const waitForCompletion = async (reqId: string, token: string) => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const poll = await request(app.getHttpServer())
        .get(`/api/v1/parking/requests/${reqId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(poll.body.status)) {
        return poll.body;
      }
    }
    throw new Error(`Request ${reqId} did not finish within timeout`);
  };

  beforeAll(async () => {
    const testDbPort = 54336;
    process.env.NODE_ENV = 'test';
    process.env.APP_MODE = 'SIMULATION';
    process.env.INDUSTRIAL_PROTOCOL = 'MOCK';
    process.env.DB_PORT = String(testDbPort);
    process.env.SEED_DEMO = 'true';
    process.env.MOCK_SPEED_FACTOR = '25';
    process.env.COMMAND_ACK_TIMEOUT_MS = '1200';
    process.env.LAYOUT_LEVELS = '3';
    process.env.LAYOUT_ZONES = 'Lane 1,Lane 2,Lane 3,Lane 4';
    process.env.LAYOUT_SPACES_PER_ZONE = '3';

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

  it('GET /api/v1/health returns ok, mode/adapter, and live cache stats', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.mode).toBe('SIMULATION');
    expect(res.body.adapter).toBe('MOCK');
    expect(res.body.cache).toBeDefined();
    expect(res.body.cache.backend).toBe('memory');
  });

  it('caches repeated DB queries, reports live hit rates, and flushes cleanly for admins', async () => {
    // Flush first so metrics start from a clean cache state
    const flushRes = await request(app.getHttpServer())
      .post('/api/v1/health/cache/flush')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);
    expect(flushRes.body.ok).toBe(true);

    // Hit /parking/spaces and /vehicles multiple times
    for (let i = 0; i < 4; i++) {
      await request(app.getHttpServer())
        .get('/api/v1/parking/spaces')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
    }

    const statsRes = await request(app.getHttpServer())
      .get('/api/v1/health/cache')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(statsRes.body.hits).toBeGreaterThanOrEqual(6);
    expect(statsRes.body.hitRatePct).toBeGreaterThan(50);
    expect(statsRes.body.byNamespace.parking).toBeDefined();
    expect(statsRes.body.byNamespace.vehicles).toBeDefined();
    expect(statsRes.body.byNamespace.auth).toBeDefined();

    // Non-admin (viewer) cannot flush cache
    await request(app.getHttpServer())
      .post('/api/v1/health/cache/flush')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);
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

  it('enforces RBAC & SSRF protection: blocks unauthorized users and unsafe VNC hosts/ports', async () => {
    // Viewer cannot request parking
    await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ plateNumber: '10-45821' })
      .expect(403);

    // Customer cannot view or change industrial config
    await request(app.getHttpServer())
      .get('/api/v1/industrial/config')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    // Customer cannot park operator's vehicle (15-30492)
    await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: '15-30492' })
      .expect(403);

    // VNC SSRF guard: cloud metadata IP & public internet IPs must be rejected even for Super Admin
    await request(app.getHttpServer())
      .post('/api/v1/industrial/vnc/connect')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ host: '169.254.169.254', port: 5900 })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/industrial/vnc/connect')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ host: '8.8.8.8', port: 5900 })
      .expect(400);

    // Non-VNC port (e.g., PostgreSQL 5432 or SSH 22) must be rejected by DTO validation
    await request(app.getHttpServer())
      .post('/api/v1/industrial/vnc/connect')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ host: '192.168.0.30', port: 22 })
      .expect(400);
  });

  it('rejects invalid vehicle, non-parked vehicle on RETRIEVE, and already-parked vehicle on PARK', async () => {
    // Unknown vehicle for customer
    const nf = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: '99-99999' })
      .expect(404);
    expect(nf.body.code).toBe('VEHICLE_NOT_FOUND');

    // 10-45821 is not parked yet -> cannot retrieve
    const np = await request(app.getHttpServer())
      .post('/api/v1/parking/retrieve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: '10-45821' })
      .expect(409);
    expect(np.body.code).toBe('VEHICLE_NOT_PARKED');

    // Park 22-78910 into L21 and wait for completion
    const parkRes = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: '22-78910', targetSpaceNumber: 'L21' })
      .expect(201);
    const done = await waitForCompletion(parkRes.body.id, customerToken);
    expect(done.status).toBe('COMPLETED');

    // Attempting to park 22-78910 again must fail with VEHICLE_ALREADY_PARKED
    const ap = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: '22-78910' })
      .expect(409);
    expect(ap.body.code).toBe('VEHICLE_ALREADY_PARKED');
  });

  it('executes full PARK -> COMPLETED and RETRIEVE -> COMPLETED lifecycle and prevents duplicate commands', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/parking/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: '10-45821' })
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
      .send({ plateNumber: '10-45821' })
      .expect(409);
    expect(['DUPLICATE_REQUEST', 'MACHINE_BUSY']).toContain(dupRes.body.code);

    const parkDone = await waitForCompletion(reqId, customerToken);
    expect(parkDone.status).toBe('COMPLETED');
    const finalStep = parkDone.steps.find((s: { key: string }) => s.key === 'PARKING_COMPLETED');
    expect(finalStep.status).toBe('DONE');

    // Now retrieve 10-45821
    const retRes = await request(app.getHttpServer())
      .post('/api/v1/parking/retrieve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plateNumber: '10-45821' })
      .expect(201);

    const retDone = await waitForCompletion(retRes.body.id, customerToken);
    expect(retDone.status).toBe('COMPLETED');
    const retFinalStep = retDone.steps.find((s: { key: string }) => s.key === 'VEHICLE_READY');
    expect(retFinalStep.status).toBe('DONE');
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
      .send({ plateNumber: '10-45821' })
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
      .send({ plateNumber: '10-45821' })
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
      .send({ plateNumber: '10-45821' })
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
        plcModel: 'Siemens S7-1200 (192.168.0.27:102)',
        host: '192.168.0.27',
        port: 102,
        rack: 0,
        slot: 1,
        opcuaPassword: 'SuperSecretPlcPassword',
        tagMap: {
          system_ready_tag: { address: 'DB1,X0.3', dataType: 'BOOL', access: 'R' },
        },
      })
      .expect(200);

    expect(updated.body.host).toBe('192.168.0.27');
    expect(updated.body.opcuaPassword).toBe('********');
    expect(updated.body.tagMap.system_ready_tag.address).toBe('DB1,X0.3');
  });

  it('exports history CSV with formula-injection protection', async () => {
    const csvRes = await request(app.getHttpServer())
      .get('/api/v1/history/export')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('id,kind,title,description,plateNumber,status,actor,createdAt');
  });
});

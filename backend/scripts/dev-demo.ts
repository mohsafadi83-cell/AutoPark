/**
 * One-command local demo launcher:
 *   npm run dev:demo
 * Starts embedded PostgreSQL in a dedicated ESM subprocess and boots the NestJS server in SIMULATION mode.
 */
import 'dotenv/config';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { createConfiguredApp } from '../src/main';

function startPostgresSubprocess(port: number, dataDir: string): Promise<{ stop: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
    const pidFile = path.join(dataDir, 'postmaster.pid');
    if (!fresh && fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
      } catch {
        /* ignore */
      }
    }
    const script = `
      import('embedded-postgres').then(async ({ default: EmbeddedPostgres }) => {
        const pg = new EmbeddedPostgres({
          databaseDir: ${JSON.stringify(dataDir)},
          user: 'autopark',
          password: 'autopark_dev_password',
          port: ${port},
          persistent: true,
          onLog: () => {},
          onError: (m) => process.stderr.write(String(m) + '\\n'),
        });
        if (${fresh}) await pg.initialise();
        await pg.start();
        try { await pg.createDatabase('autopark'); } catch {}
        process.stdout.write('READY\\n');
        process.stdin.on('data', async () => {
          try { await pg.stop(); } catch {}
          process.exit(0);
        });
      }).catch((e) => {
        console.error(e);
        process.exit(1);
      });
    `;
    const child: ChildProcess = spawn(process.execPath, ['--input-type=module', '-e', script], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let ready = false;
    child.stdout?.on('data', (chunk: Buffer) => {
      if (!ready && chunk.toString().includes('READY')) {
        ready = true;
        resolve({
          stop: () =>
            new Promise<void>((r) => {
              child.once('exit', () => r());
              child.stdin?.write('stop\n');
              setTimeout(() => {
                child.kill();
                r();
              }, 4000).unref();
            }),
        });
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (!ready) process.stderr.write(chunk);
    });
    child.once('exit', (code) => {
      if (!ready) reject(new Error(`Embedded Postgres exited with code ${code}`));
    });
  });
}

async function main() {
  process.env.APP_MODE = process.env.APP_MODE || 'SIMULATION';
  const dbPort = Number(process.env.DB_PORT || 54329);
  process.env.DB_PORT = String(dbPort);
  const dataDir = path.join(os.tmpdir(), 'autopark-demo-pgdata');
  console.log(`[dev:demo] Starting embedded PostgreSQL on port ${dbPort} (${dataDir})...`);
  const pgHandle = await startPostgresSubprocess(dbPort, dataDir);

  const { app, cfg } = await createConfiguredApp();
  await app.listen(cfg.port, '0.0.0.0');
  console.log(`\n🚀 Auto Park Backend + Embedded PostgreSQL ready!`);
  console.log(`   REST API:   http://localhost:${cfg.port}/api/v1`);
  console.log(`   Swagger UI: http://localhost:${cfg.port}/api/docs`);
  console.log(`   WebSocket:  ws://localhost:${cfg.port}/realtime\n`);

  const shutdown = async () => {
    console.log('\nShutting down...');
    await app.close().catch(() => undefined);
    await pgHandle.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();

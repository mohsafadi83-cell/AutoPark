/**
 * Standalone Production/Demo Server Entrypoint (compiled to dist/standalone.js).
 * Runs embedded PostgreSQL + NestJS Backend + Web Admin UI + Flutter Mobile UI
 * using only `node.exe` (no ts-node, no Vite, no Flutter CLI, no external Postgres required).
 *
 * Listens on:
 *   - Port 3000: REST API (/api/v1), WebSocket (/realtime), Swagger (/api/docs), Web Admin (/), Mobile (/mobile)
 *   - Port 5173: Web Admin Panel (http://localhost:5173) + API (/api/v1)
 *   - Port 5174: Flutter Mobile App (http://localhost:5174)
 */
import 'dotenv/config';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import express, { Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import { createConfiguredApp } from './main';

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
      cwd: path.resolve(__dirname, '..'),
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

function findDir(candidates: string[]): string | undefined {
  return candidates.find((d) => fs.existsSync(path.join(d, 'index.html')));
}

async function main() {
  process.env.APP_MODE = process.env.APP_MODE || 'SIMULATION';
  const dbPort = Number(process.env.DB_PORT || 54329);
  process.env.DB_PORT = String(dbPort);
  const dataDir = path.join(os.tmpdir(), 'autopark-demo-pgdata');
  console.log(`[AutoPark] Starting embedded PostgreSQL on port ${dbPort}...`);
  const pgHandle = await startPostgresSubprocess(dbPort, dataDir);

  const { app, cfg } = await createConfiguredApp();
  await app.listen(cfg.port, '0.0.0.0');

  const extraServers: http.Server[] = [];

  // Port 5173: Dedicated Web Admin Panel port (forwards /api to NestJS Express app)
  const expressInstance = app.getHttpAdapter().getInstance() as express.Application;
  const adminServer = http.createServer(expressInstance);
  adminServer.on('error', () => {
    /* port 5173 already in use by Vite dev server — ignore */
  });
  adminServer.listen(5173, '0.0.0.0', () => {
    console.log(`Web Admin Panel:   http://localhost:5173/`);
  });
  extraServers.push(adminServer);

  // Port 5174: Dedicated Flutter Mobile App port
  const mobileDir = findDir([
    path.resolve(__dirname, '..', 'ui', 'mobile'),
    path.resolve(__dirname, '..', '..', 'mobile', 'build', 'web'),
  ]);
  if (mobileDir) {
    const mobileApp = express();
    mobileApp.use(express.static(mobileDir));
    mobileApp.get('*', (_req: Request, res: Response) => {
      // Serve index.html with base href "/" so it works at root of :5174
      const htmlPath = path.join(mobileDir, 'index.html');
      const html = fs.readFileSync(htmlPath, 'utf8').replace('<base href="/mobile/">', '<base href="/">');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    });
    const mobileServer = http.createServer(mobileApp);
    mobileServer.on('error', () => {
      /* port 5174 already in use — ignore */
    });
    mobileServer.listen(5174, '0.0.0.0', () => {
      console.log(`Flutter Mobile UI: http://localhost:5174/`);
    });
    extraServers.push(mobileServer);
  }

  console.log(`AUTOPARK_READY port=${cfg.port}`);
  console.log(`Backend REST API:  http://localhost:${cfg.port}/api/v1`);
  console.log(`Swagger API Docs:  http://localhost:${cfg.port}/api/docs`);

  const shutdown = async () => {
    for (const s of extraServers) {
      s.close();
    }
    await app.close().catch(() => undefined);
    await pgHandle.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();

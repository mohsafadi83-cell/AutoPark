/**
 * Zero-install PostgreSQL for local development / demos / E2E tests (no Docker required).
 * Starts a real PostgreSQL server from the `embedded-postgres` npm binaries,
 * using the DB_* settings from .env.
 * Data is persisted in ~/.autopark-pgdata (avoids Windows paths with spaces).
 */
import 'dotenv/config';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

export async function startEmbeddedPostgres(opts?: {
  dataDir?: string;
  port?: number;
  persistent?: boolean;
  quiet?: boolean;
}) {
  const mod = await (eval('import("embedded-postgres")') as Promise<{
    default: new (o: Record<string, unknown>) => {
      initialise(): Promise<void>;
      start(): Promise<void>;
      stop(): Promise<void>;
      createDatabase(db: string): Promise<void>;
    };
  }>);
  const EmbeddedPostgres = mod.default;

  const port = opts?.port ?? Number(process.env.DB_PORT || 5432);
  const user = process.env.DB_USER || 'autopark';
  const password = process.env.DB_PASSWORD || 'autopark_dev_password';
  const database = process.env.DB_NAME || 'autopark';
  // Default to user home directory so paths with spaces (like "d:\Auto Parke") never break pg_ctl on Windows
  const dataDir = opts?.dataDir ?? path.join(os.homedir(), '.autopark-pgdata');
  const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  // Remove stale postmaster.pid if left over from an abrupt exit
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!fresh && fs.existsSync(pidFile)) {
    try {
      fs.unlinkSync(pidFile);
    } catch {
      /* ignore */
    }
  }

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: opts?.persistent ?? true,
    onLog: opts?.quiet ? () => undefined : (m: string) => process.stdout.write(`[pg] ${m}`),
    onError: (m: unknown) => process.stderr.write(`[pg:err] ${String(m)}\n`),
  });
  if (fresh) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(database);
  } catch {
    /* already exists */
  }
  return { pg, port, user, password, database };
}

/**
 * Spawns embedded-postgres in a separate Node child process (ideal for Jest E2E tests).
 */
export function spawnEmbeddedPostgresProcess(opts: { port: number; dataDir: string }): Promise<{ stop: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const script = `
      import('embedded-postgres').then(async ({ default: EmbeddedPostgres }) => {
        const pg = new EmbeddedPostgres({
          databaseDir: ${JSON.stringify(opts.dataDir)},
          user: 'autopark',
          password: 'autopark_dev_password',
          port: ${opts.port},
          persistent: false,
          onLog: () => {},
          onError: () => {},
        });
        await pg.initialise();
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
      if (!ready) reject(new Error(`Embedded Postgres process exited early with code ${code}`));
    });
  });
}

if (require.main === module) {
  startEmbeddedPostgres()
    .then(({ port, database, user }) => {
      console.log(`\n✅ Embedded PostgreSQL running on localhost:${port} (db=${database}, user=${user}). Ctrl+C to stop.\n`);
    })
    .catch((e) => {
      console.error('Failed to start embedded PostgreSQL:', e);
      process.exit(1);
    });
}

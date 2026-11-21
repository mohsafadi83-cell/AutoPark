import * as path from 'path';
import * as os from 'os';
import { DataSource } from 'typeorm';
import { startEmbeddedPostgres } from './embedded-postgres';
import { buildDataSourceOptions } from '../src/database/data-source';
import { loadConfig } from '../src/config/app.config';

async function main() {
  const port = 54339;
  process.env.DB_PORT = String(port);
  const dataDir = path.join(os.tmpdir(), `autopark-schema-check-${Date.now()}`);
  const { pg } = await startEmbeddedPostgres({ port, dataDir, persistent: false, quiet: true });
  try {
    const ds = new DataSource(buildDataSourceOptions(loadConfig()));
    await ds.initialize();
    const diff = await ds.driver.createSchemaBuilder().log();
    await ds.destroy();
    console.log(`Migrations applied cleanly. Pending schema diffs: ${diff.upQueries.length}`);
  } finally {
    await pg.stop();
  }
}

void main();

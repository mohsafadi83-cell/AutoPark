import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { loadConfig } from '../config/app.config';
import { ALL_ENTITIES } from './entities';
import { InitialSchema1700000000000 } from './migrations/1700000000000-InitialSchema';
import { SnakeNamingStrategy } from './snake-naming.strategy';

export function buildDataSourceOptions(cfg = loadConfig()): DataSourceOptions {
  return {
    type: 'postgres',
    host: cfg.db.host,
    port: cfg.db.port,
    username: cfg.db.user,
    password: cfg.db.password,
    database: cfg.db.name,
    ssl: cfg.db.ssl ? { rejectUnauthorized: false } : false,
    entities: ALL_ENTITIES,
    migrations: [InitialSchema1700000000000],
    migrationsRun: cfg.db.runMigrations,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
  };
}

export default new DataSource(buildDataSourceOptions());

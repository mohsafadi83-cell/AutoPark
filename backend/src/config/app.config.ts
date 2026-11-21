import 'dotenv/config';

/**
 * Centralised, validated application configuration.
 * Everything industrial/secret lives here (server side only) and is NEVER sent to clients.
 */
export type AppMode = 'SIMULATION' | 'PRODUCTION';

function str(name: string, def = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? def : v;
}
function int(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric env ${name}=${v}`);
  return n;
}
function bool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}
function optInt(name: string): number | null {
  const v = process.env[name];
  if (v === undefined || v === '') return null;
  return int(name, 0);
}

export function loadConfig() {
  const mode = str('APP_MODE', 'SIMULATION').toUpperCase() as AppMode;
  if (mode !== 'SIMULATION' && mode !== 'PRODUCTION') {
    throw new Error(`APP_MODE must be SIMULATION or PRODUCTION (got ${mode})`);
  }
  const nodeEnv = str('NODE_ENV', 'development');
  const cfg = {
    mode,
    nodeEnv,
    isTest: nodeEnv === 'test',
    port: int('PORT', 3000),
    corsOrigins: str(
      'CORS_ORIGINS',
      'http://localhost:5173,http://localhost:5174,http://46.185.128.165:5173,http://46.185.128.165:5174,http://46.185.128.165:3000',
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    trustProxy: bool('TRUST_PROXY', true),
    swaggerEnabled: bool('SWAGGER_ENABLED', mode === 'SIMULATION'),
    db: {
      host: str('DB_HOST', 'localhost'),
      port: int('DB_PORT', 5432),
      user: str('DB_USER', 'autopark'),
      password: str('DB_PASSWORD', 'autopark_dev_password'),
      name: str('DB_NAME', 'autopark'),
      ssl: bool('DB_SSL', false),
      runMigrations: bool('DB_RUN_MIGRATIONS', true),
    },
    auth: {
      accessSecret: str('JWT_ACCESS_SECRET', ''),
      accessTtl: int('JWT_ACCESS_TTL', 900),
      refreshTtlDays: int('JWT_REFRESH_TTL_DAYS', 14),
      bcryptRounds: int('BCRYPT_ROUNDS', 12),
      maxAttempts: int('LOGIN_MAX_ATTEMPTS', 5),
      lockMinutes: int('LOGIN_LOCK_MINUTES', 15),
    },
    encryptionKey: str('CONFIG_ENCRYPTION_KEY', ''),
    rateLimit: {
      ttl: int('RATE_LIMIT_TTL_SECONDS', 60),
      max: int('RATE_LIMIT_MAX', 300),
      loginMax: int('RATE_LIMIT_LOGIN_MAX', 10),
    },
    seedDemo: mode === 'SIMULATION' || bool('SEED_DEMO', false),
    layout: {
      levels: int('LAYOUT_LEVELS', 1),
      zones: str('LAYOUT_ZONES', 'A')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      spacesPerZone: int('LAYOUT_SPACES_PER_ZONE', 12),
    },
    bootstrapAdmin: {
      username: str('BOOTSTRAP_ADMIN_USERNAME', 'superadmin'),
      email: str('BOOTSTRAP_ADMIN_EMAIL', 'admin@example.com'),
      password: str('BOOTSTRAP_ADMIN_PASSWORD', ''),
    },
    industrial: {
      protocol: str('INDUSTRIAL_PROTOCOL', 'MOCK').toUpperCase(),
      writeEnabled: bool('INDUSTRIAL_WRITE_ENABLED', false),
      plcModel: str('PLC_MODEL') || null,
      host: str('PLC_HOST') || null,
      port: optInt('PLC_PORT'),
      rack: optInt('PLC_RACK'),
      slot: optInt('PLC_SLOT'),
      opcuaEndpoint: str('OPCUA_ENDPOINT') || null,
      mqttUrl: str('MQTT_URL') || null,
      restBaseUrl: str('REST_GATEWAY_URL') || null,
      ackTimeoutMs: int('COMMAND_ACK_TIMEOUT_MS', 5000),
      completionTimeoutMs: int('COMMAND_COMPLETION_TIMEOUT_MS', 180000),
      heartbeatTimeoutMs: int('HEARTBEAT_TIMEOUT_MS', 5000),
      pollIntervalMs: int('POLL_INTERVAL_MS', 1000),
      maxConcurrentCommands: Math.max(1, int('MAX_CONCURRENT_COMMANDS', 1)),
    },
    mock: {
      speedFactor: Math.max(0.05, int('MOCK_SPEED_FACTOR', 1)),
      failureRate: Math.min(1, Math.max(0, int('MOCK_FAILURE_RATE', 0))),
      randomAlarms: bool('MOCK_RANDOM_ALARMS', false),
    },
    fcmServiceAccountFile: str('FCM_SERVICE_ACCOUNT_FILE') || null,
  };

  // ── Fail fast on insecure production configuration ──
  const errors: string[] = [];
  if (!cfg.auth.accessSecret || cfg.auth.accessSecret.length < 32) {
    if (mode === 'PRODUCTION') errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
    else cfg.auth.accessSecret = cfg.auth.accessSecret || 'dev-only-insecure-access-secret-change-me-0123456789';
  }
  if (mode === 'PRODUCTION') {
    if (cfg.auth.accessSecret.startsWith('change-me')) errors.push('JWT_ACCESS_SECRET still has the example value');
    if (!/^[0-9a-fA-F]{64}$/.test(cfg.encryptionKey) || /^0+$/.test(cfg.encryptionKey)) {
      errors.push('CONFIG_ENCRYPTION_KEY must be 64 random hex characters');
    }
    if (cfg.auth.bcryptRounds < 10) errors.push('BCRYPT_ROUNDS must be >= 10');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(cfg.encryptionKey)) {
    cfg.encryptionKey = '0'.repeat(64); // dev only — validated above for production
  }
  if (errors.length) {
    throw new Error('Insecure / invalid configuration:\n - ' + errors.join('\n - '));
  }
  return cfg;
}

export type AppConfig = ReturnType<typeof loadConfig>;
export const APP_CONFIG = Symbol('APP_CONFIG');

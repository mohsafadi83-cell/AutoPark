import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "name" varchar(40) PRIMARY KEY,
        "description" varchar(255),
        "permissions" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "full_name" varchar(150) NOT NULL,
        "username" varchar(60) NOT NULL,
        "email" varchar(255) NOT NULL,
        "phone" varchar(30),
        "password_hash" varchar(100) NOT NULL,
        "role" varchar(40) NOT NULL REFERENCES "roles"("name") ON DELETE RESTRICT,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "language" varchar(5) NOT NULL DEFAULT 'ar',
        "preferences" jsonb NOT NULL DEFAULT '{"notifyParking":true,"notifyAlarms":true,"notifyMaintenance":true}',
        "failed_login_attempts" int NOT NULL DEFAULT 0,
        "locked_until" timestamptz,
        "password_changed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "last_login" timestamptz
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_username" ON "users" ("username")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_email" ON "users" ("email")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" varchar(64) NOT NULL,
        "family_id" uuid NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "ip_address" varchar(45),
        "user_agent" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_refresh_tokens_hash" ON "refresh_tokens" ("token_hash")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_refresh_tokens_user" ON "refresh_tokens" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_refresh_tokens_family" ON "refresh_tokens" ("family_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "plate_number" varchar(20) NOT NULL,
        "vehicle_type" varchar(40),
        "brand" varchar(60),
        "model" varchar(60),
        "color" varchar(40),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_vehicles_user" ON "vehicles" ("user_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicles_plate_active" ON "vehicles" ("plate_number") WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking_spaces" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "space_number" varchar(20) NOT NULL,
        "level" int NOT NULL,
        "zone" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'AVAILABLE',
        "vehicle_id" uuid REFERENCES "vehicles"("id") ON DELETE RESTRICT,
        "controller_ref" varchar(50),
        "status_reason" varchar(255),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_parking_spaces_number" ON "parking_spaces" ("space_number")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_parking_spaces_vehicle" ON "parking_spaces" ("vehicle_id") WHERE "vehicle_id" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_parking_spaces_level_zone" ON "parking_spaces" ("level", "zone")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "industrial_commands" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "command_id" varchar(50) NOT NULL,
        "command_type" varchar(20) NOT NULL,
        "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "vehicle_id" uuid REFERENCES "vehicles"("id") ON DELETE SET NULL,
        "parking_space_id" uuid REFERENCES "parking_spaces"("id") ON DELETE SET NULL,
        "parking_request_id" uuid,
        "status" varchar(20) NOT NULL DEFAULT 'CREATED',
        "payload" jsonb,
        "controller_response" jsonb,
        "progress" int NOT NULL DEFAULT 0,
        "phase" varchar(60),
        "send_attempts" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "validated_at" timestamptz,
        "authorized_at" timestamptz,
        "sent_at" timestamptz,
        "acknowledged_at" timestamptz,
        "completed_at" timestamptz,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "error_message" text
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_industrial_commands_command_id" ON "industrial_commands" ("command_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_industrial_commands_status" ON "industrial_commands" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_industrial_commands_request" ON "industrial_commands" ("parking_request_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_number" varchar(30) NOT NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "vehicle_id" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT,
        "request_type" varchar(10) NOT NULL,
        "source" varchar(10) NOT NULL DEFAULT 'MOBILE',
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "parking_space_id" uuid REFERENCES "parking_spaces"("id") ON DELETE SET NULL,
        "industrial_command_id" uuid REFERENCES "industrial_commands"("id") ON DELETE SET NULL,
        "timeline" jsonb NOT NULL DEFAULT '{}',
        "failed_step" varchar(40),
        "error_message" text,
        "active_lock" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_parking_requests_number" ON "parking_requests" ("request_number")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_parking_requests_active_vehicle" ON "parking_requests" ("active_lock") WHERE "active_lock" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_parking_requests_user_created" ON "parking_requests" ("user_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_parking_requests_status" ON "parking_requests" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_parking_requests_vehicle" ON "parking_requests" ("vehicle_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "system_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_type" varchar(60) NOT NULL,
        "category" varchar(20) NOT NULL,
        "severity" varchar(20) NOT NULL DEFAULT 'INFO',
        "message" text NOT NULL,
        "source" varchar(100) NOT NULL DEFAULT 'BACKEND',
        "data" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_system_events_created" ON "system_events" ("created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_system_events_category" ON "system_events" ("category")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alarms" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "alarm_code" varchar(40) NOT NULL,
        "severity" varchar(20) NOT NULL,
        "description" text NOT NULL,
        "source" varchar(100) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "origin" varchar(20) NOT NULL DEFAULT 'CONTROLLER',
        "active_key" varchar(160),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "acknowledged_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "acknowledged_at" timestamptz,
        "acknowledge_note" varchar(500),
        "resolved_at" timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_alarms_active_key" ON "alarms" ("active_key") WHERE "active_key" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_alarms_status" ON "alarms" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_alarms_created" ON "alarms" ("created_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid,
        "username" varchar(60),
        "action" varchar(80) NOT NULL,
        "entity" varchar(60),
        "entity_id" varchar(60),
        "ip_address" varchar(45),
        "user_agent" varchar(500),
        "details" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_audit_logs_created" ON "audit_logs" ("created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_audit_logs_user" ON "audit_logs" ("user_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" varchar(40) NOT NULL,
        "title" varchar(200) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_notifications_user_created" ON "notifications" ("user_id", "created_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token" varchar(500) NOT NULL,
        "platform" varchar(10) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_seen_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_device_tokens_token" ON "device_tokens" ("token")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "ix_device_tokens_user" ON "device_tokens" ("user_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "integration_config" (
        "id" int PRIMARY KEY,
        "protocol" varchar(20) NOT NULL,
        "settings" jsonb NOT NULL DEFAULT '{}',
        "secrets" jsonb NOT NULL DEFAULT '{}',
        "tag_map" jsonb NOT NULL DEFAULT '{}',
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "updated_by" varchar(60)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "integration_config"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "alarms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "system_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "industrial_commands"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking_spaces"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
  }
}

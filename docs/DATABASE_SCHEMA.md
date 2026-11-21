# Auto Park — PostgreSQL Database Schema

All tables are created and versioned via TypeORM migrations (`backend/src/database/migrations/1700000000000-InitialSchema.ts`).

## Tables Overview

1. **`roles`** — Role definitions (`SUPER_ADMIN`, `SYSTEM_ADMIN`, `OPERATOR`, `PARKING_ATTENDANT`, `MAINTENANCE_ENGINEER`, `CUSTOMER`, `READ_ONLY`) and JSONB permission arrays.
2. **`users`** — User accounts, `bcrypt` password hashes, role foreign key, status (`ACTIVE`, `DISABLED`, `LOCKED`), lockout counters, language (`ar` | `en`), and notification preferences.
3. **`refresh_tokens`** — SHA-256 hashed refresh tokens with `family_id` rotation tracking for automatic compromise detection.
4. **`vehicles`** — Registered vehicles (`user_id`, normalized `plate_number`, `vehicle_type`, `brand`, `model`, `color`, soft-delete `deleted_at`).
5. **`parking_spaces`** — Physical bays (`space_number`, `level`, `zone`, `status`, `vehicle_id`, `controller_ref`, `status_reason`, `updated_at`). Partial unique index on `vehicle_id WHERE vehicle_id IS NOT NULL` ensures a vehicle can never occupy two spaces simultaneously.
6. **`parking_requests`** — `PARK` and `RETRIEVE` requests (`request_number`, `user_id`, `vehicle_id`, `request_type`, `source`, `status`, `parking_space_id`, `industrial_command_id`, `timeline` JSONB, `active_lock`). Partial unique index on `active_lock WHERE active_lock IS NOT NULL` guarantees at most one active request per vehicle under concurrent load.
7. **`industrial_commands`** — Full audit trail of every command sent to the PLC/controller (`command_id`, `command_type`, `requested_by`, `vehicle_id`, `parking_space_id`, `parking_request_id`, `status`, `payload`, `controller_response`, `progress`, `phase`, `send_attempts`, `created_at`, `validated_at`, `authorized_at`, `sent_at`, `acknowledged_at`, `completed_at`, `error_message`).
8. **`alarms`** — Active, acknowledged, and resolved alarms (`alarm_code`, `severity`, `description`, `source`, `status`, `origin`, `active_key`, `acknowledged_by`, `acknowledged_at`, `acknowledge_note`, `resolved_at`).
9. **`system_events`** — PLC, machine, security, error, and warning events (`event_type`, `category`, `severity`, `message`, `source`, `data`, `created_at`).
10. **`audit_logs`** — Immutable user & admin audit trail (`user_id`, `username`, `action`, `entity`, `entity_id`, `ip_address`, `user_agent`, `details`, `created_at`).
11. **`notifications`** & **`device_tokens`** — User notifications and mobile push device tokens.
12. **`integration_config`** — Singleton runtime industrial configuration (`protocol`, `settings` JSONB, AES-256-GCM encrypted `secrets` JSONB, `tag_map` JSONB, `updated_at`, `updated_by`).

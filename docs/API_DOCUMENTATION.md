# Auto Park — API Contract (v1)

This document is the **single source of truth** shared by the backend (`backend/`), the Flutter
mobile app (`mobile/`) and the React admin panel (`admin/`).

- Base URL: `{HOST}/api/v1` (dev default `http://localhost:3000/api/v1`; Android emulator `http://10.0.2.2:3000/api/v1`)
- Swagger UI (dev): `{HOST}/api/docs`
- Auth: `Authorization: Bearer <accessToken>` on every endpoint except `/auth/login`, `/auth/refresh`, `/health`.
- JSON field names are **camelCase**. Timestamps are ISO-8601 UTC strings. IDs are UUID strings.
- Errors: `{ "statusCode": 400, "error": "Bad Request", "message": "text" | ["text", ...], "code"?: "MACHINE_READABLE_CODE" }`
- Paginated responses: `{ "items": [...], "total": 123, "page": 1, "limit": 20 }` (query `page` starts at 1, `limit` max 100).

---

## 1. Roles & permissions

Roles (string enum): `SUPER_ADMIN`, `SYSTEM_ADMIN`, `OPERATOR`, `PARKING_ATTENDANT`, `MAINTENANCE_ENGINEER`, `CUSTOMER`, `READ_ONLY`.

Permissions (string enum):

| Permission | Meaning |
|---|---|
| `dashboard.view` | View dashboard |
| `parking.view` | View spaces / map / requests |
| `parking.request` | Create PARK / RETRIEVE requests for **own** vehicles |
| `parking.request.any` | Create requests for **any** vehicle / by any plate (staff) |
| `vehicles.manage.own` | CRUD own vehicles |
| `vehicles.manage.any` | CRUD any vehicle |
| `alarms.view` | View alarms |
| `alarms.acknowledge` | Acknowledge alarms (never reset) |
| `history.view.own` | Own history |
| `history.view.all` | Everybody's history + system events |
| `system.monitor` | Live monitoring screen |
| `diagnostics.view` | Diagnostics / industrial commands |
| `commands.view` | View industrial command log |
| `users.manage` | Users CRUD |
| `config.manage` | Industrial integration configuration |
| `audit.view` | Audit logs |
| `simulation.control` | Simulation scenario control (SIMULATION mode only) |

Role → permissions:

| Role | Permissions |
|---|---|
| SUPER_ADMIN | all |
| SYSTEM_ADMIN | all except `simulation.control` |
| OPERATOR | dashboard.view, parking.view, parking.request, parking.request.any, vehicles.manage.own, vehicles.manage.any, alarms.view, alarms.acknowledge, history.view.all, system.monitor, commands.view |
| PARKING_ATTENDANT | dashboard.view, parking.view, parking.request, parking.request.any, vehicles.manage.own, vehicles.manage.any, alarms.view, history.view.all, system.monitor |
| MAINTENANCE_ENGINEER | dashboard.view, parking.view, alarms.view, alarms.acknowledge, history.view.all, system.monitor, diagnostics.view, commands.view, simulation.control |
| CUSTOMER | dashboard.view, parking.view, parking.request, vehicles.manage.own, history.view.own |
| READ_ONLY | dashboard.view, parking.view, alarms.view, system.monitor, history.view.all |

Demo users (seeded only in SIMULATION mode or when `SEED_DEMO=true`):

| username | password | role |
|---|---|---|
| superadmin | `Admin@12345` | SUPER_ADMIN |
| admin | `Admin@12345` | SYSTEM_ADMIN |
| operator | `Operator@123` | OPERATOR |
| attendant | `Operator@123` | PARKING_ATTENDANT |
| engineer | `Engineer@123` | MAINTENANCE_ENGINEER |
| customer | `Customer@123` | CUSTOMER |
| viewer | `Viewer@1234` | READ_ONLY |

---

## 2. Shared object shapes

```ts
type User = {
  id: string; fullName: string; username: string; email: string; phone: string | null;
  role: Role; permissions: Permission[]; status: 'ACTIVE' | 'DISABLED' | 'LOCKED';
  language: 'ar' | 'en'; lastLogin: string | null; createdAt: string; updatedAt: string;
};

type AuthResponse = { accessToken: string; refreshToken: string; expiresIn: number /*seconds*/; user: User };

type SystemState = 'ONLINE' | 'WARNING' | 'ERROR' | 'OFFLINE';
type MachineState = 'IDLE' | 'BUSY' | 'FAULT' | 'EMERGENCY_STOP' | 'MAINTENANCE' | 'UNKNOWN';

type SystemStatus = {
  mode: 'SIMULATION' | 'PRODUCTION';
  adapter: 'MOCK' | 'SIEMENS_S7' | 'OPC_UA' | 'MODBUS_TCP' | 'MQTT' | 'REST_GATEWAY' | 'CUSTOM_TCP';
  state: SystemState;
  controllerConnected: boolean;   // integration service <-> controller link
  plcConnected: boolean;          // controller reports PLC reachable
  machineState: MachineState;
  emergencyStop: boolean;
  safetyOk: boolean;              // all safety interlocks OK (from controller)
  systemReady: boolean;           // controller "ready" signal
  communication: 'OK' | 'DEGRADED' | 'LOST';
  lastHeartbeat: string | null;
  heartbeatAgeMs: number | null;
  activeCommandId: string | null;
  lastUpdate: string;
  message: string | null;         // human readable reason for WARNING/ERROR/OFFLINE
};

type SpaceStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'MOVING' | 'BLOCKED' | 'MAINTENANCE' | 'ERROR';
type ParkingSpace = {
  id: string; spaceNumber: string; level: number; zone: string; status: SpaceStatus;
  vehicle: { id: string; plateNumber: string } | null; updatedAt: string;
};

type Vehicle = {
  id: string; userId: string; ownerName: string | null; plateNumber: string; vehicleType: string | null;
  brand: string | null; model: string | null; color: string | null; createdAt: string;
  parked: boolean; parkingSpace: { id: string; spaceNumber: string; level: number; zone: string } | null;
};

type RequestStatus = 'PENDING' | 'VALIDATING' | 'APPROVED' | 'PROCESSING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type StepStatus = 'DONE' | 'ACTIVE' | 'PENDING' | 'FAILED';
type RequestStep = { key: string; status: StepStatus; at: string | null };

type ParkingRequest = {
  id: string; requestNumber: string /* e.g. PR-20261113-000123 */; requestType: 'PARK' | 'RETRIEVE';
  status: RequestStatus; source: 'MOBILE' | 'ADMIN' | 'API';
  vehicle: { id: string; plateNumber: string; brand: string | null; model: string | null; color: string | null };
  user: { id: string; fullName: string };
  parkingSpace: { id: string; spaceNumber: string; level: number; zone: string } | null;
  command: IndustrialCommand | null;
  steps: RequestStep[];
  errorMessage: string | null; createdAt: string; completedAt: string | null;
};
```

Step keys (clients translate them; order is fixed):

- PARK: `CREATED`, `VALIDATED`, `APPROVED`, `COMMAND_SENT`, `CONTROLLER_CONFIRMED`, `VEHICLE_MOVING`, `PARKING_COMPLETED`
- RETRIEVE: `CREATED`, `VALIDATED`, `VEHICLE_LOCATED`, `PREPARING_SYSTEM`, `PLATFORM_MOVING`, `RETRIEVAL_IN_PROGRESS`, `VEHICLE_READY`

> The final step is only `DONE` after the **controller** reports completion. Clients must never fake completion.

```ts
type CommandStatus = 'CREATED' | 'VALIDATED' | 'AUTHORIZED' | 'SENT' | 'ACKNOWLEDGED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';
type IndustrialCommand = {
  id: string; commandId: string /* CMD-... unique, idempotency key */; commandType: 'PARK' | 'RETRIEVE';
  status: CommandStatus; requestedBy: { id: string; fullName: string } | null;
  vehicleId: string | null; parkingSpaceId: string | null; parkingRequestId: string | null;
  payload: object | null; controllerResponse: object | null; progress: number /*0..100*/; phase: string | null;
  createdAt: string; sentAt: string | null; acknowledgedAt: string | null; completedAt: string | null;
  errorMessage: string | null;
};

type AlarmSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
type Alarm = {
  id: string; alarmCode: string; severity: AlarmSeverity; description: string; source: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'; createdAt: string;
  acknowledgedBy: { id: string; fullName: string } | null; acknowledgedAt: string | null; resolvedAt: string | null;
};

type SystemEvent = { id: string; eventType: string; category: 'PLC' | 'MACHINE' | 'ERROR' | 'WARNING' | 'USER' | 'SECURITY' | 'SYSTEM';
  severity: AlarmSeverity; message: string; source: string; data: object | null; createdAt: string };

type AuditLog = { id: string; userId: string | null; username: string | null; action: string; entity: string | null;
  entityId: string | null; ipAddress: string | null; userAgent: string | null; details: object | null; createdAt: string };

type HistoryItem = { id: string; kind: 'PARK' | 'RETRIEVE' | 'EVENT' | 'AUDIT'; title: string; description: string | null;
  plateNumber: string | null; status: string | null; actor: string | null; createdAt: string; refId: string | null };

type AppNotification = { id: string; type: 'VEHICLE_READY' | 'PARKING_COMPLETED' | 'RETRIEVAL_COMPLETED' | 'REQUEST_FAILED' | 'SYSTEM_ERROR' | 'CRITICAL_ALARM' | 'MAINTENANCE_REQUIRED' | 'INFO';
  title: string; body: string; data: object | null; read: boolean; createdAt: string };
```

---

## 3. Endpoints

### Health
- `GET /health` → `{ status: 'ok', mode, adapter, time }` (public)

### Auth
- `POST /auth/login` `{ username: string /*username or email*/, password: string }` → `AuthResponse`. 401 on bad credentials, 423 when locked (5 failed attempts → 15 min lock).
- `POST /auth/refresh` `{ refreshToken }` → `AuthResponse` (refresh token rotation; reuse of a revoked token revokes the whole family).
- `POST /auth/logout` `{ refreshToken }` → `204`
- `GET /auth/me` → `User`
- `PUT /auth/me` `{ fullName?, email?, phone?, language? }` → `User`
- `POST /auth/change-password` `{ currentPassword, newPassword }` → `204` (min 8 chars, upper+lower+digit). Revokes all refresh tokens.
- `GET /auth/me/preferences` → `{ language, notifyParking: boolean, notifyAlarms: boolean, notifyMaintenance: boolean }`
- `PUT /auth/me/preferences` same body (partial) → same

### Dashboard / system
- `GET /dashboard` → `{ system: SystemStatus, totals: { total, available, occupied, reserved, moving, blocked, maintenance, error }, activeAlarms: number, criticalAlarms: number, activeRequests: number, health: number /*0-100*/, levels: number[], zones: string[] }`
- `GET /system/status` → `SystemStatus`

### Parking
- `GET /parking/spaces?level=&zone=&status=` → `ParkingSpace[]`
- `GET /parking/spaces/:id` → `ParkingSpace`
- `POST /parking/request` `{ vehicleId?: string, plateNumber?: string }` (one required) → `201 ParkingRequest` (PARK)
- `POST /parking/retrieve` `{ vehicleId?: string, plateNumber?: string }` → `201 ParkingRequest` (RETRIEVE)
- `GET /parking/requests?status=&type=&active=true&page=&limit=` → `Paginated<ParkingRequest>` (customers: own only)
- `GET /parking/requests/:id` → `ParkingRequest`
- `POST /parking/requests/:id/cancel` → `ParkingRequest` — only allowed before the command is `SENT`; afterwards 409 `COMMAND_ALREADY_SENT`.

Command rejection error codes (HTTP 409 unless noted): `SYSTEM_OFFLINE`, `SYSTEM_NOT_READY`, `EMERGENCY_STOP_ACTIVE`, `SAFETY_INTERLOCK`, `CRITICAL_ALARM_ACTIVE`, `MACHINE_BUSY`, `DUPLICATE_REQUEST` (vehicle already has an active request), `VEHICLE_ALREADY_PARKED`, `VEHICLE_NOT_PARKED`, `NO_SPACE_AVAILABLE`, `VEHICLE_NOT_FOUND` (404), `FORBIDDEN_VEHICLE` (403).

### Vehicles
- `GET /vehicles?userId=&q=` → `Vehicle[]` (own unless `vehicles.manage.any`)
- `GET /vehicles/:id` → `Vehicle`
- `POST /vehicles` `{ plateNumber, vehicleType?, brand?, model?, color?, userId? /*staff only*/ }` → `201 Vehicle` (plate normalized upper-case, unique)
- `PUT /vehicles/:id` partial → `Vehicle`
- `DELETE /vehicles/:id` → `204` (409 `VEHICLE_ALREADY_PARKED` if parked or has active request)
- `GET /vehicles/:id/history` → `ParkingRequest[]`

### Alarms
- `GET /alarms?status=&severity=&page=&limit=` → `Paginated<Alarm>`
- `POST /alarms/:id/acknowledge` `{ note?: string }` → `Alarm`. **There is no reset endpoint**: alarms become `RESOLVED` only when the controller clears them.

### History
- `GET /history?kind=PARK|RETRIEVE|EVENT|AUDIT&from=&to=&q=&page=&limit=` → `Paginated<HistoryItem>` (customers: own PARK/RETRIEVE only)
- `GET /history/export?…same filters…&format=csv` → `text/csv`

### Notifications
- `GET /notifications?unread=true` → `Paginated<AppNotification>`
- `POST /notifications/:id/read` → `204`; `POST /notifications/read-all` → `204`
- `POST /notifications/device-token` `{ token, platform: 'android'|'ios'|'web' }` → `204`

### Industrial
- `GET /industrial/status` → `SystemStatus & { protocol: string, configured: boolean }`
- `GET /industrial/commands?status=&type=&page=&limit=` → `Paginated<IndustrialCommand>` (`commands.view`)
- `GET /industrial/commands/:id` → `IndustrialCommand` (id = uuid or commandId)
- `GET /industrial/config` → `IndustrialConfig` (`config.manage`; secrets masked as `"********"`)
- `PUT /industrial/config` `IndustrialConfig` (partial) → `IndustrialConfig` — applying a new config reconnects the adapter; rejected with 409 while a command is executing.
- `POST /industrial/config/test` `IndustrialConfig` (partial, optional) → `{ ok: boolean, message: string, latencyMs: number | null }`

```ts
type IndustrialConfig = {
  protocol: 'MOCK' | 'SIEMENS_S7' | 'OPC_UA' | 'MODBUS_TCP' | 'MQTT' | 'REST_GATEWAY' | 'CUSTOM_TCP';
  plcModel: string | null; host: string | null; port: number | null; rack: number | null; slot: number | null;
  opcuaEndpoint: string | null; opcuaSecurityMode: 'None' | 'Sign' | 'SignAndEncrypt' | null; opcuaUsername: string | null; opcuaPassword: string | null;
  modbusUnitId: number | null; mqttUrl: string | null; mqttTopicPrefix: string | null; mqttUsername: string | null; mqttPassword: string | null;
  restBaseUrl: string | null; restApiKey: string | null;
  pollIntervalMs: number; ackTimeoutMs: number; completionTimeoutMs: number; heartbeatTimeoutMs: number;
  supportsIdempotentCommands: boolean;   // false => commands are NEVER re-sent automatically
  readOnly: boolean;                     // true => monitoring only, all write commands rejected
  tagMap: Record<TagKey, { address: string; dataType: 'BOOL'|'INT'|'DINT'|'REAL'|'STRING'|'WORD'|'DWORD'; access: 'R'|'W'|'RW'; description?: string }>;
  updatedAt: string | null; updatedBy: string | null;
};
type TagKey = 'system_ready_tag' | 'emergency_status_tag' | 'safety_ok_tag' | 'heartbeat_tag' | 'machine_state_tag'
  | 'parking_space_status_tag' | 'vehicle_position_tag' | 'alarm_tag' | 'park_command_tag' | 'retrieve_command_tag'
  | 'command_id_tag' | 'target_space_tag' | 'command_acknowledgement_tag' | 'command_complete_tag' | 'command_error_tag';
```

### Simulation (SIMULATION mode only, `simulation.control`)
- `GET /simulation/state` → `{ enabled: boolean, failNext: boolean, timeoutNext: boolean, offline: boolean, emergencyStop: boolean, speedFactor: number }`
- `POST /simulation/scenario` `{ scenario: 'NORMAL'|'FAIL_NEXT'|'TIMEOUT_NEXT'|'GO_OFFLINE'|'GO_ONLINE'|'RAISE_WARNING'|'RAISE_CRITICAL'|'EMERGENCY_STOP'|'CLEAR_EMERGENCY'|'CLEAR_ALARMS' }` → state

### Users & roles (`users.manage`)
- `GET /users?q=&role=&status=&page=&limit=` → `Paginated<User>`
- `GET /users/:id` → `User`
- `POST /users` `{ fullName, username, email, phone?, password, role }` → `201 User`
- `PUT /users/:id` `{ fullName?, email?, phone?, role?, status?, password? }` → `User` (cannot demote/disable yourself; only SUPER_ADMIN can create SUPER_ADMIN)
- `DELETE /users/:id` → `204` (soft: status DISABLED + revoke tokens)
- `GET /roles` → `{ name: Role, permissions: Permission[] }[]`

### Audit / events
- `GET /audit?action=&userId=&from=&to=&page=&limit=` → `Paginated<AuditLog>` (`audit.view`)
- `GET /events?category=&severity=&from=&to=&page=&limit=` → `Paginated<SystemEvent>` (`history.view.all` or `diagnostics.view`)

---

## 4. Real-time (Socket.IO)

- URL: `{HOST}` with namespace `/realtime` (e.g. `io('http://localhost:3000/realtime', { auth: { token: accessToken }, transports: ['websocket'] })`)
- Unauthenticated / expired token → server emits `auth.error` and disconnects. Clients reconnect with a fresh token.
- Customers only receive events for their own requests/vehicles; staff receive everything.

| Event | Payload |
|---|---|
| `system.status.changed` | `SystemStatus` |
| `controller.online` / `controller.offline` | `SystemStatus` |
| `parking.request.created` / `parking.request.updated` | `ParkingRequest` |
| `parking.space.updated` | `ParkingSpace` |
| `vehicle.moving` | `{ requestId, requestType, plateNumber, spaceNumber, progress, phase }` |
| `vehicle.parked` / `vehicle.retrieved` | `ParkingRequest` |
| `command.updated` | `IndustrialCommand` (staff only) |
| `alarm.created` / `alarm.acknowledged` / `alarm.resolved` | `Alarm` |
| `notification` | `AppNotification` |
| `heartbeat` | `{ time }` every 10 s |

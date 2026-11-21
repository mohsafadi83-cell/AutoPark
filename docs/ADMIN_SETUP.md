# Auto Park — Web Admin Control Center (`admin/`)

The **Auto Park** Web Admin Panel is a production-grade React 18 + TypeScript + Material UI (v6) control center designed for operators, parking attendants, maintenance engineers, and system administrators.

---

## 1. Key Capabilities

1. **Bilingual RTL/LTR & Industrial Theme (`src/i18n/`, `src/context/ThemeContext.tsx`)**
   - Full Arabic (`dir="rtl"` via `@emotion/cache` + `stylis-plugin-rtl`) and English (`dir="ltr"`) support with instant switching.
   - High-contrast Dark and Light industrial themes.
2. **Real-Time Telemetry & Event Stream (`src/context/RealtimeContext.tsx`)**
   - Connects to Socket.IO `/realtime` namespace with JWT authentication and automatic token refresh on `auth.error`.
   - Automatically updates React Query caches on `system.status.changed`, `controller.online`, `controller.offline`, `parking.request.*`, `parking.space.updated`, `vehicle.*`, `command.updated`, `alarm.*`, and `notification`.
3. **Role-Based Access Control (`src/context/AuthContext.tsx`, `src/components/RouteGuard.tsx`)**
   - Enforces all 7 roles (`SUPER_ADMIN`, `SYSTEM_ADMIN`, `OPERATOR`, `PARKING_ATTENDANT`, `MAINTENANCE_ENGINEER`, `CUSTOMER`, `READ_ONLY`) and 17 granular permissions.
   - Access token is stored in memory only; refresh token is stored in `sessionStorage` with single-flight rotation.
4. **Industrial Safety Rules Enforced in UI**
   - **No Fake Completion**: The 7-step request timeline (`RequestTimeline.tsx`) never marks the final step (`PARKING_COMPLETED` or `VEHICLE_READY`) as `DONE` unless `request.status === 'COMPLETED'`.
   - **Safe Cancellation**: Requests can only be cancelled before the industrial command reaches `SENT`.
   - **No Software Alarm Reset**: Operators with `alarms.acknowledge` can acknowledge alarms with a note, but alarms resolve only when cleared by the physical controller.
   - **Industrial Integration Configuration (`IndustrialConfigPage.tsx`)**: Allows authorized engineers (`config.manage`) to configure protocol (`MOCK`, `SIEMENS_S7`, `OPC_UA`, `MODBUS_TCP`, `MQTT`, `REST_GATEWAY`, `CUSTOM_TCP`), PLC IP/port/rack/slot, OPC UA, Modbus, MQTT, REST Gateway, timeouts, safety flags (`supportsIdempotentCommands`, `readOnly`), and all 15 PLC tag mappings at any time, with connection testing, secret masking, an `APPLY` confirmation gate, and the 18-item Supplier Hardware Checklist.

---

## 2. Local Development Setup

### Prerequisites
- Node.js 20+ and npm 10+
- Auto Park Backend running on `http://localhost:3000` (default)

### Install & Run
```bash
cd admin
npm install
npm run dev
```
The Vite dev server starts at `http://localhost:5173` and proxies `/api` and `/socket.io` to `VITE_DEV_PROXY_TARGET` (default `http://localhost:3000`).

### Environment Variables (Optional `.env`)
| Variable | Default | Description |
|---|---|---|
| `VITE_DEV_PROXY_TARGET` | `http://localhost:3000` | Backend origin used by Vite dev/preview proxy |
| `VITE_API_BASE_URL` | `/api/v1` | Base URL for REST API calls |
| `VITE_SOCKET_URL` | *(same origin)* | Explicit Socket.IO server origin if hosted separately |

---

## 3. Verification, Linting, Testing & Production Build

```bash
cd admin
npm run lint
npm test -- --run
npm run build
```

---

## 4. Docker Deployment

Build and run the production container (Nginx serving the SPA + reverse-proxying `/api/` and `/socket.io/` to `backend:3000`):

```bash
docker build -t autopark-admin:latest ./admin
docker run -p 8080:80 autopark-admin:latest
```

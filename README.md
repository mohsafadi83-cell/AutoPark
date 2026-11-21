# Auto Park — Industrial Automated Parking Management Ecosystem

A complete, production-ready, safety-critical **Automated Parking System (Auto Park)** ecosystem built for real industrial environments:

1. **Flutter Mobile Application (`mobile/`)** — Single codebase for **Android & iOS** with Clean Architecture, Riverpod state management, real-time Socket.IO updates, Arabic RTL + English LTR, biometric login, and an in-app **Industrial Connection & Protocol Settings** screen.
2. **Secure Backend & Industrial Integration Service (`backend/`)** — **Node.js + TypeScript + NestJS + PostgreSQL (TypeORM)** implementing the 15-step command safety workflow, RBAC, JWT + rotating refresh tokens, audit logging, and a protocol-agnostic `IndustrialController` abstraction layer (`MockIndustrialAdapter`, `SiemensS7Adapter`, `OpcUaAdapter`, `ModbusTcpAdapter`, `MqttAdapter`, `RestGatewayAdapter`, `CustomTcpAdapter`).
3. **React + TypeScript Web Admin Panel (`admin/`)** — Responsive industrial control center for live monitoring, parking & space map management, user/role RBAC, alarm acknowledgement, command inspection, audit logs, simulation scenario control, and hot-reloadable **Industrial Integration Configuration** (protocol, IP/port, rack/slot, OPC UA, Modbus, MQTT, and 15-tag PLC mapping table).

---

## Critical Safety Architecture

```
Mobile Application (Flutter)  /  Web Admin Panel (React)
                          │
                          ▼  HTTPS REST (/api/v1) + Authenticated WSS (/realtime)
                 Secure Backend API (NestJS)
   [Auth -> RBAC -> Input Validation -> System & Safety Interlock Check]
   [Command Record (UUID + CMD-ID) -> Audit Log -> Watchdog Timers]
                          │
                          ▼
            Industrial Integration Service
   (Mock | Siemens S7 | OPC UA | Modbus TCP | MQTT | REST Gateway | Custom TCP)
                          │
                          ▼  PROFINET / Industrial Ethernet (Isolated OT VLAN)
              PLC / Auto Park Controller
        (Behind Siemens SIMATIC HMI KTP400 Basic)
                          │
                          ▼
               Physical Parking System
```

- **No Direct Mobile-to-PLC Control:** Neither the mobile app nor the web browser ever communicates directly with the PLC or holds PLC credentials.
- **No Fake Completion:** A parking (`PARKING_COMPLETED`) or retrieval (`VEHICLE_READY`) operation is **never** marked complete unless the industrial controller explicitly confirms completion.
- **No Unsafe Automatic Command Resends:** Timed-out commands are marked `TIMEOUT` and are **never** automatically resent unless `supportsIdempotentCommands` is explicitly verified and enabled.
- **No Unsafe Remote Alarm Reset:** Authorized operators can **acknowledge** alarms (`POST /api/v1/alarms/:id/acknowledge`), but alarms only transition to `RESOLVED` when the industrial controller clears the physical fault.

---

## Repository Structure

```
d:\Auto Parke\
├── backend/                  # NestJS + TypeScript + TypeORM + Socket.IO + Industrial Adapters
│   ├── src/
│   │   ├── common/           # Enums, RBAC permissions, error codes, AES-256-GCM utils
│   │   ├── config/           # Environment & production safety validation
│   │   ├── database/         # PostgreSQL entities, migrations, seed service
│   │   └── modules/
│   │       ├── alarms/       # Alarm sync & safe acknowledgement
│   │       ├── audit/        # Audit logs & system events
│   │       ├── auth/         # JWT + refresh token rotation + lockout + RBAC guard
│   │       ├── industrial/   # IndustrialController interface + S7/OPCUA/Modbus/MQTT/Mock adapters
│   │       ├── notifications/# In-app & push notification service
│   │       ├── parking/      # 15-step safety workflow, spaces, requests, dashboard, history
│   │       ├── realtime/     # Authenticated Socket.IO /realtime gateway
│   │       ├── users/        # User & Role management
│   │       └── vehicles/     # Vehicle CRUD & history
│   ├── scripts/              # Embedded PostgreSQL & 1-command demo launcher
│   └── test/                 # Full E2E test suite against real PostgreSQL
├── mobile/                   # Flutter (Android + iOS) Clean Architecture app
├── admin/                    # React + TypeScript + Vite Web Admin Dashboard
├── docs/                     # Complete architecture, API, DB, PLC integration, security & setup docs
├── docker-compose.yml        # Full stack container orchestration (Postgres + Backend + Admin)
└── START_HERE.md             # Quick-start guide for Simulation & Production modes
```

---

## Quick Start (Zero-Docker Local Demo Mode)

Even without Docker or a local PostgreSQL installation, the backend includes an embedded PostgreSQL binary (`embedded-postgres`) for immediate local execution:

```powershell
# 1. Start Embedded PostgreSQL + NestJS Backend in Simulation Mode (Port 3000)
cd "d:\Auto Parke\backend"
npm run dev:demo

# 2. Start the React Web Admin Panel (Port 5173)
cd "d:\Auto Parke\admin"
npm run dev

# 3. Run the Flutter Mobile App
cd "d:\Auto Parke\mobile"
flutter run
```

See **[START_HERE.md](./START_HERE.md)** for demo credentials and **[docs/INDUSTRIAL_INTEGRATION.md](./docs/INDUSTRIAL_INTEGRATION.md)** for connecting to the real Siemens PLC / industrial controller.

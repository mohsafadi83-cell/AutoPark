# START HERE — Auto Park System Guide

Welcome to the **Auto Park** ecosystem. Follow this guide to run the complete system in **Simulation Mode** right now, change the industrial protocol/IP address from the UI, or transition to **Production Mode** once the supplier provides the PLC tag specification.

---

## 1. Running the Complete System Locally (Simulation Mode)

### Step A — Start PostgreSQL + Backend API
You have two options:

**Option 1 — Zero-install (Embedded PostgreSQL included):**
```powershell
cd "d:\Auto Parke\backend"
npm run dev:demo
```
This starts a real PostgreSQL 18 instance (persisted in `backend/.pgdata`), runs the TypeORM database migrations, seeds the 3-level parking garage (60 spaces) and demo accounts, and starts the NestJS server with `MockIndustrialAdapter` at:
- **REST API:** `http://localhost:3000/api/v1`
- **Swagger OpenAPI Docs:** `http://localhost:3000/api/docs`
- **WebSocket Gateway:** `ws://localhost:3000/realtime`

**Option 2 — Using Docker Compose:**
```powershell
cd "d:\Auto Parke"
docker compose up --build -d
```

---

### Step B — Start the React Web Admin Panel
```powershell
cd "d:\Auto Parke\admin"
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

### Step C — Run the Flutter Mobile Application (Android / iOS)
```powershell
cd "d:\Auto Parke\mobile"
flutter pub get
flutter run
```
- On Android Emulator, the app automatically defaults to `http://10.0.2.2:3000/api/v1` (or you can tap **Server Settings** on the login screen / Settings page to enter your computer's LAN IP).

---

## 2. Demo Accounts (Seeded in `SIMULATION` Mode)

| Role | Username | Password | Capabilities |
|---|---|---|---|
| **Super Admin** | `superadmin` | `Admin@12345` | Full access + Industrial Protocol/IP Config + Simulation Scenarios |
| **System Admin** | `admin` | `Admin@12345` | Manage users, vehicles, spaces, alarms, and industrial config |
| **Operator** | `operator` | `Operator@123` | Park/retrieve any vehicle, monitor system, acknowledge alarms |
| **Parking Attendant** | `attendant` | `Operator@123` | Park/retrieve vehicles and monitor spaces |
| **Maintenance Engineer** | `engineer` | `Engineer@123` | Diagnostics, command logs, alarms, simulation testing |
| **Customer** | `customer` | `Customer@123` | Manage own vehicles (`ABC 1234`, `KSA 9080`), request park/retrieve |
| **Read Only** | `viewer` | `Viewer@1234` | Live monitoring only (all control actions blocked) |

---

## 3. Changing the Industrial Protocol, IP Address, and PLC Tags from the UI

You can change the industrial controller protocol, IP address, port, rack/slot, and PLC tag mappings **at any time without restarting the server**:

1. **From the Mobile App (Flutter):**
   - Log in as `superadmin` or `admin`.
   - Go to **Profile / Settings → Industrial Integration Settings** (إعدادات الربط الصناعي والبروتوكول).
   - Select the protocol (`MOCK`, `SIEMENS_S7`, `OPC_UA`, `MODBUS_TCP`, `MQTT`, `REST_GATEWAY`, `CUSTOM_TCP`), enter the IP/Host, Port, Rack, Slot, and Tag addresses, test the connection, and tap **Save**.
2. **From the Web Admin Panel (React):**
   - Open **Industrial Config** in the sidebar.
   - Edit the protocol, connection parameters, timeouts, and the 15-tag PLC address table.
   - Click **Test Connection** (`POST /api/v1/industrial/config/test`) or **Save Configuration** (`PUT /api/v1/industrial/config`).
   - *Safety Interlock:* The backend automatically blocks configuration changes if a physical command is currently in flight (`409 COMMAND_IN_PROGRESS`).

---

## 4. Documentation Index

- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Clean architecture, safety workflow, and real-time topology
- **[docs/API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md)** — Complete REST & WebSocket API specification
- **[docs/DATABASE_SCHEMA.md](./docs/DATABASE_SCHEMA.md)** — PostgreSQL relational schema & indexes
- **[docs/INDUSTRIAL_INTEGRATION.md](./docs/INDUSTRIAL_INTEGRATION.md)** — Siemens KTP400 Basic / S7 PLC integration guide & **18-item Supplier Checklist**
- **[docs/SECURITY.md](./docs/SECURITY.md)** — Authentication, RBAC, encryption, and OT/IT network isolation
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** — Production deployment guide
- **[docs/MOBILE_SETUP.md](./docs/MOBILE_SETUP.md)** — Flutter Android & iOS setup and build instructions
- **[docs/ADMIN_SETUP.md](./docs/ADMIN_SETUP.md)** — React Web Admin setup and Nginx reverse-proxy configuration

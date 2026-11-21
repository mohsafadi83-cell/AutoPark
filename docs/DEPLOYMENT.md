# Production Deployment Guide

## 1. Network Architecture (IT / OT Segmentation)

1. **OT VLAN (Industrial Network):**
   - Houses the Siemens PLC, SIMATIC HMI KTP400 Basic (`6AV2123-2DB03-0AX0`, MAC `8C-F3-19-B3-FB-80`), and field I/O.
   - No direct internet access.
2. **DMZ / Application Server Host:**
   - Runs the **Auto Park Backend** (`autopark-backend`) and **PostgreSQL** (`autopark-postgres`).
   - Dual-homed or firewall-routed so ONLY the backend host can reach the PLC IP on the specific industrial port (e.g., TCP `102` for S7 or TCP `4840` for OPC UA).
3. **HTTPS Reverse Proxy (Nginx / Caddy / Cloud Load Balancer):**
   - Terminates TLS 1.3 (HTTPS / WSS) for the Flutter mobile apps and serves the React Web Admin Panel.

---

## 2. Deploying with Docker Compose

1. Create `.env` in the project root (`d:\Auto Parke\.env`):
   ```ini
   APP_MODE=PRODUCTION
   DB_USER=autopark
   DB_PASSWORD=<strong-random-db-password>
   DB_NAME=autopark
   JWT_ACCESS_SECRET=<64-char-random-secret>
   CONFIG_ENCRYPTION_KEY=<64-hex-char-aes-256-key>
   INDUSTRIAL_PROTOCOL=SIEMENS_S7
   INDUSTRIAL_WRITE_ENABLED=false
   ```
2. Build and start the stack:
   ```bash
   docker compose up --build -d
   ```
3. Verify health:
   ```bash
   curl http://localhost:3000/api/v1/health
   ```
4. Access the Web Admin Panel at `http://localhost:8080` (or behind your TLS domain), configure the PLC IP, Rack, Slot, and Tag Map in **Industrial Config**, and click **Test Connection**.
5. Once read-only telemetry and the PLC handshake are verified on-site, set `INDUSTRIAL_WRITE_ENABLED=true` and restart `autopark-backend`.

# Security Architecture & Operational Hardening

## 1. Zero Direct Hardware Exposure
- The mobile application and web admin panel **never** communicate directly with the PLC or HMI (`KTP400 Basic`).
- PLC IP addresses, credentials, and network configuration are stored exclusively on the backend (`integration_config` table with AES-256-GCM encryption for secrets) and are masked as `********` when viewed by authorized administrators.

## 2. Authentication & Session Security
- **Password Hashing:** `bcrypt` with configurable work factor (`BCRYPT_ROUNDS=12` in production).
- **Brute-Force Protection:** Automatic account lockout (`423 Locked`) after 5 failed login attempts for 15 minutes (`LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`).
- **Short-Lived JWT Access Tokens:** Default 15-minute expiry (`JWT_ACCESS_TTL=900`).
- **Refresh Token Rotation & Reuse Detection:** Refresh tokens are stored as SHA-256 hashes grouped by `family_id`. If a previously rotated refresh token is replayed, the entire token family is immediately revoked and a `SECURITY` event is logged.
- **Secure Mobile Storage:** Tokens on Android/iOS are stored in hardware-backed encrypted storage (`flutter_secure_storage`) and optionally gated by biometric authentication (`local_auth`).

## 3. Role-Based Access Control (RBAC)
Every HTTP endpoint and WebSocket room is enforced server-side by `JwtAndPermissionsGuard`:
- Customers are strictly isolated to their own vehicles, requests, and history.
- Only `SUPER_ADMIN` and `SYSTEM_ADMIN` have `config.manage` permission to modify industrial protocols/IPs/tags.
- Unauthorized attempts are rejected with `403 Forbidden` and recorded in `audit_logs` (`RBAC_DENIED`).

## 4. Industrial Safety Interlocks
- **Fail-Safe Production Startup:** In `PRODUCTION` mode, the backend refuses to start if `JWT_ACCESS_SECRET` or `CONFIG_ENCRYPTION_KEY` uses default/weak values.
- **Hard Write Interlock:** Even in `PRODUCTION` mode, physical writes to the PLC are blocked unless `INDUSTRIAL_WRITE_ENABLED=true` is explicitly set after on-site commissioning.
- **No Automatic Command Retries:** To prevent duplicate physical movement of heavy platforms/lifts, timed-out commands are never re-transmitted automatically.

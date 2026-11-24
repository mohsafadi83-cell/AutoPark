# AutoPark — Comprehensive Functional, Electrical Circuit, Security, Caching & Modernization Audit Report

**Project:** TECHNO Electrical.Jo — AutoPark Automated Parking Control System  
**Scope:** Desktop Control Panel (`src/` — C# WinForms), Backend API & PLC Engine (`backend/` — NestJS + TypeORM + PostgreSQL + Siemens S7-1200), Web Admin Panel (`admin/` — React + TypeScript + MUI + Vite)  
**Hardware Target:** Siemens SIMATIC S7-1200 (`192.168.0.27:102`) + Siemens KTP400 Basic HMI (`192.168.0.30:5900`) — 4 Lanes × 3 Floors (`L11..L43` = 12 Bays)  
**Testing Safety Posture:** Zero physical PLC movement — all PLC sequences verified in `DRY_RUN` / `MOCK` / headless circuit simulation modes.

---

## 1. Executive Summary

A full-stack inspection and real-world automated verification uncovered **13 concrete defects** across electrical interlocks, PLC tag/floor alignment, desktop button workflows, security boundaries, database caching coverage, and E2E tests. Every finding has been fixed and verified with automated test suites and clean production builds across all three stacks:

| Subsystem | Verification Command | Result |
|---|---|---|
| **Desktop Control Panel (`AutoPark.exe`)** | `csc.exe` build + `AutoPark.exe --selftest` | **BUILD OK — 22 / 22 Circuit, Interlock & PLC Mapping Tests PASSED** |
| **Backend API & S7 Engine (`backend/`)** | `npm run build` + `npm test` (real embedded PostgreSQL) | **BUILD OK — 6 / 6 Suites, 32 / 32 Unit & E2E Tests PASSED** |
| **Web Admin Panel (`admin/`)** | `npm run typecheck` + `npm run lint` + `npm test` + `npm run build` | **0 TypeScript / 0 ESLint warnings — 11 / 11 Vitest Tests PASSED + Production Bundle OK** |

---

## 2. Electrical Circuit, Control Panel & Button Alignment Fixes

Every button, momentary hold-to-run trigger, interlock, and operational sequence was audited against the TIA Portal V17 HMI documentation (`Auto Park UI Documentation.pdf`) and classic industrial control wiring diagrams:

| ID | Severity | Location | Root Cause Found | Fix Applied & Verified |
|---|---|---|---|---|
| **CIRCUIT-1** | **CRITICAL** | `src/ClassicControlSimulatorPage.cs` (`FwdRevInterlock`) | Pressing opposing start button (`S2` REV while `KM1` FWD was latched) dropped `KM1` and energized `KM2` on the **same scan tick** — bypassing the NC cross-interlock and causing instant motor plugging! | Rewrote latch equations so `KM1` holds against `PbStart2` and `KM2` cannot energize while `KM1` is active (and vice versa). Requires `STOP (S0)` before reversing. Verified in `FWDREV-1..5`. |
| **CIRCUIT-2** | **HIGH** | `src/ClassicControlSimulatorPage.cs` (`StarDeltaTimer`) | Star (`KM2`) opened and Delta (`KM3`) closed on the same 50ms scan tick without an open-transition pause (phase-to-phase short hazard on real contactors). | Added IEC 60947-4-1 **100ms open-transition dead-time** (`StarDeltaDeadTimeSec = 0.10`). `KM2` drops cleanly and `KM3` waits until dead-time elapses. Verified in `STARDELTA-1..3`. |
| **CIRCUIT-3** | **HIGH** | `src/ClassicControlSimulatorPage.cs` (`WireMomentary`) | Momentary hold buttons did not filter `MouseButtons.Left` and did not release on `LostFocus` / `MouseCaptureChanged` (risk of stuck-ON `LIFT UP`). | Hardened `WireMomentary` to require left mouse button and release automatically on `MouseUp`, `MouseLeave`, `LostFocus`, and `MouseCaptureChanged`. |
| **CIRCUIT-4** | **CRITICAL** | `src/AppSettings.cs`, `src/Pages.cs` | Desktop `MapUiFloorToPlcLevel` still **inverted** `P3 → Level 1` and `P1 → Level 3` (contradicting TIA Portal V17 PDF pp. 42–61 & 159–168 and `SiemensS7Adapter`), and default tags used symbolic names instead of `DB2,B3` / `DB2,B4` and missed `sim_manual_tag`, `manual_action_tag`, `reset_m_tag`. | Aligned desktop to direct mapping (`P1→1, P2→2, P3→3`), updated confirmation labels, and updated all default S7-1200 tag addresses. Verified in `PLC-MAP-1` & `PLC-TAGS-1`. |
| **CIRCUIT-5** | **CRITICAL** | `src/IndustrialPages.cs` (`ReleaseAllOutputs`) | Emergency stop-all in Manual Maintenance fired 13 unsynchronized HTTP calls and **omitted `manual_action_tag` (`%M0.3`)**, leaving manual enable stuck ON. | Replaced with single atomic `SendManualControl("stop_all_manual", false)`, clearing all 14 outputs (13 actuators + `%M0.3`) inside the backend's serialized S7 queue. |
| **CIRCUIT-6** | **CRITICAL** | `src/Pages.cs` (`ParkRetrieveDialog`) | When backend was online, `StartWorkflow` dispatched the full 2-step sequence via `/parking/request`, and then `OnStepTick` fired **duplicate raw `/industrial/s7/write` calls** on top of the active PLC handshake. | Tracked `_backendDispatched` return status from `PushOperationToBackend`; raw fallback writes are skipped whenever backend owns the 2-step S7-1200 sequence. |
| **CIRCUIT-7** | **HIGH** | `src/VncClient.cs` (`VncViewerPage`) | Direct HMI buttons (`AUTO`, `MANUAL`, `Safe Reset`, `Park IN`, `Retrieve OUT`, `Step 1/2 OK`, `Direct Tag Write`) lacked role checks (`CanControl` / `CanMaintenance` / `IsAdmin`), `ReadOnlyMode`, `EmergencyStop`, and `Q*` output guards. | Enforced RBAC enablement on all controls plus runtime guards blocking `Q*` physical output writes, `ReadOnlyMode`, and `EmergencyStop` states. |
| **CIRCUIT-8** | **CRITICAL** | `src/SystemCheckPage.cs` (`ResetAlarmWordAsync`) | Still sent raw `DB2,W8 = 0` (force-zeroing the PLC Alarm Word, masking real hardware faults) and `M0.5 = false`. | Replaced with `SendRecoveryAction("SAFE_RESET")` which pulses `ParkDB.Reset` (`DB2,X10.0`) + `%M0.5` without ever force-zeroing `DB2,W8`. |
| **UI-ALIGN-1** | **MEDIUM** | `admin/src/pages/ParkingPage.tsx` | Tower stacks rendered bottom-up (`P1` at top, `P3` at bottom) instead of matching the physical lift & Siemens KTP400 HMI (`P3` Top → `P1` Bottom), and clicking an available bay had no quick "Park Here" action. | Added `sortTowerSpacesTopDown` (`P3 ↓ P1`) + quick "Park" button passing `targetSpaceNumber`. Verified by Vitest unit test. |

---

## 3. Security & Code Quality Audit Fixes

| ID | Severity | Location | Vulnerability / Issue | Remediation |
|---|---|---|---|---|
| **SEC-1** | **CRITICAL** | `backend/src/modules/industrial/vnc-web.controller.ts` | `encryptVncChallengeDes()` executed `execFileSync('powershell.exe', ...)` synchronously on every VNC login — blocking the Node.js event loop (up to 4s), breaking Linux/Docker portability, and introducing subprocess risk. | Replaced with pure zero-dependency TypeScript FIPS 46-3 / RFC 6143 DES-ECB (`backend/src/modules/industrial/vnc-des.ts`), verified against NIST test vectors (`vnc-des.spec.ts`). |
| **SEC-2** | **HIGH** | `backend/src/modules/industrial/vnc-web.controller.ts` | Missing DTO validation, missing audit logging, and **SSRF risk** allowing `POST /industrial/vnc/connect` to probe cloud metadata (`169.254.169.254`), public IPs, or arbitrary TCP ports. | Added `VncConnectDto`, `VncPointerDto`, `VncTapDto`, `assertSafeVncTarget()` (strict RFC 1918 private LAN / loopback + ports `5800–5999`), audit logs (`VNC_CONNECT`, `VNC_TAP`), and HTML escaping in the live sniffer view. Verified in E2E tests. |
| **SEC-3** | **HIGH** | `backend/src/modules/auth/auth.module.ts` | `POST /auth/login` and `POST /auth/refresh` relied only on the global 300 req/min throttler instead of stricter brute-force limits. | Applied `@Throttle` decorators (`10 req/min` login, `20 req/min` refresh in production). |
| **SEC-4** | **MEDIUM** | `backend/src/modules/parking/parking.module.ts`, `src/Pages.cs` | CSV exports did not neutralize spreadsheet formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`). | Added formula-prefix neutralization (`'`) and proper quote escaping in both Backend `/history/export` and Desktop `CommandsHistoryPage.ExportCsv`. |
| **SEC-5** | **MEDIUM** | `backend/src/database/seed.service.ts` | Unconditionally overwrote DB protocol to `SIEMENS_S7` even during `SIMULATION` / `test` runs, and contained outdated legacy tag addresses (`DB1,X0.0`, `MW20`, `MW10`). | Scoped live S7 seeding strictly to `INDUSTRIAL_PROTOCOL=SIEMENS_S7` non-test runs and updated `liveS7Tags` to the verified TIA Portal V17 addresses. |

---

## 4. Database Caching Architecture & Load Reduction

Upgraded `backend/src/common/cache.module.ts` (`AppCacheService`) into a **dual-tier, production-grade read-through caching layer**:

- **L1 In-Memory LRU Cache:** Bounded to 1,000 entries with per-key TTL expiration, background expired-entry sweep, and **stampede coalescing** (`inFlight` map — 10 simultaneous cache misses execute only **1** PostgreSQL query).
- **Optional L2 Redis Cache (`REDIS_URL`):** Zero-dependency native TCP RESP2 client (`redis://[user:pass@]host:port[/db]`) scoped under `autopark:cache:*` with automatic 350ms timeout and seamless fail-safe fallback to L1-only if Redis is not configured or temporarily unreachable.
- **Full High-Frequency Read Coverage & Strict Write Invalidation:**
  - `auth:user:{id}` (10s TTL) inside `JwtAndPermissionsGuard` — **eliminates 1 PostgreSQL query per authenticated HTTP request** across the entire API; invalidated immediately on login, profile/password change, user update/disable, or device revocation.
  - `auth:me:{id}` (10s TTL) & `auth:prefs:{id}` (15s TTL).
  - `parking:dashboard` (3s TTL), `parking:spaces:*` (5s TTL), `parking:space:{id}` (5s TTL) — invalidated on every park/retrieve/feedback/timeout/cancel transition.
  - `vehicles:list:*` (5s TTL) — invalidated on vehicle create/update/delete AND on every parking state change.
  - `users:list:*` & `users:one:{id}` (10s TTL) — invalidated on create/update/disable.
  - `devices:policy` (30s TTL) & `devices:list` (10s TTL) — invalidated immediately on register/update/revoke/activate/delete/policy change.
  - `alarms:unresolved_counts` (3s TTL), `alarms:has_blocking` (2s TTL), `alarms:list:*` (3s TTL) — invalidated on controller alarm sync & acknowledgement.
  - `industrial:runtime_settings` (30s TTL) — invalidated on config update.
- **Live Observability & Control:**
  - `GET /api/v1/health/cache` (`Permission.SYSTEM_MONITOR`): Global & per-namespace hit rates (`parking`, `auth`, `vehicles`, `users`, `devices`, `alarms`, `industrial`), hits, misses, stampede-deduped count, active entries, and L2 Redis status.
  - `POST /api/v1/health/cache/flush` (`Permission.CONFIG_MANAGE`): Audited cache flush endpoint.
  - **Web Admin Monitoring Dashboard (`admin/src/pages/MonitoringPage.tsx`):** New live **Database Cache Performance** card with Hit Rate progress bar, Hits/Misses/Deduped KPIs, per-namespace chips, and Admin-only Flush Cache control.

---

## 5. Automated Verification Results

### 5.1 Desktop Control Panel (`AutoPark.exe --selftest`)
- **22 / 22 PASSED (0 Failed)**:
  - `DOL-1..4`: Start latching, NC stop, Thermal Overload (`F2`), E-Stop power cut.
  - `FWDREV-1..5`: Forward/Reverse latching, anti-plugging NC cross-interlock blocking both directions, simultaneous S1+S2 rejection.
  - `STARDELTA-1..3`: Star (`KM1+KM2`) → 100ms open-transition dead-time (`KM2=OFF, KM3=OFF`) → Delta (`KM1+KM3`).
  - `HYD-1..6`: Hold-to-run UP (`KM1+KM2`), release drop, Photocell block, gravity DOWN (`KM3` only), UP+DOWN mutual exclusion, `LS_TOP` limit switch cutoff.
  - `SEQ-1..2`: Sequential two-motor starter (`KM1 → KT1 → KM2`).
  - `PLC-MAP-1` & `PLC-TAGS-1`: Direct TIA Portal V17 floor mapping (`1→1, 2→2, 3→3`) and verified S7-1200 tag addresses.

### 5.2 Backend API & Embedded PostgreSQL (`npm test`)
- **6 / 6 Suites, 32 / 32 Tests PASSED**:
  - `test/app.e2e-spec.ts` (9 E2E tests against real embedded PostgreSQL 18): Health & cache telemetry, DB cache hit-rate & admin flush RBAC, refresh-token rotation & reuse family revocation, RBAC & VNC SSRF blocking (`169.254.169.254`, `8.8.8.8`, port `22`), vehicle validation & already-parked guards, full `PARK → COMPLETED` and `RETRIEVE → COMPLETED` lifecycles, offline/critical-alarm/timeout safety watchdogs, secret masking in industrial config, and CSV export.
  - `src/modules/industrial/vnc-des.spec.ts` (5 unit tests): NIST FIPS 46-3 DES test vectors & RFC 6143 bit-reversed key derivation.
  - `src/common/cache.service.spec.ts` (5 unit tests): Read-through hit rate, 10-way stampede deduplication, prefix invalidation, TTL expiry, per-namespace metrics & flush.
  - `src/modules/industrial/adapters/siemens-s7.dryrun.spec.ts` (6 dry-run tests): Verified TIA Portal V17 2-step handshake, direct floor mapping, atomic `stop_all_manual`, and `Q*` output write blocking.
  - `src/modules/industrial/adapters/mock-industrial.adapter.spec.ts` & `src/common/permissions.spec.ts`.

### 5.3 Web Admin Panel (`admin/`)
- `npm run typecheck` (`tsc -b`): **PASS (0 errors)**
- `npm run lint` (`eslint . --max-warnings=0`): **PASS (0 warnings)**
- `npm test` (`vitest run`): **11 / 11 Tests PASSED**
- `npm run build` (`vite build`): **PASS**

# AutoPark — Comprehensive PLC Root-Cause Audit, Security Hardening, Database Caching & Dry-Run Report

**Date:** 2026-11-24  
**System:** TECHNO Electrical.Jo — Automated Smart Parking (`d:\Auto Parke`)  
**PLC Target:** Siemens SIMATIC S7-1200 CPU 1212C (`192.168.0.27:102`, Rack `0`, Slot `1`)  
**Reference Documents Audited:**
- TIA Portal V17 WinCC RT Advanced Documentation (`Auto_Park_UI_Documentation.pdf`, 319 pages)
- TIA Portal PLC Tag Table (`PLCTags_(1).xlsx`, 107 `%M` tags)
- Data Block Snapshots: `ParkIO_Data [DB1]` (rows 1–26, offsets `0.0–3.0`) & `ParkDB [DB2]` (rows 31–44, offsets `5.4–10.3`)

---

## 1. Root Cause Analysis — Why Car-Lifting Failed Without VNC

When operating via VNC (`192.168.0.30:5900`), mouse clicks triggered the WinCC RT HMI's native `Press` / `Release` / `Screen Loaded` function lists inside the Siemens HMI runtime. When VNC was removed and commands ran directly from `AutoPark.exe` → NestJS Backend → `nodes7`, **six exact root causes** prevented the S7-1200 PLC ladder from engaging the hydraulic car-lifting mechanism:

| # | Severity | Root Cause Identified (Code vs. TIA Portal V17 PDF) | Exact Fix Implemented |
|---|---|---|---|
| **RC-1** | **CRITICAL** | **Level Number Inverted (`1 ↔ 3`)**: `mapUiFloorToPlcLevel()` in `siemens-s7.adapter.ts` inverted floor `1 → 3` and `3 → 1`. Per TIA Portal PDF pp. 42–61 & 159–168, `L11` sets `Lane=1, Level=1`, `L12` sets `Level=2`, and `L13` sets `Level=3`. | Fixed `mapUiFloorToPlcLevel()` to map `1→1`, `2→2`, `3→3` directly. |
| **RC-2** | **CRITICAL** | **Latched Start Bits Were Pulsed (`350ms`) & Killed Immediately**: `dispatchPlcCommand()` pulsed `Park_IN` (`DB2,X6.3`), `Park_OUT` (`DB2,X6.4`), `Park_IN_Step1_Start` (`%M10.0`), and `Park_IN_Step2_Start` (`%M10.1`) for `350ms` and then wrote `false`. Per PDF pp. 42–51, 104, 108, the HMI uses **`SetBit` (latched ON)** while the PLC resets them upon completion, and executes **`ResetBit(Park_Step1_Ready)`** (`DB2,X5.4`) after `SetBit(Park_IN_Step1_Start)` (and `ResetBit(Park_Step2_Ready)` after `SetBit(Park_IN_Step2_Start)`). | Replaced 350ms pulses with exact TIA Portal `SetBit` / `ResetBit` handshake sequence in `siemens-s7.adapter.ts`. |
| **RC-3** | **CRITICAL** | **Missing `Lane{1..4}_check_location` (`%M3.4–%M3.7`) & Screen-Load Resets**: Per PDF pp. 52–61, every Park-IN bay button sets `Lane{n}_check_location` (`%M3.4..%M3.7`) on `Press`. Per PDF pp. 102–103, entering `Park-IN` resets `User_Logoff` (`DB1,X2.6`), `Manual_DB` (`DB1,X0.5`), and `Sim Manual` (`DB1,X2.7`) before setting `Auto_DB` (`DB1,X0.3`) + `Park_Step1_Ready` (`DB2,X5.4`). None of these were executed before lifting. | Added full pre-reset (`User_Logoff`, `Manual_DB`, `Sim Manual`, `manual_action`) and `check_loc_L{lane}` (`%M3.4..%M3.7`) on Park-IN. |
| **RC-4** | **CRITICAL** | **S7-1200 TCP Connection Exhaustion on Multi-Tag Writes**: `writePlcTag()` opened a brand-new `new nodes7()` ISO-on-TCP connection for every single bit write (6–8 sequential connect/disconnect cycles per command), exhausting CPU 1212C connection resources. | Implemented serialized FIFO write queue (`writeChain`) reusing the persistent `this.conn` S7 connection. |
| **RC-5** | **CRITICAL** | **Manual Mode Missing `manual_action` (`%M0.3`) + Cutoff Interlocks**: Per PDF pp. 7–15, Stoppers `S1–S4` (`DB1,X2.2–2.5`) and Lanes `L1–L4` (`DB1,X1.6–2.1`) require `manual_action` (`%M0.3`) ON/OFF, and `UP`/`DOWN` must reset `Man_Cuttoff_DB` (`DB1,X1.5`). | Implemented in `siemens-s7.adapter.ts` (`manualControl`) plus `stop_all_manual` safe release of all 14 actuators. |
| **RC-6** | **HIGH** | **Desktop Direct HMI Bypassed Backend 2-Step Sequence**: `VncClient.cs` previously only pulsed `DB2,X6.3` instead of invoking `/api/v1/parking/request` and `/api/v1/parking/retrieve`. | Updated `VncClient.cs` `ExecuteDirectBayOp()` to invoke `/api/v1/parking/request` & `/api/v1/parking/retrieve` with full 15-step safety workflow and standalone offline fallback. |

> **Important Note on `ParkDB [DB2]` Rows 1–30:** PDF pages 221–222 confirm `ParkDB.Lane_Number` and `ParkDB.Level_Number` are `Byte` (1 byte each), matching our live PLC `DB2` byte dump `[0, 0, 0, 4, 1, ...]` (`DB2,B3=4`, `DB2,B4=1`). Before writing live on the physical machine, confirm `ParkDB [DB2]` rows 1–30 in TIA Portal so `lane_number_tag` and `level_number_tag` offsets are 100% screenshot-verified on the company server `192.168.0.30`.

---

## 2. Safe Simulation & Dry-Run Verification Results (ZERO Physical Movement)

All hardware tests were executed strictly in **Zero-Network, Zero-Movement Dry-Run Mode** (`SiemensS7Adapter.enableDryRun()`):

| Test Suite | Tests | Result | Verified Behaviors |
|---|---:|---|---|
| `siemens-s7.dryrun.spec.ts` | 8 | **PASS** | Direct Level mapping (`1→1, 2→2, 3→3`), Full `PARK IN (L32)` 2-step sequence, `RETRIEVE OUT (L41)` sequence, Hydraulic `UP/DOWN` + `Cutoff` interlocks, Stoppers `S1–S4` & Lanes `L1–L4` + `manual_action (%M0.3)`, `stop_all_manual` (14 outputs OFF), E-Stop / Obstacle / Invalid Position blocks, Physical `Q` write rejection, Pump O.L (`%M50.1`) & Compressor O.L (`%M50.2`) alarm decoding, `SAFE_RESET` without zeroing `DB2,W8` |
| `cache.service.spec.ts` | 4 | **PASS** | Cache hit/miss tracking, 10x concurrent stampede deduplication (1 DB query for 10 simultaneous callers), prefix invalidation on writes, TTL expiry |
| `mock-industrial.adapter.spec.ts` | 2 | **PASS** | Simulated park/retrieve lifecycle and fault scenarios |
| `permissions.spec.ts` | 3 | **PASS** | RBAC permission matrix verification |
| `AutoPark.exe --selftest` | 1 | **PASS** | `OK Spaces=12 Protocol=SIEMENS_S7 Lang=en` |

**Total Automated Tests:** **17 / 17 Passed (100%)** + `nest build` OK + `AutoPark.exe` C# build OK.

---

## 3. Security & Code Quality Audit Findings & Fixes

| # | Severity | Finding | Remediation Applied |
|---|---|---|---|
| **SEC-1** | **CRITICAL** | All 6 routes in `VncWebController` (`/api/v1/industrial/vnc/*`) were marked `@Public()`, allowing unauthenticated HMI pointer/tap injection and internal network SSRF (`connect`). | Removed all `@Public()` decorators and locked entire controller with `@RequirePermissions(Permission.CONFIG_MANAGE)`. |
| **SEC-2** | **HIGH** | `POST /api/v1/industrial/s7/write` required only `DIAGNOSTICS_VIEW` and permitted raw writes to physical output addresses (`Q0.0`, `QB2`), potentially bypassing PLC safety interlocks. | Elevated permission to `Permission.CONFIG_MANAGE`, added strict `class-validator` DTO (`WritePlcTagDto`), and enforced hard rejection of all `/^Q/i` writes inside `SiemensS7Adapter`. |
| **SEC-3** | **MEDIUM** | `POST /api/v1/industrial/s7/manual` and `/recovery` lacked typed `class-validator` DTOs. | Added `ManualControlDto` and `EmergencyRecoveryDto` with `@IsIn`, `@IsString`, `@IsBoolean`. |
| **SEC-4** | **LOW** | No explicit JSON/URL-encoded request body cap in `main.ts`. | Added `express.json({ limit: '1mb' })` and `express.urlencoded({ extended: true, limit: '1mb' })`. |

---

## 4. Database Caching Implementation (`AppCacheService`)

Implemented `@Global() CacheModule` (`backend/src/common/cache.module.ts`) with TTL expiration, LRU max-entry cap (`500` entries), concurrent stampede deduplication, and automatic prefix invalidation on every write:

| Cached Query Path | TTL | Automatic Invalidation Trigger |
|---|---:|---|
| `ParkingService.listSpaces` (`parking:spaces:*`) | `5s` | Any park/retrieve request, space update, command timeout, or controller feedback |
| `ParkingService.getDashboard` (`parking:dashboard`) | `3s` | Any parking mutation or alarm change |
| `IndustrialIntegrationService.getRuntimeSettings` (`industrial:runtime_settings`) | `30s` | `updateConfig()` |
| `AlarmsService.countUnresolved` / `hasBlockingAlarm` (`alarms:*`) | `2–3s` | `syncControllerAlarms()` and `acknowledge()` |

Live cache statistics are exposed on `GET /api/v1/health` (summary) and `GET /api/v1/health/cache` (`Permission.DIAGNOSTICS_VIEW`).

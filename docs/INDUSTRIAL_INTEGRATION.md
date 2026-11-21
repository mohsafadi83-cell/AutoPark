# Industrial Integration & Siemens PLC Commissioning Guide

## 1. Existing Hardware Context

The existing physical installation includes the following operator panel:

| Field | Value |
|---|---|
| **Manufacturer** | Siemens |
| **Series** | SIMATIC HMI |
| **Model** | KTP400 Basic |
| **Order Number** | `6AV2123-2DB03-0AX0` |
| **Interface** | PROFINET / Industrial Ethernet |
| **Device MAC Address** | `8C-F3-19-B3-FB-80` |
| **Supply Voltage** | 24 VDC |

> [!IMPORTANT]
> The **SIMATIC HMI KTP400 Basic (`6AV2123-2DB03-0AX0`)** is an operator visualization panel. It does **not** expose a public REST API and is **not** the primary safety/motion controller of the parking machinery. Behind this HMI on the Ethernet/PROFINET network sits an industrial controller (typically a **Siemens SIMATIC S7-1200** or **S7-1500** PLC, or a dedicated controller).

---

## 2. Protocol-Agnostic Integration Architecture

All hardware communication is isolated behind the `IndustrialController` interface (`backend/src/modules/industrial/industrial-controller.interface.ts`):

- **`MockIndustrialAdapter` (`MOCK`)** — Full state-machine simulator for development, training, and automated E2E testing.
- **`SiemensS7Adapter` (`SIEMENS_S7`)** — ISO-on-TCP (RFC 1006, port 102) communication with Siemens S7-1200 / S7-1500 / S7-300 / S7-400 PLCs via Data Block addresses (e.g. `DB10,X0.0`, `DB10,INT2`, `DB10,DINT4`).
- **`OpcUaAdapter` (`OPC_UA`)** — Connects to an OPC UA server (`opc.tcp://<ip>:4840`), recommended for modern S7-1500 / S7-1200 firmware with built-in OPC UA.
- **`ModbusTcpAdapter` (`MODBUS_TCP`)** — Connects to Modbus TCP controllers (port 502) using Coils (`C:`), Discrete Inputs (`DI:`), Input Registers (`IR:`), and Holding Registers (`HR:`).
- **`MqttAdapter` (`MQTT`)** — Connects via an industrial MQTT edge gateway using QoS 1 topics.
- **`RestGatewayAdapter` (`REST_GATEWAY`)** — Connects to an industrial edge REST gateway.
- **`CustomTcpAdapter` (`CUSTOM_TCP`)** — Connects over a dedicated TCP socket for custom supplier framing.

---

## 3. Configurable Tag Mapping System (Zero Hardcoded Addresses)

Every logical signal is mapped dynamically in the database (`integration_config.tag_map`) and can be edited live in the **Web Admin Panel** or **Mobile App Settings**:

| Logical Tag Key | Default Type | Access | Purpose |
|---|---|---|---|
| `system_ready_tag` | `BOOL` | `R` | Controller is in AUTO and ready to accept commands |
| `emergency_status_tag` | `BOOL` | `R` | `TRUE` when Emergency Stop circuit is triggered |
| `safety_ok_tag` | `BOOL` | `R` | `TRUE` when all safety light curtains, doors, and interlocks are healthy |
| `heartbeat_tag` | `INT` | `R` | Rolling life-word counter incremented by the PLC |
| `machine_state_tag` | `INT` | `R` | `1`=IDLE, `2`=BUSY, `3`=FAULT, `4`=E-STOP, `5`=MAINTENANCE |
| `parking_space_status_tag` | `DWORD` | `R` | Bay occupancy bitmask / array base address |
| `vehicle_position_tag` | `INT` | `R` | Active transport progress `0..100` % |
| `alarm_tag` | `WORD` | `R` | Active PLC alarm bitmask |
| `park_command_tag` | `BOOL` | `W` | Rising-edge trigger to start a PARK cycle |
| `retrieve_command_tag` | `BOOL` | `W` | Rising-edge trigger to start a RETRIEVE cycle |
| `command_id_tag` | `DINT` | `W` | Unique command sequence number written before triggering a command |
| `target_space_tag` | `INT` | `W` | Target bay / pallet number (`controllerRef`) |
| `command_acknowledgement_tag` | `DINT` | `R` | PLC echoes `command_id_tag` when command is accepted |
| `command_complete_tag` | `DINT` | `R` | PLC echoes `command_id_tag` only when physical movement is 100% finished |
| `command_error_tag` | `INT` | `R` | Non-zero fault code if the PLC rejects or aborts the command |

---

## 4. Required Hardware Information Checklist (Must Be Obtained from Supplier Before Production Cutover)

Do **not** enable `INDUSTRIAL_WRITE_ENABLED=true` in production until the Auto Park supplier / commissioning engineer provides and verifies all **18 items** below:

- [ ] **1. Exact PLC Model & CPU Order Number** (e.g., S7-1200 CPU 1214C / S7-1500 CPU 1511-1 PN and firmware version)
- [ ] **2. PLC IP Address & Subnet Mask** (on the PROFINET / Industrial Ethernet network)
- [ ] **3. Network Topology & VLAN Architecture** (switch ports connecting KTP400 `8C-F3-19-B3-FB-80`, PLC, and backend gateway firewall)
- [ ] **4. Supported Communication Protocol** (Siemens S7 PUT/GET, OPC UA, Modbus TCP, or supplier gateway)
- [ ] **5. Rack and Slot Numbers** (if Siemens S7, typically Rack `0`, Slot `1` for S7-1200/1500)
- [ ] **6. OPC UA Server Availability & Security Policy** (Endpoint URL, certificate requirements, username/password if S7-1500/1200 OPC UA is enabled)
- [ ] **7. Complete PLC Tag List** (symbolic names, data types, and scaling)
- [ ] **8. Interface Data Block (DB) Numbers & Offsets** (and confirmation of non-optimized block access if using S7 protocol)
- [ ] **9. Read/Write Access Permissions** (which DB tags are read-only telemetry vs. remote command inputs, and whether PUT/GET is permitted in TIA Portal)
- [ ] **10. Command Handshake Design** (exact sequence for writing command ID + target bay + trigger bit, and how the PLC latches and clears the trigger)
- [ ] **11. Parking Space / Pallet Status Tags** (mapping between physical space numbers `L1-A01..` and PLC array indices)
- [ ] **12. Alarm Word / Bit List** (complete list of alarm bits, fault codes, severities, and descriptions)
- [ ] **13. Emergency Stop Status Signal** (exact tag and polarity: active-high vs. fail-safe active-low `0 = E-Stop`)
- [ ] **14. Safety Interlocks List** (entry/exit gates, photo-eyes, light curtains, over-height/over-weight sensors, manual/maintenance key-switch status)
- [ ] **15. Command Acknowledgement Signal** (how the PLC confirms it accepted a command so the backend can stop the ACK watchdog timer)
- [ ] **16. Command Completion Signal** (how the PLC confirms the vehicle is safely parked or ready at the exit bay)
- [ ] **17. Supplier Operations & Interface Documentation** (TIA Portal project excerpt or interface specification document)
- [ ] **18. Electrical & PROFINET Network Diagrams** (as-built schematics of the control cabinet)

---

## 5. Safe Commissioning Procedure

1. Keep `APP_MODE=PRODUCTION` and `INDUSTRIAL_WRITE_ENABLED=false` (or enable `readOnly: true` in the Industrial Config UI).
2. Enter the PLC IP, protocol, and read-only tags (`system_ready_tag`, `emergency_status_tag`, `heartbeat_tag`, `machine_state_tag`, `alarm_tag`) in the Admin Panel or Mobile Settings.
3. Click **Test Connection** and verify live telemetry on the **Live System Monitoring** screen (`heartbeatAgeMs`, `machineState`, `safetyOk`).
4. Only after read telemetry and the command handshake are verified with the supplier on-site, set `INDUSTRIAL_WRITE_ENABLED=true` and `readOnly: false` to perform supervised physical test cycles.

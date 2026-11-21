# Auto Park — System Architecture

## 1. End-to-End Topology

```
┌───────────────────────────────────────────────┐   ┌───────────────────────────────────────────────┐
│   Flutter Mobile App (Android & iOS)          │   │   React + TypeScript Web Admin Panel          │
│   • Clean Architecture + Riverpod             │   │   • Live Monitoring, Map, RBAC, Audit Logs    │
│   • Arabic RTL & English LTR                  │   │   • Industrial Config & PLC Tag Editor        │
│   • Biometrics, Secure Storage, Socket.IO     │   │   • Simulation Scenario Control               │
└──────────────────────┬────────────────────────┘   └──────────────────────┬────────────────────────┘
                       │  HTTPS REST (/api/v1) + Authenticated WSS (/realtime)
                       ▼                                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             Secure Backend API (Node.js / NestJS)                                 │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────────┐ ┌────────────────┐ ┌─────────────┐  │
│  │ Auth + Refresh │ │ RBAC Guard     │ │ 15-Step Safety     │ │ Alarms &       │ │ Audit &     │  │
│  │ Token Rotation │ │ (7 Roles,      │ │ Command Workflow   │ │ Notification   │ │ System      │  │
│  │ + Lockout      │ │ 17 Permissions)│ │ + Watchdog Timers  │ │ Engine         │ │ Event Log   │  │
│  └────────────────┘ └────────────────┘ └─────────┬──────────┘ └────────────────┘ └─────────────┘  │
│                                                  │                                                │
│                                                  ▼                                                │
│                          ┌───────────────────────────────────────────────┐                        │
│                          │       IndustrialIntegrationService            │                        │
│                          │  Implements `IndustrialController` Contract   │                        │
│                          └───────────────────────┬───────────────────────┘                        │
│       ┌───────────────┬──────────────┬───────────┴───┬──────────────┬──────────────┐              │
│       ▼               ▼              ▼               ▼              ▼              ▼              │
│  [MockAdapter]  [SiemensS7]     [OpcUaAdapter]  [ModbusTcp]   [MqttAdapter]  [Rest/CustomTCP]     │
└───────┼───────────────┼──────────────┼───────────────┼──────────────┼──────────────┼──────────────┘
        │               │              │               │              │              │
        │               └──────────────┴───────────────┴──────────────┴──────────────┘
        │                                              │  Isolated Industrial Ethernet / PROFINET
        │                                              ▼
        │                              ┌───────────────────────────────────────────────┐
        │                              │  Industrial PLC (S7-1200 / S7-1500 / etc.)    │
        │                              │  + Siemens SIMATIC HMI KTP400 Basic           │
        │                              │    (6AV2123-2DB03-0AX0, MAC 8C-F3-19-B3-FB-80)│
        │                              └───────────────────────┬───────────────────────┘
        │                                                      ▼
        └─► Simulated Mechanics                  Physical Lifts, Shuttles, Gates & Sensors
```

---

## 2. 15-Step Command Safety Workflow

Every `POST /api/v1/parking/request` (PARK) and `POST /api/v1/parking/retrieve` (RETRIEVE) executes:

1. **User Authentication:** Verified JWT access token + active user status check.
2. **Permission Check:** `parking.request` (own vehicles) or `parking.request.any` (operators/attendants).
3. **Input Validation:** Validates `vehicleId` or normalized `plateNumber`, verifies ownership.
4. **System Status Check:** Verifies `controllerConnected && plcConnected && systemReady` and ensures no conflicting in-flight command is active.
5. **Safety State Check:** Verifies `!emergencyStop && safetyOk` and confirms zero active `CRITICAL` or `EMERGENCY` alarms.
6. **Create Command Record:** Persists `IndustrialCommandEntity` with full request metadata in a serializable database transaction.
7. **Generate Unique Command ID:** Assigns `CMD-YYYYMMDD-XXXXXXXX` + monotonic 31-bit PLC sequence integer.
8. **Send Command to Industrial Integration Service:** Dispatches once to the active `IndustrialController` adapter.
9. **Wait for Acknowledgement:** Arms the `ackTimeoutMs` watchdog timer. If no acknowledgement arrives, transitions to `TIMEOUT` without resending.
10. **Monitor Execution:** Tracks controller progress (`0..100%`) and phase while the `completionTimeoutMs` watchdog is active.
11. **Receive Completion or Failure:** Only transitions to `COMPLETED` when the controller explicitly signals completion.
12. **Update Database:** Updates `parking_spaces`, `parking_requests`, and `industrial_commands`.
13. **Send Real-Time Update:** Emits `parking.request.updated`, `parking.space.updated`, `vehicle.moving`, and `vehicle.parked` / `vehicle.retrieved` over `/realtime`.
14. **Send Notification:** Creates and pushes `PARKING_COMPLETED`, `VEHICLE_READY`, or `REQUEST_FAILED` notifications.
15. **Save Complete Audit Log:** Records immutable audit log and system event entries.

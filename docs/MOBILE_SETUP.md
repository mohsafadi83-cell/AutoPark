# Auto Park — Flutter Mobile Application Setup & Architecture Guide

This document covers setup, configuration, industrial safety architecture, localization, and build instructions for the **Auto Park** Flutter mobile client (`mobile/`) targeting **Android** and **iOS**.

---

## 1. Prerequisites

- **Flutter SDK**: `>= 3.24.0` (Dart `>= 3.5.0 < 4.0.0`)
- **Android Studio / Android SDK** (API 34+ recommended) for Android builds
- **Xcode 15+** (macOS) for iOS builds
- Running **Auto Park Backend** (`backend/` on port `3000` by default)

---

## 2. Project Structure (`mobile/lib/`)

```text
lib/
├── main.dart                                # App entry point, ProviderScope, RTL/LTR localization & theming
├── l10n/
│   ├── app_ar.arb                           # Arabic (RTL default) translations
│   ├── app_en.arb                           # English (LTR) translations
│   └── generated/                           # Generated AppLocalizations classes
├── core/
│   ├── config/app_config.dart               # Default host resolution, timeouts, API & Socket.IO paths
│   ├── connectivity/                        # Persistent safety banner (offline / backend / controller / E-Stop)
│   ├── models/models.dart                   # Strongly typed models matching API_DOCUMENTATION.md
│   ├── network/
│   │   ├── api_client.dart                  # Dio client, JWT interceptor, single-flight refresh rotation
│   │   └── api_error.dart                   # Machine-readable error code -> localized message mapping
│   ├── notifications/                       # Local push notifications (flutter_local_notifications)
│   ├── providers/app_providers.dart         # Riverpod AppController & reactive state + WebSocket bindings
│   ├── realtime/realtime_service.dart       # Socket.IO (/realtime) auto-reconnect client & streams
│   ├── storage/
│   │   ├── token_storage.dart               # flutter_secure_storage + memory fallback
│   │   └── preferences_storage.dart         # Server URL, language, theme, biometrics & read-only cache
│   ├── theme/app_theme.dart                 # Industrial Smart-City Dark & Light Material 3 themes
│   └── widgets/
│       ├── system_status_hero.dart          # Large status card (Online/Warning/Error/Offline + PLC/Safety chips)
│       ├── alarm_severity_badge.dart        # Icon + text + color badges (never relies on color alone)
│       └── request_step_timeline.dart       # 7-step PARK / RETRIEVE timeline with controller completion guard
└── features/
    ├── auth/                                # Splash screen, Login screen, Biometrics, Server URL dialog
    ├── dashboard/                           # Main Dashboard, KPI cards, quick actions, Simulation Lab sheet
    ├── parking/                             # Request Vehicle Parking & Vehicle Retrieval + confirmation modal
    ├── map/                                 # Visual Parking Map (Level tabs, Zone/Status filters, live grid)
    ├── monitoring/                          # Live System Monitoring (PLC, Controller, Heartbeat, Safety, E-Stop)
    ├── alarms/                              # Active & All Alarms + Acknowledge with note (no unsafe reset)
    ├── notifications/                       # In-app notifications center + unread counter
    ├── vehicles/                            # Vehicle CRUD + per-vehicle parking history
    ├── history/                             # Filtered PARK/RETRIEVE/EVENT/AUDIT log + CSV export
    ├── settings/industrial_config_screen.dart # Industrial Integration & Connection Settings (PLC/IP/Port/Tags)
    ├── profile/profile_and_more_screen.dart # Operator profile, password change, language, theme, preferences
    └── shell/main_shell_screen.dart         # Bottom navigation shell & top safety bar
```

---

## 3. Running Locally in Development

```bash
cd mobile

# 1. Install dependencies & generate localizations
flutter pub get
flutter gen-l10n

# 2. Run static analysis & unit/widget tests
flutter analyze
flutter test

# 3. Launch on Android emulator (defaults to http://10.0.2.2:3000)
flutter run

# 4. Launch on physical device or custom backend IP
flutter run --dart-define=API_BASE_URL=http://192.168.1.100:3000
```

---

## 4. Changing the Backend Server or Industrial Controller Connection at Runtime

The mobile app is designed so you never need to recompile when switching between local simulation, staging, or an on-premise factory network:

1. **From the Login Screen**: Tap the **Server Connection (DNS icon)** in the top bar or the server address link at the bottom of the card. Enter `http://<IP>:<PORT>`, tap **Test Connection** to verify `/api/v1/health`, and tap **Save**.
2. **From Inside the App (Settings -> Industrial Integration & Connection Settings)**:
   - Any user can update the **Backend Server URL** at any time.
   - Users with the `config.manage` permission (`SUPER_ADMIN` / `SYSTEM_ADMIN`) can also configure and test the industrial controller adapter (`MOCK`, `SIEMENS_S7`, `OPC_UA`, `MODBUS_TCP`, `MQTT`, `REST_GATEWAY`, `CUSTOM_TCP`), PLC IP/host, port, rack/slot, OPC UA endpoint, Modbus unit ID, MQTT broker, timeouts, read-only monitoring mode, and PLC Tag Map addresses directly from the mobile app.

---

## 5. Industrial Safety Guarantees Implemented in the Mobile Client

- **Never Fakes Completion**: `RequestStepTimeline` strictly enforces that `PARKING_COMPLETED` and `VEHICLE_READY` are never rendered as `DONE` unless `request.status == 'COMPLETED'` (reported by the controller).
- **Never Queues Control Commands Offline**: When the device is offline, the backend is unreachable, or the controller is disconnected (`canAcceptCommands == false`), all Park/Retrieve dispatch buttons are disabled and a persistent top safety banner is displayed. Only read-only snapshots (last dashboard, spaces, vehicles) are cached and explicitly labeled as cached.
- **Accessible Status & Alarm Indicators**: Every system state, space state, and alarm severity badge pairs an explicit icon, localized text label, and high-contrast color.
- **Safe Alarm Handling**: Authorized staff (`alarms.acknowledge`) can acknowledge alarms with an optional operator note, while alarm resolution occurs strictly when the PLC/Controller clears the physical fault.

---

## 6. Building Release Packages

### Android APK / App Bundle
```bash
flutter build apk --release --dart-define=API_BASE_URL=https://api.autopark.example.com
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.autopark.example.com
```

### iOS Archive (macOS)
```bash
flutter build ipa --release --dart-define=API_BASE_URL=https://api.autopark.example.com
```

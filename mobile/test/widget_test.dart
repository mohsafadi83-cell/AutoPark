import 'package:auto_park/core/models/models.dart';
import 'package:auto_park/core/providers/app_providers.dart';
import 'package:auto_park/core/storage/token_storage.dart';
import 'package:auto_park/core/widgets/alarm_severity_badge.dart';
import 'package:auto_park/core/widgets/request_step_timeline.dart';
import 'package:auto_park/core/widgets/system_status_hero.dart';
import 'package:auto_park/features/auth/login_screen.dart';
import 'package:auto_park/features/dashboard/dashboard_screen.dart';
import 'package:auto_park/l10n/generated/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeAppController extends AppController {
  _FakeAppController(AppState initial)
      : super(
          tokenStorage: MemoryTokenStorage(),
          autoBootstrap: false,
        ) {
    state = initial;
  }
}

Widget _wrapWithL10n(
  Widget child, {
  Locale locale = const Locale('en'),
  AppState? appState,
}) {
  return ProviderScope(
    overrides: [
      if (appState != null)
        appControllerProvider.overrideWith((_) => _FakeAppController(appState)),
    ],
    child: MaterialApp(
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: child),
    ),
  );
}

void main() {
  group('RBAC & Permission Model Tests', () {
    test('Customer vs Operator vs SuperAdmin permission boundaries', () {
      const customer = User(
        id: 'u1',
        fullName: 'Customer User',
        username: 'customer',
        email: 'c@autopark.local',
        phone: null,
        role: 'CUSTOMER',
        permissions: [
          Permission.dashboardView,
          Permission.parkingView,
          Permission.parkingRequest,
          Permission.vehiclesManageOwn,
          Permission.historyViewOwn,
        ],
        status: 'ACTIVE',
        language: 'ar',
      );
      expect(customer.canRequestParking, isTrue);
      expect(customer.canRequestAnyVehicle, isFalse);
      expect(customer.canAcknowledgeAlarms, isFalse);
      expect(customer.canManageConfig, isFalse);

      const operatorUser = User(
        id: 'u2',
        fullName: 'Plant Operator',
        username: 'operator',
        email: 'op@autopark.local',
        phone: null,
        role: 'OPERATOR',
        permissions: [
          Permission.dashboardView,
          Permission.parkingRequest,
          Permission.parkingRequestAny,
          Permission.alarmsView,
          Permission.alarmsAcknowledge,
          Permission.systemMonitor,
        ],
        status: 'ACTIVE',
        language: 'ar',
      );
      expect(operatorUser.canRequestAnyVehicle, isTrue);
      expect(operatorUser.canAcknowledgeAlarms, isTrue);
      expect(operatorUser.canManageConfig, isFalse);

      const superAdmin = User(
        id: 'u3',
        fullName: 'Super Admin',
        username: 'superadmin',
        email: 'sa@autopark.local',
        phone: null,
        role: 'SUPER_ADMIN',
        permissions: [],
        status: 'ACTIVE',
        language: 'ar',
      );
      expect(superAdmin.canManageConfig, isTrue);
      expect(superAdmin.canControlSimulation, isTrue);
    });
  });

  group('Login Validation & Localization Tests', () {
    testWidgets('Login screen validates empty username & password',
        (tester) async {
      await tester.pumpWidget(
        _wrapWithL10n(
          const LoginScreen(),
          appState: const AppState(isBootstrapping: false),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('login_submit_button')));
      await tester.pumpAndSettle();

      expect(
        find.text('Please enter your username or email'),
        findsOneWidget,
      );
      expect(find.text('Please enter your password'), findsOneWidget);
    });

    testWidgets('Arabic locale renders RTL directionality', (tester) async {
      await tester.pumpWidget(
        _wrapWithL10n(
          const LoginScreen(),
          locale: const Locale('ar'),
          appState: const AppState(
            isBootstrapping: false,
            locale: Locale('ar'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(Directionality.of(tester.element(find.byType(LoginScreen))),
          TextDirection.rtl);
      expect(find.text('تسجيل الدخول'), findsWidgets);
    });
  });

  group('Industrial Safety UI & Telemetry Tests', () {
    testWidgets(
        'AlarmSeverityBadge & SystemStatusHero always render both Icon and Text',
        (tester) async {
      final status = SystemStatus(
        mode: 'SIMULATION',
        adapter: 'SIEMENS_S7',
        state: SystemState.warning,
        controllerConnected: true,
        plcConnected: true,
        machineState: 'IDLE',
        emergencyStop: false,
        safetyOk: true,
        systemReady: true,
        communication: 'OK',
        lastUpdate: DateTime.now(),
        message: 'Sensor calibration warning',
      );

      await tester.pumpWidget(
        _wrapWithL10n(
          Column(
            children: [
              SystemStatusHero(status: status),
              const AlarmSeverityBadge(severity: AlarmSeverity.critical),
              const SpaceStatusBadge(status: SpaceStatus.occupied),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('System Warning'), findsOneWidget);
      expect(find.text('CRITICAL'), findsOneWidget);
      expect(find.text('Occupied'), findsOneWidget);
      expect(find.byIcon(Icons.gpp_bad_rounded), findsOneWidget);
      expect(find.byIcon(Icons.directions_car_filled_rounded), findsOneWidget);
    });

    testWidgets(
        'CRITICAL SAFETY: RequestStepTimeline never marks final step DONE unless request.status == COMPLETED',
        (tester) async {
      final inProgressReq = ParkingRequest(
        id: 'r1',
        requestNumber: 'PR-20261113-000001',
        requestType: 'PARK',
        status: 'IN_PROGRESS',
        source: 'MOBILE',
        vehicleId: 'v1',
        plateNumber: 'KSA-9999',
        steps: const [
          RequestStep(key: 'CREATED', status: 'DONE'),
          RequestStep(key: 'VALIDATED', status: 'DONE'),
          RequestStep(key: 'APPROVED', status: 'DONE'),
          RequestStep(key: 'COMMAND_SENT', status: 'DONE'),
          RequestStep(key: 'CONTROLLER_CONFIRMED', status: 'DONE'),
          RequestStep(key: 'VEHICLE_MOVING', status: 'DONE'),
          // Even if a faulty payload claims DONE while status is IN_PROGRESS,
          // effectiveStepStatus MUST downgrade it to ACTIVE!
          RequestStep(key: 'PARKING_COMPLETED', status: 'DONE'),
        ],
        createdAt: DateTime.now(),
      );

      expect(
        RequestStepTimeline.effectiveStepStatus(
          request: inProgressReq,
          stepKey: 'PARKING_COMPLETED',
          rawStatus: 'DONE',
        ),
        equals('ACTIVE'),
      );

      final completedReq = ParkingRequest(
        id: 'r1',
        requestNumber: 'PR-20261113-000001',
        requestType: 'PARK',
        status: 'COMPLETED',
        source: 'MOBILE',
        vehicleId: 'v1',
        plateNumber: 'KSA-9999',
        steps: const [
          RequestStep(key: 'PARKING_COMPLETED', status: 'DONE'),
        ],
        createdAt: DateTime.now(),
      );

      expect(
        RequestStepTimeline.effectiveStepStatus(
          request: completedReq,
          stepKey: 'PARKING_COMPLETED',
          rawStatus: 'DONE',
        ),
        equals('DONE'),
      );
    });

    testWidgets(
        'Park & Retrieve buttons are disabled when controller is OFFLINE',
        (tester) async {
      final offlineSys = SystemStatus.offlineFallback('Controller link lost');
      const user = User(
        id: 'u1',
        fullName: 'Operator',
        username: 'operator',
        email: 'op@autopark.local',
        phone: null,
        role: 'OPERATOR',
        permissions: [Permission.dashboardView, Permission.parkingRequest],
        status: 'ACTIVE',
        language: 'en',
      );
      final dash = DashboardSummary(
        system: offlineSys,
        totals: const SpaceTotals(
          total: 24,
          available: 18,
          occupied: 6,
          reserved: 0,
          moving: 0,
          blocked: 0,
          maintenance: 0,
          error: 0,
        ),
        activeAlarms: 1,
        criticalAlarms: 0,
        activeRequests: 0,
        health: 40,
        levels: const [1, 2],
        zones: const ['A', 'B'],
      );

      await tester.pumpWidget(
        _wrapWithL10n(
          DashboardScreen(
            onNavigateTab: (_, {subTab}) {},
            onOpenMonitoring: () {},
            onOpenNotifications: () {},
          ),
          appState: AppState(
            isBootstrapping: false,
            user: user,
            dashboard: dash,
            systemStatus: offlineSys,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, -400));
      await tester.pumpAndSettle();

      final parkBtn = tester.widget<ButtonStyleButton>(
        find.byKey(const Key('dashboard_park_button')),
      );
      final retrieveBtn = tester.widget<ButtonStyleButton>(
        find.byKey(const Key('dashboard_retrieve_button')),
      );
      expect(parkBtn.onPressed, isNull);
      expect(retrieveBtn.onPressed, isNull);
    });
  });
}

import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';

import '../config/app_config.dart';
import '../models/models.dart';
import '../network/api_client.dart';
import '../notifications/local_notification_service.dart';
import '../realtime/realtime_service.dart';
import '../storage/preferences_storage.dart';
import '../storage/token_storage.dart';

class AppState {
  const AppState({
    this.isBootstrapping = true,
    this.locale = const Locale('en'),
    this.themeMode = ThemeMode.dark,
    this.serverHost = 'http://46.185.128.165:3000',
    this.deviceId = '',
    this.deviceMac = '',
    this.user,
    this.biometricEnabled = false,
    this.hasPersistedSession = false,
    this.rememberMe = true,
    this.networkOnline = true,
    this.backendReachable = true,
    this.socketConnected = false,
    this.dashboard,
    this.systemStatus,
    this.activeRequests = const [],
    this.spaces = const [],
    this.vehicles = const [],
    this.alarms = const [],
    this.notifications = const [],
  });

  final bool isBootstrapping;
  final Locale locale;
  final ThemeMode themeMode;
  final String serverHost;
  final String deviceId;
  final String deviceMac;
  final User? user;
  final bool biometricEnabled;
  final bool hasPersistedSession;
  final bool rememberMe;
  final bool networkOnline;
  final bool backendReachable;
  final bool socketConnected;
  final DashboardSummary? dashboard;
  final SystemStatus? systemStatus;
  final List<ParkingRequest> activeRequests;
  final List<ParkingSpace> spaces;
  final List<Vehicle> vehicles;
  final List<Alarm> alarms;
  final List<AppNotification> notifications;

  bool get isAuthenticated => user != null;

  int get unreadNotificationsCount =>
      notifications.where((n) => !n.read).length;

  int get activeAlarmsCount =>
      alarms.where((a) => a.status != 'RESOLVED').length;

  /// True only when network, backend, and industrial controller are all live
  /// and safe for command dispatch.
  bool get canDispatchCommands =>
      networkOnline &&
      backendReachable &&
      (systemStatus?.canAcceptCommands ?? false);

  AppState copyWith({
    bool? isBootstrapping,
    Locale? locale,
    ThemeMode? themeMode,
    String? serverHost,
    String? deviceId,
    String? deviceMac,
    User? user,
    bool clearUser = false,
    bool? biometricEnabled,
    bool? hasPersistedSession,
    bool? rememberMe,
    bool? networkOnline,
    bool? backendReachable,
    bool? socketConnected,
    DashboardSummary? dashboard,
    SystemStatus? systemStatus,
    List<ParkingRequest>? activeRequests,
    List<ParkingSpace>? spaces,
    List<Vehicle>? vehicles,
    List<Alarm>? alarms,
    List<AppNotification>? notifications,
  }) =>
      AppState(
        isBootstrapping: isBootstrapping ?? this.isBootstrapping,
        locale: locale ?? this.locale,
        themeMode: themeMode ?? this.themeMode,
        serverHost: serverHost ?? this.serverHost,
        deviceId: deviceId ?? this.deviceId,
        deviceMac: deviceMac ?? this.deviceMac,
        user: clearUser ? null : (user ?? this.user),
        biometricEnabled: biometricEnabled ?? this.biometricEnabled,
        hasPersistedSession: hasPersistedSession ?? this.hasPersistedSession,
        rememberMe: rememberMe ?? this.rememberMe,
        networkOnline: networkOnline ?? this.networkOnline,
        backendReachable: backendReachable ?? this.backendReachable,
        socketConnected: socketConnected ?? this.socketConnected,
        dashboard: dashboard ?? this.dashboard,
        systemStatus: systemStatus ?? this.systemStatus,
        activeRequests: activeRequests ?? this.activeRequests,
        spaces: spaces ?? this.spaces,
        vehicles: vehicles ?? this.vehicles,
        alarms: alarms ?? this.alarms,
        notifications: notifications ?? this.notifications,
      );
}

class AppController extends StateNotifier<AppState> {
  AppController({
    PreferencesStorage? preferences,
    TokenStorage? tokenStorage,
    RealtimeService? realtimeService,
    bool autoBootstrap = true,
  })  : _prefs = preferences ?? PreferencesStorage(),
        _tokenStorage = tokenStorage ?? SecureTokenStorage(),
        _realtime = realtimeService ?? RealtimeService(),
        super(AppState(serverHost: AppConfig.defaultHost)) {
    _api = ApiClient(
      tokenStorage: _tokenStorage,
      initialHost: state.serverHost,
      onSessionExpired: _handleSessionExpired,
      onBackendReachabilityChanged: (reachable) {
        if (mounted && state.backendReachable != reachable) {
          state = state.copyWith(backendReachable: reachable);
        }
      },
    );
    _bindRealtimeStreams();
    if (autoBootstrap) {
      bootstrap();
    }
  }

  final PreferencesStorage _prefs;
  final TokenStorage _tokenStorage;
  final RealtimeService _realtime;
  late final ApiClient _api;
  StreamSubscription<List<ConnectivityResult>>? _connSub;
  final List<StreamSubscription<dynamic>> _rtSubs = [];
  Timer? _autoRefreshTimer;

  ApiClient get api => _api;

  Future<void> bootstrap() async {
    try {
      await LocalNotificationService.instance.init();
      final locale = await _prefs.getLocale();
      final themeMode = await _prefs.getThemeMode();
      final host = await _prefs.getServerHost();
      final bio = await _prefs.getBiometricEnabled();
      final remember = await _prefs.getRememberMe();
      final hasPersisted = await _tokenStorage.hasPersistedSession();
      final devId = await _prefs.getOrCreateDeviceId();
      final devMac = await _prefs.getDeviceMac();

      _api.updateHost(host);
      _api.updateDeviceIdentity(deviceId: devId, deviceMac: devMac);
      state = state.copyWith(
        locale: locale,
        themeMode: themeMode,
        serverHost: host,
        deviceId: devId,
        deviceMac: devMac,
        biometricEnabled: bio,
        rememberMe: remember,
        hasPersistedSession: hasPersisted,
      );

      _listenConnectivity();
      _startAutoRefreshTimer();

      // If biometric unlock is not required immediately and a valid token exists,
      // restore the session automatically.
      final stored = await _tokenStorage.read();
      if (stored != null && !bio) {
        await restoreSession();
      }
    } catch (_) {
      // Safe fallback
    } finally {
      if (mounted) {
        state = state.copyWith(isBootstrapping: false);
      }
    }
  }

  void _startAutoRefreshTimer() {
    _autoRefreshTimer?.cancel();
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted && state.isAuthenticated && state.networkOnline) {
        refreshAllData();
      }
    });
  }

  void _listenConnectivity() {
    try {
      _connSub?.cancel();
      _connSub = Connectivity().onConnectivityChanged.listen((results) {
        final online = results.any((r) => r != ConnectivityResult.none);
        if (mounted) {
          state = state.copyWith(networkOnline: online);
          if (online && state.isAuthenticated) {
            refreshAllData();
          }
        }
      });
    } catch (_) {}
  }

  void _bindRealtimeStreams() {
    for (final s in _rtSubs) {
      s.cancel();
    }
    _rtSubs.clear();

    _rtSubs.add(
      _realtime.connectedStream.listen((connected) {
        if (mounted) {
          state = state.copyWith(socketConnected: connected);
        }
      }),
    );

    _rtSubs.add(
      _realtime.systemStatusStream.listen((sys) {
        if (!mounted) return;
        state = state.copyWith(
          systemStatus: sys,
          backendReachable: true,
          dashboard: state.dashboard?.copyWith(system: sys, isCached: false),
        );
      }),
    );

    _rtSubs.add(
      _realtime.requestStream.listen((req) {
        if (!mounted) return;
        final list = [...state.activeRequests];
        final idx = list.indexWhere((r) => r.id == req.id);
        if (idx >= 0) {
          list[idx] = req;
        } else {
          list.insert(0, req);
        }
        state = state.copyWith(activeRequests: list);
        refreshDashboardSilent();
        refreshVehiclesSilent();
      }),
    );

    _rtSubs.add(
      _realtime.spaceUpdatedStream.listen((space) {
        if (!mounted) return;
        final list = [...state.spaces];
        final idx = list.indexWhere((s) => s.id == space.id);
        if (idx >= 0) {
          list[idx] = space;
        } else {
          list.add(space);
        }
        state = state.copyWith(spaces: list);
        refreshDashboardSilent();
      }),
    );

    _rtSubs.add(
      _realtime.alarmStream.listen((alarm) {
        if (!mounted) return;
        final list = [...state.alarms];
        final idx = list.indexWhere((a) => a.id == alarm.id);
        final isNew = idx < 0;
        if (idx >= 0) {
          list[idx] = alarm;
        } else {
          list.insert(0, alarm);
        }
        state = state.copyWith(alarms: list);
        if (isNew && alarm.isActive) {
          LocalNotificationService.instance.showAlarmAlert(alarm);
        }
        refreshDashboardSilent();
      }),
    );

    _rtSubs.add(
      _realtime.notificationStream.listen((notif) {
        if (!mounted) return;
        final list = [
          notif,
          ...state.notifications.where((n) => n.id != notif.id),
        ];
        state = state.copyWith(notifications: list);
        LocalNotificationService.instance.showAppNotification(notif);
      }),
    );
  }

  Future<void> setLocale(Locale locale) async {
    state = state.copyWith(locale: locale);
    await _prefs.setLocale(locale);
    if (state.isAuthenticated) {
      try {
        await _api.updateMe(language: locale.languageCode);
      } catch (_) {}
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = state.copyWith(themeMode: mode);
    await _prefs.setThemeMode(mode);
  }

  Future<void> setServerHost(String host) async {
    final normalized = AppConfig.normalizeHost(host);
    _api.updateHost(normalized);
    await _prefs.setServerHost(normalized);
    state = state.copyWith(serverHost: normalized);
    if (state.isAuthenticated) {
      await _connectRealtime();
      await refreshAllData();
    }
  }

  Future<void> resetServerHost() async {
    await _prefs.resetServerHost();
    final def = AppConfig.defaultHost;
    _api.updateHost(def);
    state = state.copyWith(serverHost: def);
  }

  Future<void> setDeviceMac(String mac) async {
    final norm = mac.trim().toUpperCase();
    await _prefs.setDeviceMac(norm);
    _api.updateDeviceIdentity(deviceMac: norm);
    state = state.copyWith(deviceMac: norm);
  }

  Future<void> setBiometricEnabled(bool enabled) async {
    await _prefs.setBiometricEnabled(enabled);
    state = state.copyWith(biometricEnabled: enabled);
  }

  Future<void> login({
    required String username,
    required String password,
    required bool rememberMe,
  }) async {
    await _prefs.setRememberMe(rememberMe);
    final (user, _) = await _api.login(
      username: username,
      password: password,
      rememberMe: rememberMe,
    );
    await _prefs.cacheUser(user);
    final hasPersisted = await _tokenStorage.hasPersistedSession();
    state = state.copyWith(
      user: user,
      rememberMe: rememberMe,
      hasPersistedSession: hasPersisted,
      backendReachable: true,
    );
    await _connectRealtime();
    await refreshAllData();
  }

  Future<bool> loginWithBiometrics({required String localizedReason}) async {
    final auth = LocalAuthentication();
    final canCheck =
        await auth.canCheckBiometrics || await auth.isDeviceSupported();
    if (!canCheck) return false;
    final didAuth = await auth.authenticate(
      localizedReason: localizedReason,
      options: const AuthenticationOptions(biometricOnly: false),
    );
    if (!didAuth) return false;
    return restoreSession();
  }

  Future<bool> restoreSession() async {
    try {
      final tokens = await _tokenStorage.read();
      if (tokens == null) return false;
      final user = await _api.getMe();
      await _prefs.cacheUser(user);
      state = state.copyWith(
        user: user,
        backendReachable: true,
        hasPersistedSession: await _tokenStorage.hasPersistedSession(),
      );
      await _connectRealtime();
      await refreshAllData();
      return true;
    } catch (_) {
      final cachedUser = await _prefs.getCachedUser();
      final cachedDash = await _prefs.getCachedDashboard();
      final cachedSpaces = await _prefs.getCachedSpaces();
      final cachedVehicles = await _prefs.getCachedVehicles();
      if (cachedUser != null) {
        state = state.copyWith(
          user: cachedUser,
          backendReachable: false,
          dashboard: cachedDash,
          systemStatus: cachedDash?.system ?? SystemStatus.offlineFallback(),
          spaces: cachedSpaces,
          vehicles: cachedVehicles,
        );
        return true;
      }
      return false;
    }
  }

  Future<void> _connectRealtime() async {
    final tokens = await _tokenStorage.read();
    if (tokens == null) return;
    _realtime.connect(
      host: state.serverHost,
      accessToken: tokens.accessToken,
      onTokenExpired: () async {
        final next = await _api.refreshTokensSingleFlight();
        return next?.accessToken;
      },
    );
  }

  Future<void> refreshAllData() async {
    if (!state.isAuthenticated) return;
    await Future.wait([
      refreshDashboardSilent(),
      refreshActiveRequestsSilent(),
      refreshSpacesSilent(),
      refreshVehiclesSilent(),
      if (state.user!.canViewAlarms) refreshAlarmsSilent(),
      refreshNotificationsSilent(),
    ]);
  }

  Future<void> refreshDashboardSilent() async {
    try {
      final dash = await _api.getDashboard();
      await _prefs.cacheDashboard(dash);
      if (mounted) {
        state = state.copyWith(
          dashboard: dash,
          systemStatus: dash.system,
          backendReachable: true,
        );
      }
    } catch (_) {
      final cached = await _prefs.getCachedDashboard();
      if (mounted && cached != null && state.dashboard == null) {
        state = state.copyWith(
          dashboard: cached,
          systemStatus: cached.system,
          backendReachable: false,
        );
      }
    }
  }

  Future<void> refreshActiveRequestsSilent() async {
    try {
      final page = await _api.getRequests(active: true, limit: 25);
      if (mounted) {
        state = state.copyWith(activeRequests: page.items);
      }
    } catch (_) {}
  }

  Future<void> refreshSpacesSilent() async {
    try {
      final spaces = await _api.getSpaces();
      await _prefs.cacheSpaces(spaces);
      if (mounted) {
        state = state.copyWith(spaces: spaces);
      }
    } catch (_) {
      final cached = await _prefs.getCachedSpaces();
      if (mounted && cached.isNotEmpty && state.spaces.isEmpty) {
        state = state.copyWith(spaces: cached);
      }
    }
  }

  Future<void> refreshVehiclesSilent() async {
    try {
      final vehicles = await _api.getVehicles();
      await _prefs.cacheVehicles(vehicles);
      if (mounted) {
        state = state.copyWith(vehicles: vehicles);
      }
    } catch (_) {
      final cached = await _prefs.getCachedVehicles();
      if (mounted && cached.isNotEmpty && state.vehicles.isEmpty) {
        state = state.copyWith(vehicles: cached);
      }
    }
  }

  Future<void> refreshAlarmsSilent() async {
    try {
      final res = await _api.getAlarms(limit: 50);
      if (mounted) {
        state = state.copyWith(alarms: res.items);
      }
    } catch (_) {}
  }

  Future<void> refreshNotificationsSilent() async {
    try {
      final res = await _api.getNotifications();
      if (mounted) {
        state = state.copyWith(notifications: res.items);
      }
    } catch (_) {}
  }

  void upsertRequest(ParkingRequest request) {
    final list = [...state.activeRequests];
    final idx = list.indexWhere((r) => r.id == request.id);
    if (idx >= 0) {
      list[idx] = request;
    } else {
      list.insert(0, request);
    }
    state = state.copyWith(activeRequests: list);
  }

  void updateUser(User user) {
    state = state.copyWith(user: user);
    _prefs.cacheUser(user);
  }

  Future<Map<String, dynamic>> fetchLiveSensors() => _api.getLiveSensors();

  Future<Map<String, dynamic>> executeEmergencyRecovery(String action) async {
    final res = await _api.executeEmergencyRecovery(action);
    await refreshDashboardSilent();
    return res;
  }

  Future<void> logout() async {
    _realtime.disconnect();
    await _api.logout();
    await _prefs.clearSessionCache();
    if (mounted) {
      state = state.copyWith(
        clearUser: true,
        hasPersistedSession: false,
        activeRequests: const [],
        alarms: const [],
        notifications: const [],
      );
    }
  }

  void _handleSessionExpired() {
    _realtime.disconnect();
    if (mounted) {
      state = state.copyWith(clearUser: true);
    }
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    _connSub?.cancel();
    for (final s in _rtSubs) {
      s.cancel();
    }
    _realtime.dispose();
    super.dispose();
  }
}

final appControllerProvider =
    StateNotifierProvider<AppController, AppState>((ref) {
  return AppController();
});

import 'dart:async';

import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../models/models.dart';
import '../storage/token_storage.dart';
import 'api_error.dart';

class ApiClient {
  ApiClient({
    required TokenStorage tokenStorage,
    required String initialHost,
    this.onSessionExpired,
    this.onBackendReachabilityChanged,
  })  : _tokenStorage = tokenStorage,
        _host = AppConfig.normalizeHost(initialHost) {
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl(_host),
        connectTimeout: AppConfig.connectTimeout,
        receiveTimeout: AppConfig.receiveTimeout,
        headers: const {'Content-Type': 'application/json'},
      ),
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          options.headers['X-Client-Type'] = 'mobile';
          if (_deviceId.isNotEmpty) {
            options.headers['X-Device-Id'] = _deviceId;
          }
          if (_deviceMac.isNotEmpty) {
            options.headers['X-Device-Mac'] = _deviceMac;
          }
          final path = options.path;
          final isPublic = path.endsWith('/auth/login') ||
              path.endsWith('/auth/refresh') ||
              path.endsWith('/health');
          if (!isPublic) {
            final tokens = await _tokenStorage.read();
            if (tokens != null && tokens.accessToken.isNotEmpty) {
              options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
            }
          }
          handler.next(options);
        },
        onResponse: (response, handler) {
          onBackendReachabilityChanged?.call(true);
          handler.next(response);
        },
        onError: (err, handler) async {
          final isNet = err.type == DioExceptionType.connectionError ||
              err.type == DioExceptionType.connectionTimeout ||
              err.type == DioExceptionType.receiveTimeout;
          if (isNet) {
            onBackendReachabilityChanged?.call(false);
          }

          // Immediately kick out revoked / unauthorized mobile devices!
          final respData = err.response?.data;
          final errCode =
              respData is Map<String, dynamic> ? respData['code']?.toString() : null;
          if (err.response?.statusCode == 403 &&
              (errCode == 'DEVICE_REVOKED' || errCode == 'DEVICE_NOT_AUTHORIZED')) {
            await _tokenStorage.clear();
            onSessionExpired?.call();
            return handler.next(err);
          }

          final req = err.requestOptions;
          final isAuthEndpoint = req.path.endsWith('/auth/login') ||
              req.path.endsWith('/auth/refresh');
          if (err.response?.statusCode == 401 &&
              !isAuthEndpoint &&
              req.extra['retried'] != true) {
            final refreshed = await refreshTokensSingleFlight();
            if (refreshed != null) {
              req.extra['retried'] = true;
              req.headers['Authorization'] = 'Bearer ${refreshed.accessToken}';
              try {
                final cloned = await _dio.fetch<dynamic>(req);
                return handler.resolve(cloned);
              } on DioException catch (retryErr) {
                return handler.next(retryErr);
              }
            } else {
              await _tokenStorage.clear();
              onSessionExpired?.call();
            }
          }
          handler.next(err);
        },
      ),
    );
  }

  final TokenStorage _tokenStorage;
  final void Function()? onSessionExpired;
  final void Function(bool reachable)? onBackendReachabilityChanged;
  late final Dio _dio;
  String _host;
  String _deviceId = '';
  String _deviceMac = '';
  Completer<StoredTokens?>? _refreshCompleter;

  String get host => _host;

  void updateDeviceIdentity({String? deviceId, String? deviceMac}) {
    if (deviceId != null) _deviceId = deviceId.trim().toUpperCase();
    if (deviceMac != null) _deviceMac = deviceMac.trim().toUpperCase();
  }

  void updateHost(String newHost) {
    _host = AppConfig.normalizeHost(newHost);
    _dio.options.baseUrl = AppConfig.apiBaseUrl(_host);
  }

  Future<StoredTokens?> refreshTokensSingleFlight() async {
    if (_refreshCompleter != null) {
      return _refreshCompleter!.future;
    }
    final completer = Completer<StoredTokens?>();
    _refreshCompleter = completer;
    try {
      final current = await _tokenStorage.read();
      if (current == null || current.refreshToken.isEmpty) {
        completer.complete(null);
        return null;
      }
      final resp = await _dio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': current.refreshToken},
      );
      final data = resp.data;
      if (data == null) {
        completer.complete(null);
        return null;
      }
      final nextTokens = StoredTokens.fromAuthResponse(data);
      await _tokenStorage.save(nextTokens);
      completer.complete(nextTokens);
      return nextTokens;
    } catch (_) {
      completer.complete(null);
      return null;
    } finally {
      _refreshCompleter = null;
    }
  }

  Future<T> _guard<T>(Future<T> Function() fn) async {
    try {
      return await fn();
    } on DioException catch (e) {
      throw ApiError.fromDio(e);
    }
  }

  // Health
  Future<Map<String, dynamic>> checkHealth([String? overrideHost]) => _guard(
        () async {
          if (overrideHost != null) {
            final tempDio = Dio(
              BaseOptions(
                baseUrl: AppConfig.apiBaseUrl(overrideHost),
                connectTimeout: const Duration(seconds: 6),
                receiveTimeout: const Duration(seconds: 6),
              ),
            );
            final r = await tempDio.get<Map<String, dynamic>>('/health');
            return r.data ?? const {};
          }
          final r = await _dio.get<Map<String, dynamic>>('/health');
          return r.data ?? const {};
        },
      );

  // Auth
  Future<(User, StoredTokens)> login({
    required String username,
    required String password,
    required bool rememberMe,
  }) =>
      _guard(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/auth/login',
          data: {
            'username': username.trim(),
            'password': password,
            if (_deviceId.isNotEmpty) 'deviceId': _deviceId,
            if (_deviceMac.isNotEmpty) 'macAddress': _deviceMac,
          },
        );
        final data = r.data!;
        final tokens = StoredTokens.fromAuthResponse(data);
        await _tokenStorage.save(tokens, persist: rememberMe);
        final user = User.fromJson(data['user'] as Map<String, dynamic>);
        return (user, tokens);
      });

  Future<void> logout() async {
    try {
      final tokens = await _tokenStorage.read();
      if (tokens != null) {
        await _dio.post<void>(
          '/auth/logout',
          data: {'refreshToken': tokens.refreshToken},
        );
      }
    } catch (_) {
      // Ignore network errors during logout
    } finally {
      await _tokenStorage.clear();
    }
  }

  Future<User> getMe() => _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>('/auth/me');
        return User.fromJson(r.data!);
      });

  Future<User> updateMe({
    String? fullName,
    String? email,
    String? phone,
    String? language,
  }) =>
      _guard(() async {
        final r = await _dio.put<Map<String, dynamic>>(
          '/auth/me',
          data: {
            if (fullName != null) 'fullName': fullName,
            if (email != null) 'email': email,
            if (phone != null) 'phone': phone,
            if (language != null) 'language': language,
          },
        );
        return User.fromJson(r.data!);
      });

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) =>
      _guard(() async {
        await _dio.post<void>(
          '/auth/change-password',
          data: {
            'currentPassword': currentPassword,
            'newPassword': newPassword,
          },
        );
      });

  Future<Map<String, dynamic>> getPreferences() => _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>('/auth/me/preferences');
        return r.data ?? const {};
      });

  Future<Map<String, dynamic>> updatePreferences(Map<String, dynamic> body) =>
      _guard(() async {
        final r = await _dio.put<Map<String, dynamic>>(
          '/auth/me/preferences',
          data: body,
        );
        return r.data ?? const {};
      });

  // Dashboard & System
  Future<DashboardSummary> getDashboard() => _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>('/dashboard');
        return DashboardSummary.fromJson(r.data!);
      });

  Future<SystemStatus> getSystemStatus() => _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>('/system/status');
        return SystemStatus.fromJson(r.data!);
      });

  // Parking & Retrieval
  Future<List<ParkingSpace>> getSpaces({
    int? level,
    String? zone,
    String? status,
  }) =>
      _guard(() async {
        final r = await _dio.get<List<dynamic>>(
          '/parking/spaces',
          queryParameters: {
            if (level != null) 'level': level,
            if (zone != null && zone.isNotEmpty) 'zone': zone,
            if (status != null && status.isNotEmpty) 'status': status,
          },
        );
        return (r.data ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ParkingSpace.fromJson)
            .toList();
      });

  Future<ParkingRequest> requestPark({
    String? vehicleId,
    String? plateNumber,
    bool? isOtherVehicle,
    String? targetSpaceNumber,
  }) =>
      _guard(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/parking/request',
          data: {
            if (vehicleId != null && vehicleId.isNotEmpty)
              'vehicleId': vehicleId,
            if (plateNumber != null && plateNumber.isNotEmpty)
              'plateNumber': plateNumber.trim().toUpperCase(),
            if (isOtherVehicle != null) 'isOtherVehicle': isOtherVehicle,
            if (targetSpaceNumber != null && targetSpaceNumber.isNotEmpty)
              'targetSpaceNumber': targetSpaceNumber.trim().toUpperCase(),
          },
        );
        return ParkingRequest.fromJson(r.data!);
      });

  Future<ParkingRequest> requestRetrieve({
    String? vehicleId,
    String? plateNumber,
    String? targetSpaceNumber,
  }) =>
      _guard(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/parking/retrieve',
          data: {
            if (vehicleId != null && vehicleId.isNotEmpty)
              'vehicleId': vehicleId,
            if (plateNumber != null && plateNumber.isNotEmpty)
              'plateNumber': plateNumber.trim().toUpperCase(),
            if (targetSpaceNumber != null && targetSpaceNumber.isNotEmpty)
              'targetSpaceNumber': targetSpaceNumber.trim().toUpperCase(),
          },
        );
        return ParkingRequest.fromJson(r.data!);
      });

  /// Returns the lift to its engineered Home / Standby position through the NestJS Backend FIFO queue.
  /// Enforces server-side RBAC, Emergency Stop, and Obstacle safety interlocks.
  Future<Map<String, dynamic>> returnLiftToHome() => _guard(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/industrial/s7/recovery',
          data: const {'action': 'RETURN_PARK'},
        );
        return r.data ?? const {'ok': true};
      });

  Future<Paginated<ParkingRequest>> getRequests({
    String? status,
    String? type,
    bool? active,
    int page = 1,
    int limit = 20,
  }) =>
      _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>(
          '/parking/requests',
          queryParameters: {
            if (status != null) 'status': status,
            if (type != null) 'type': type,
            if (active != null) 'active': active,
            'page': page,
            'limit': limit,
          },
        );
        return Paginated.fromJson(r.data!, ParkingRequest.fromJson);
      });

  Future<ParkingRequest> getRequestById(String id) => _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>('/parking/requests/$id');
        return ParkingRequest.fromJson(r.data!);
      });

  Future<ParkingRequest> cancelRequest(String id) => _guard(() async {
        final r = await _dio
            .post<Map<String, dynamic>>('/parking/requests/$id/cancel');
        return ParkingRequest.fromJson(r.data!);
      });

  // Vehicles
  Future<List<Vehicle>> getVehicles({String? q}) => _guard(() async {
        final r = await _dio.get<List<dynamic>>(
          '/vehicles',
          queryParameters: {
            if (q != null && q.isNotEmpty) 'q': q,
          },
        );
        return (r.data ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(Vehicle.fromJson)
            .toList();
      });

  Future<Vehicle> createVehicle({
    required String plateNumber,
    String? vehicleType,
    String? brand,
    String? model,
    String? color,
  }) =>
      _guard(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/vehicles',
          data: {
            'plateNumber': plateNumber.trim().toUpperCase(),
            if (vehicleType != null && vehicleType.isNotEmpty)
              'vehicleType': vehicleType,
            if (brand != null && brand.isNotEmpty) 'brand': brand,
            if (model != null && model.isNotEmpty) 'model': model,
            if (color != null && color.isNotEmpty) 'color': color,
          },
        );
        return Vehicle.fromJson(r.data!);
      });

  Future<Vehicle> updateVehicle(
    String id, {
    String? plateNumber,
    String? vehicleType,
    String? brand,
    String? model,
    String? color,
  }) =>
      _guard(() async {
        final r = await _dio.put<Map<String, dynamic>>(
          '/vehicles/$id',
          data: {
            if (plateNumber != null)
              'plateNumber': plateNumber.trim().toUpperCase(),
            if (vehicleType != null) 'vehicleType': vehicleType,
            if (brand != null) 'brand': brand,
            if (model != null) 'model': model,
            if (color != null) 'color': color,
          },
        );
        return Vehicle.fromJson(r.data!);
      });

  Future<void> deleteVehicle(String id) => _guard(() async {
        await _dio.delete<void>('/vehicles/$id');
      });

  Future<List<ParkingRequest>> getVehicleHistory(String id) => _guard(() async {
        final r = await _dio.get<List<dynamic>>('/vehicles/$id/history');
        return (r.data ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ParkingRequest.fromJson)
            .toList();
      });

  // Alarms
  Future<Paginated<Alarm>> getAlarms({
    String? status,
    String? severity,
    int page = 1,
    int limit = 50,
  }) =>
      _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>(
          '/alarms',
          queryParameters: {
            if (status != null && status.isNotEmpty) 'status': status,
            if (severity != null && severity.isNotEmpty) 'severity': severity,
            'page': page,
            'limit': limit,
          },
        );
        return Paginated.fromJson(r.data!, Alarm.fromJson);
      });

  Future<Alarm> acknowledgeAlarm(String id, {String? note}) => _guard(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/alarms/$id/acknowledge',
          data: {
            if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
          },
        );
        return Alarm.fromJson(r.data!);
      });

  // History
  Future<Paginated<HistoryItem>> getHistory({
    String? kind,
    String? q,
    DateTime? from,
    DateTime? to,
    int page = 1,
    int limit = 50,
  }) =>
      _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>(
          '/history',
          queryParameters: {
            if (kind != null && kind.isNotEmpty) 'kind': kind,
            if (q != null && q.isNotEmpty) 'q': q,
            if (from != null) 'from': from.toUtc().toIso8601String(),
            if (to != null) 'to': to.toUtc().toIso8601String(),
            'page': page,
            'limit': limit,
          },
        );
        return Paginated.fromJson(r.data!, HistoryItem.fromJson);
      });

  Future<String> exportHistoryCsv({
    String? kind,
    String? q,
    DateTime? from,
    DateTime? to,
  }) =>
      _guard(() async {
        final r = await _dio.get<String>(
          '/history/export',
          queryParameters: {
            if (kind != null && kind.isNotEmpty) 'kind': kind,
            if (q != null && q.isNotEmpty) 'q': q,
            if (from != null) 'from': from.toUtc().toIso8601String(),
            if (to != null) 'to': to.toUtc().toIso8601String(),
            'format': 'csv',
          },
          options: Options(responseType: ResponseType.plain),
        );
        return r.data ?? '';
      });

  // Notifications
  Future<Paginated<AppNotification>> getNotifications({bool? unread}) =>
      _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>(
          '/notifications',
          queryParameters: {
            if (unread != null) 'unread': unread,
            'limit': 50,
          },
        );
        return Paginated.fromJson(r.data!, AppNotification.fromJson);
      });

  Future<void> markNotificationRead(String id) => _guard(() async {
        await _dio.post<void>('/notifications/$id/read');
      });

  Future<void> markAllNotificationsRead() => _guard(() async {
        await _dio.post<void>('/notifications/read-all');
      });

  // Industrial Config
  Future<IndustrialConfig> getIndustrialConfig() => _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>('/industrial/config');
        return IndustrialConfig.fromJson(r.data!);
      });

  Future<IndustrialConfig> updateIndustrialConfig(
    Map<String, dynamic> payload,
  ) =>
      _guard(() async {
        final r = await _dio.put<Map<String, dynamic>>(
          '/industrial/config',
          data: payload,
        );
        return IndustrialConfig.fromJson(r.data!);
      });

  Future<Map<String, dynamic>> testIndustrialConfig(
    Map<String, dynamic> payload,
  ) =>
      _guard(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/industrial/config/test',
          data: payload,
        );
        return r.data ?? const {};
      });

  // Simulation
  Future<Map<String, dynamic>> getSimulationState() => _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>('/simulation/state');
        return r.data ?? const {};
      });

  Future<Map<String, dynamic>> triggerSimulationScenario(String scenario) =>
      _guard(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/simulation/scenario',
          data: {'scenario': scenario},
        );
        return r.data ?? const {};
      });

  // Live S7-1200 Sensors & Safe Emergency Recovery
  Future<Map<String, dynamic>> getLiveSensors() => _guard(() async {
        final r = await _dio.get<Map<String, dynamic>>('/industrial/s7/sensors');
        return r.data ?? const {};
      });

  Future<Map<String, dynamic>> executeEmergencyRecovery(String action) =>
      _guard(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/industrial/s7/recovery',
          data: {'action': action},
        );
        return r.data ?? const {};
      });
}

import 'package:dio/dio.dart';

import '../../l10n/generated/app_localizations.dart';

class ApiError implements Exception {
  const ApiError({
    required this.message,
    this.statusCode,
    this.code,
    this.isNetworkError = false,
  });

  final String message;
  final int? statusCode;
  final String? code;
  final bool isNetworkError;

  factory ApiError.fromDio(DioException err) {
    final status = err.response?.statusCode;
    final data = err.response?.data;
    if (data is Map<String, dynamic>) {
      final rawMsg = data['message'];
      final msg = rawMsg is List
          ? rawMsg.map((e) => e.toString()).join(', ')
          : (rawMsg?.toString() ?? data['error']?.toString() ?? 'Error');
      final code = data['code']?.toString();
      return ApiError(
        message: msg,
        statusCode: status,
        code: code,
      );
    }
    final isNet = err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.sendTimeout ||
        err.type == DioExceptionType.connectionError;
    return ApiError(
      message: err.message ?? 'Network error',
      statusCode: status,
      isNetworkError: isNet,
    );
  }

  String localizedMessage(AppLocalizations l10n) {
    switch (code) {
      case 'SYSTEM_OFFLINE':
        return l10n.errSystemOffline;
      case 'SYSTEM_NOT_READY':
        return l10n.errSystemNotReady;
      case 'EMERGENCY_STOP_ACTIVE':
        return l10n.errEmergencyStop;
      case 'SAFETY_INTERLOCK':
        return l10n.errSafetyInterlock;
      case 'CRITICAL_ALARM_ACTIVE':
        return l10n.errCriticalAlarm;
      case 'MACHINE_BUSY':
        return l10n.errMachineBusy;
      case 'DUPLICATE_REQUEST':
        return l10n.errDuplicateRequest;
      case 'VEHICLE_ALREADY_PARKED':
        return l10n.errVehicleAlreadyParked;
      case 'VEHICLE_NOT_PARKED':
        return l10n.errVehicleNotParked;
      case 'NO_SPACE_AVAILABLE':
        return l10n.errNoSpaceAvailable;
      case 'VEHICLE_NOT_FOUND':
        return l10n.errVehicleNotFound;
      case 'FORBIDDEN_VEHICLE':
        return l10n.errForbiddenVehicle;
      case 'COMMAND_ALREADY_SENT':
        return l10n.errCommandAlreadySent;
    }
    if (statusCode == 423) return l10n.errAccountLocked;
    if (statusCode == 401) return l10n.errInvalidCredentials;
    if (message.isNotEmpty && !isNetworkError) return message;
    return l10n.errGeneric;
  }

  @override
  String toString() => 'ApiError($statusCode, $code, $message)';
}

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
    final isAr = l10n.localeName.startsWith('ar');
    switch (code) {
      case 'DEVICE_NOT_AUTHORIZED':
        return isAr
            ? 'عنوان MAC الخاص بجهازك غير متوافق مع قاعدة البيانات أو غير مسجّل للموظفين المصرّح لهم. يرجى التواصل مع مدير النظام لتسجيل جهازك.'
            : 'Your device MAC address does not match any authorized device in the database. Please contact the system administrator.';
      case 'DEVICE_USER_MISMATCH':
        return isAr
            ? 'عنوان MAC الخاص بجهازك غير متوافق مع هذا الحساب (الهاتف مسجّل باسم موظف آخر).'
            : 'Your device MAC address does not match this account (registered to another employee).';
      case 'DEVICE_REVOKED':
        return isAr
            ? 'تم إلغاء صلاحية هذا الهاتف من التحكم بالنظام من قبل الإدارة.'
            : 'Access for this device has been revoked by administration.';
      case 'DEVICE_CONTROL_DISABLED':
        return isAr
            ? 'هذا الجهاز غير مصرّح له بتحريك المواقف.'
            : 'Control permission is disabled for this device.';
      case 'ONLY_EMPLOYEES_ALLOWED':
        return isAr
            ? 'الدخول عبر التطبيق مقتصر على الموظفين المعرّفين في النظام فقط.'
            : 'Access denied: Mobile app sign-in is restricted to registered employees only.';
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

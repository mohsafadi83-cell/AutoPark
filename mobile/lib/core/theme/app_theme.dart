import 'package:flutter/material.dart';

import '../models/models.dart';

class AppColors {
  AppColors._();

  // Industrial Smart-City Palette
  static const Color bgDark = Color(0xFF0A101D);
  static const Color surfaceDark = Color(0xFF111A2E);
  static const Color cardDark = Color(0xFF16223A);
  static const Color borderDark = Color(0xFF233554);

  static const Color bgLight = Color(0xFFF3F6FB);
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color cardLight = Color(0xFFFFFFFF);
  static const Color borderLight = Color(0xFFD8E1EE);

  static const Color primaryCyan = Color(0xFF00B4D8);
  static const Color accentBlue = Color(0xFF2563EB);

  // High-contrast industrial status colors (always paired with Icon + Text)
  static const Color statusOnline = Color(0xFF10B981);
  static const Color statusWarning = Color(0xFFF59E0B);
  static const Color statusError = Color(0xFFEF4444);
  static const Color statusOffline = Color(0xFF64748B);
  static const Color statusMoving = Color(0xFF06B6D4);
  static const Color statusReserved = Color(0xFF8B5CF6);

  static Color forSystemState(SystemState state) {
    switch (state) {
      case SystemState.online:
        return statusOnline;
      case SystemState.warning:
        return statusWarning;
      case SystemState.error:
        return statusError;
      case SystemState.offline:
        return statusOffline;
    }
  }

  static IconData iconForSystemState(SystemState state) {
    switch (state) {
      case SystemState.online:
        return Icons.check_circle_rounded;
      case SystemState.warning:
        return Icons.warning_amber_rounded;
      case SystemState.error:
        return Icons.error_rounded;
      case SystemState.offline:
        return Icons.cloud_off_rounded;
    }
  }

  static Color forAlarmSeverity(AlarmSeverity severity) {
    switch (severity) {
      case AlarmSeverity.info:
        return primaryCyan;
      case AlarmSeverity.warning:
        return statusWarning;
      case AlarmSeverity.critical:
        return statusError;
      case AlarmSeverity.emergency:
        return const Color(0xFFDC2626);
    }
  }

  static IconData iconForAlarmSeverity(AlarmSeverity severity) {
    switch (severity) {
      case AlarmSeverity.info:
        return Icons.info_outline_rounded;
      case AlarmSeverity.warning:
        return Icons.warning_amber_rounded;
      case AlarmSeverity.critical:
        return Icons.gpp_bad_rounded;
      case AlarmSeverity.emergency:
        return Icons.emergency_rounded;
    }
  }

  static Color forSpaceStatus(SpaceStatus status) {
    switch (status) {
      case SpaceStatus.available:
        return statusOnline;
      case SpaceStatus.occupied:
        return accentBlue;
      case SpaceStatus.reserved:
        return statusReserved;
      case SpaceStatus.moving:
        return statusMoving;
      case SpaceStatus.blocked:
        return statusOffline;
      case SpaceStatus.maintenance:
        return statusWarning;
      case SpaceStatus.error:
        return statusError;
    }
  }

  static IconData iconForSpaceStatus(SpaceStatus status) {
    switch (status) {
      case SpaceStatus.available:
        return Icons.check_circle_outline_rounded;
      case SpaceStatus.occupied:
        return Icons.directions_car_filled_rounded;
      case SpaceStatus.reserved:
        return Icons.bookmark_rounded;
      case SpaceStatus.moving:
        return Icons.sync_rounded;
      case SpaceStatus.blocked:
        return Icons.block_rounded;
      case SpaceStatus.maintenance:
        return Icons.build_circle_outlined;
      case SpaceStatus.error:
        return Icons.report_problem_rounded;
    }
  }
}

class AppTheme {
  AppTheme._();

  static ThemeData dark() {
    const scheme = ColorScheme.dark(
      primary: AppColors.primaryCyan,
      secondary: AppColors.accentBlue,
      surface: AppColors.surfaceDark,
      error: AppColors.statusError,
      onPrimary: Color(0xFF04131D),
      onSurface: Color(0xFFE6EDF7),
    );
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: 'Cairo',
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.bgDark,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surfaceDark,
        foregroundColor: Color(0xFFE6EDF7),
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardTheme(
        color: AppColors.cardDark,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.borderDark, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceDark,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderDark),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderDark),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primaryCyan, width: 1.8),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryCyan,
          foregroundColor: const Color(0xFF04131D),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          textStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontWeight: FontWeight.w700,
            fontSize: 15,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  static ThemeData light() {
    const scheme = ColorScheme.light(
      primary: Color(0xFF0284C7),
      secondary: AppColors.accentBlue,
      surface: AppColors.surfaceLight,
      error: AppColors.statusError,
      onPrimary: Colors.white,
      onSurface: Color(0xFF0F172A),
    );
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      fontFamily: 'Cairo',
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.bgLight,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surfaceLight,
        foregroundColor: Color(0xFF0F172A),
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardTheme(
        color: AppColors.cardLight,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.borderLight, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderLight),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderLight),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF0284C7), width: 1.8),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF0284C7),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          textStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontWeight: FontWeight.w700,
            fontSize: 15,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}

import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../models/models.dart';

class PreferencesStorage {
  PreferencesStorage([this._prefs]);

  SharedPreferences? _prefs;

  static const _kServerHost = 'pref_server_host_v1';
  static const _kLocaleCode = 'pref_locale_code_v1';
  static const _kThemeMode = 'pref_theme_mode_v1';
  static const _kBiometricEnabled = 'pref_biometric_enabled_v1';
  static const _kRememberMe = 'pref_remember_me_v1';
  static const _kCachedDashboard = 'cache_dashboard_v1';
  static const _kCachedSpaces = 'cache_spaces_v1';
  static const _kCachedVehicles = 'cache_vehicles_v1';
  static const _kCachedUser = 'cache_user_v1';
  static const _kDeviceId = 'pref_device_id_v1';
  static const _kDeviceMac = 'pref_device_mac_v1';

  Future<String> getOrCreateDeviceId() async {
    final p = await _instance();
    final existing = p.getString(_kDeviceId);
    if (existing != null && existing.length >= 8) return existing;
    final rng = Random.secure();
    String chunk() => List.generate(
          4,
          (_) => rng.nextInt(16).toRadixString(16).toUpperCase(),
        ).join();
    final created = 'AP-${chunk()}-${chunk()}-${chunk()}';
    await p.setString(_kDeviceId, created);
    return created;
  }

  Future<String> getDeviceMac() async {
    final p = await _instance();
    return p.getString(_kDeviceMac) ?? '';
  }

  Future<void> setDeviceMac(String mac) async {
    final p = await _instance();
    await p.setString(_kDeviceMac, mac.trim().toUpperCase());
  }

  Future<SharedPreferences> _instance() async =>
      _prefs ??= await SharedPreferences.getInstance();

  Future<String> getServerHost() async {
    final p = await _instance();
    final saved = p.getString(_kServerHost);
    if (saved != null && saved.isNotEmpty && AppConfig.isValidHost(saved)) {
      return AppConfig.normalizeHost(saved);
    }
    return AppConfig.defaultHost;
  }

  Future<void> setServerHost(String host) async {
    final p = await _instance();
    await p.setString(_kServerHost, AppConfig.normalizeHost(host));
  }

  Future<void> resetServerHost() async {
    final p = await _instance();
    await p.remove(_kServerHost);
  }

  Future<Locale> getLocale() async {
    final p = await _instance();
    final code = p.getString(_kLocaleCode) ?? 'en';
    return Locale(code == 'ar' ? 'ar' : 'en');
  }

  Future<void> setLocale(Locale locale) async {
    final p = await _instance();
    await p.setString(_kLocaleCode, locale.languageCode);
  }

  Future<ThemeMode> getThemeMode() async {
    final p = await _instance();
    final raw = p.getString(_kThemeMode) ?? 'dark';
    switch (raw) {
      case 'light':
        return ThemeMode.light;
      case 'system':
        return ThemeMode.system;
      default:
        return ThemeMode.dark;
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    final p = await _instance();
    await p.setString(_kThemeMode, mode.name);
  }

  Future<bool> getBiometricEnabled() async {
    final p = await _instance();
    return p.getBool(_kBiometricEnabled) ?? false;
  }

  Future<void> setBiometricEnabled(bool enabled) async {
    final p = await _instance();
    await p.setBool(_kBiometricEnabled, enabled);
  }

  Future<bool> getRememberMe() async {
    final p = await _instance();
    return p.getBool(_kRememberMe) ?? true;
  }

  Future<void> setRememberMe(bool remember) async {
    final p = await _instance();
    await p.setBool(_kRememberMe, remember);
  }

  // Safe read-only cache (never caches or queues control commands!)
  Future<void> cacheUser(User user) async {
    final p = await _instance();
    await p.setString(_kCachedUser, jsonEncode(user.toJson()));
  }

  Future<User?> getCachedUser() async {
    final p = await _instance();
    final raw = p.getString(_kCachedUser);
    if (raw == null) return null;
    try {
      return User.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> cacheDashboard(DashboardSummary summary) async {
    final p = await _instance();
    await p.setString(_kCachedDashboard, jsonEncode(summary.toJson()));
  }

  Future<DashboardSummary?> getCachedDashboard() async {
    final p = await _instance();
    final raw = p.getString(_kCachedDashboard);
    if (raw == null) return null;
    try {
      return DashboardSummary.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
        isCached: true,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> cacheSpaces(List<ParkingSpace> spaces) async {
    final p = await _instance();
    await p.setString(
      _kCachedSpaces,
      jsonEncode(spaces.map((s) => s.toJson()).toList()),
    );
  }

  Future<List<ParkingSpace>> getCachedSpaces() async {
    final p = await _instance();
    final raw = p.getString(_kCachedSpaces);
    if (raw == null) return const [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .whereType<Map<String, dynamic>>()
          .map(ParkingSpace.fromJson)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> cacheVehicles(List<Vehicle> vehicles) async {
    final p = await _instance();
    await p.setString(
      _kCachedVehicles,
      jsonEncode(vehicles.map((v) => v.toJson()).toList()),
    );
  }

  Future<List<Vehicle>> getCachedVehicles() async {
    final p = await _instance();
    final raw = p.getString(_kCachedVehicles);
    if (raw == null) return const [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .whereType<Map<String, dynamic>>()
          .map(Vehicle.fromJson)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> clearSessionCache() async {
    final p = await _instance();
    await p.remove(_kCachedUser);
  }
}

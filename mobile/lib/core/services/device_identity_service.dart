import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../storage/preferences_storage.dart';

class DeviceIdentity {
  const DeviceIdentity({
    required this.macAddress,
    required this.deviceId,
    this.deviceModel = '',
    this.source = 'device',
  });

  /// Read-only hardware MAC address (formatted AA:BB:CC:DD:EE:FF).
  final String macAddress;

  /// Unique hardware/device identifier.
  final String deviceId;

  final String deviceModel;
  final String source;
}

class DeviceIdentityService {
  static const _channel = MethodChannel('autopark/device_identity');

  /// Automatically reads the mobile phone's hardware MAC / Hardware ID (read-only).
  /// Never asks the user to manually type a MAC address.
  static Future<DeviceIdentity> resolve(PreferencesStorage prefs) async {
    final fallbackId = await prefs.getOrCreateDeviceId();

    if (!kIsWeb) {
      try {
        final raw = await _channel.invokeMapMethod<String, dynamic>(
          'getHardwareIdentity',
        );
        if (raw != null) {
          final hwMac = _formatMac(raw['macAddress']?.toString() ?? '');
          final hwId = (raw['deviceId']?.toString() ?? '').trim().toUpperCase();
          final model = (raw['deviceModel']?.toString() ?? '').trim();
          final source = (raw['source']?.toString() ?? 'hardware').trim();
          if (hwMac.isNotEmpty) {
            return DeviceIdentity(
              macAddress: hwMac,
              deviceId: hwId.isNotEmpty ? hwId : fallbackId,
              deviceModel: model,
              source: source,
            );
          }
        }
      } catch (_) {
        // Fallback cleanly on platforms without native channel (Web / iOS Safari PWA / tests)
      }
    }

    // Deterministic MAC format derived from persistent device ID (read-only)
    final derivedMac = _macFromDeviceId(fallbackId);
    return DeviceIdentity(
      macAddress: derivedMac,
      deviceId: fallbackId,
      deviceModel: kIsWeb ? 'Web / iOS PWA' : 'Mobile',
      source: kIsWeb ? 'web_pwa_id' : 'device_id',
    );
  }

  static String _formatMac(String raw) {
    final hex = raw.trim().toUpperCase().replaceAll(RegExp(r'[^0-9A-F]'), '');
    if (hex.length != 12) return '';
    return '${hex.substring(0, 2)}:${hex.substring(2, 4)}:${hex.substring(4, 6)}:'
        '${hex.substring(6, 8)}:${hex.substring(8, 10)}:${hex.substring(10, 12)}';
  }

  static String _macFromDeviceId(String id) {
    final hex = id.toUpperCase().replaceAll(RegExp(r'[^0-9A-F]'), '');
    final padded = hex.padRight(12, '0').substring(0, 12);
    return _formatMac(padded);
  }
}

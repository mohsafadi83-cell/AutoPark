import 'package:flutter/foundation.dart';

/// Resolves the backend base URL.
///
/// Priority:
/// 1. User override saved from the login screen ("Server" advanced field).
/// 2. `--dart-define=API_BASE_URL=http://host:3000` (with or without `/api/v1`).
/// 3. Platform default (Android emulator → 10.0.2.2, everything else → localhost).
class AppConfig {
  AppConfig._();

  static const String _defineBaseUrl =
      String.fromEnvironment('API_BASE_URL', defaultValue: '');

  static const String apiPrefix = '/api/v1';
  static const String realtimeNamespace = '/realtime';

  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 20);
  static const Duration healthPingInterval = Duration(seconds: 20);
  static const Duration statusPollInterval = Duration(seconds: 15);
  static const Duration requestPollInterval = Duration(seconds: 5);

  /// Platform default host (no `/api/v1`).
  static String get platformDefaultHost {
    if (kIsWeb) {
      final base = Uri.base;
      if (base.hasScheme && base.host.isNotEmpty) {
        if (base.port == 5174 || base.port == 5173) {
          return '${base.scheme}://${base.host}:3000';
        }
        return base.origin;
      }
      return 'http://localhost:3000';
    }
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://92.253.111.78:3000';
    }
    return 'http://92.253.111.78:3000';
  }

  /// Ordered fallback hosts automatically probed when login hits a network/timeout error
  /// (covers company LAN Wi-Fi and rotated public IPs seamlessly).
  static const List<String> fallbackHosts = <String>[
    'http://92.253.111.78:3000',
    'http://192.168.0.30:3000',
    'http://176.28.134.53:3000',
    'http://46.185.128.165:3000',
  ];

  /// The compile-time default host (dart-define or platform default).
  static String get defaultHost =>
      _defineBaseUrl.isNotEmpty ? normalizeHost(_defineBaseUrl) : platformDefaultHost;

  /// Strips trailing slashes and an optional `/api/v1` suffix so that the
  /// stored value always is just scheme://host:port.
  static String normalizeHost(String input) {
    var v = input.trim();
    while (v.endsWith('/')) {
      v = v.substring(0, v.length - 1);
    }
    if (v.endsWith(apiPrefix)) {
      v = v.substring(0, v.length - apiPrefix.length);
    }
    if (!v.startsWith('http://') && !v.startsWith('https://')) {
      v = 'http://$v';
    }
    return v;
  }

  static bool isValidHost(String input) {
    final uri = Uri.tryParse(normalizeHost(input));
    return uri != null && uri.hasScheme && uri.host.isNotEmpty;
  }

  static String apiBaseUrl(String host) => '${normalizeHost(host)}$apiPrefix';
}

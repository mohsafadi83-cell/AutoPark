import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persisted authentication tokens.
class StoredTokens {
  const StoredTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime expiresAt;

  bool get isAccessExpired =>
      DateTime.now().isAfter(expiresAt.subtract(const Duration(seconds: 30)));

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'expiresAt': expiresAt.toIso8601String(),
      };

  factory StoredTokens.fromJson(Map<String, dynamic> json) => StoredTokens(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresAt: DateTime.tryParse(json['expiresAt'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0),
      );

  factory StoredTokens.fromAuthResponse(Map<String, dynamic> json) {
    final expiresIn = (json['expiresIn'] as num?)?.toInt() ?? 900;
    return StoredTokens(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      expiresAt: DateTime.now().add(Duration(seconds: expiresIn)),
    );
  }
}

/// Abstraction over token persistence so the network layer can be tested
/// without platform channels.
abstract class TokenStorage {
  /// Tokens currently in use (memory first, then secure storage).
  Future<StoredTokens?> read();

  /// Saves tokens. When [persist] is false (user did not tick "remember me")
  /// tokens live in memory only and the session ends with the process.
  Future<void> save(StoredTokens tokens, {bool? persist});

  Future<void> clear();

  /// Whether a persisted session exists (used for biometric login).
  Future<bool> hasPersistedSession();
}

/// In-memory implementation (tests and "remember me" off).
class MemoryTokenStorage implements TokenStorage {
  StoredTokens? _tokens;

  @override
  Future<StoredTokens?> read() async => _tokens;

  @override
  Future<void> save(StoredTokens tokens, {bool? persist}) async =>
      _tokens = tokens;

  @override
  Future<void> clear() async => _tokens = null;

  @override
  Future<bool> hasPersistedSession() async => false;
}

/// flutter_secure_storage backed storage (Keychain / EncryptedSharedPreferences).
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  static const _key = 'auth_tokens_v1';
  final FlutterSecureStorage _storage;
  StoredTokens? _memory;
  bool _persist = true;

  @override
  Future<StoredTokens?> read() async {
    if (_memory != null) return _memory;
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return null;
      _memory = StoredTokens.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      _persist = true;
      return _memory;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> save(StoredTokens tokens, {bool? persist}) async {
    if (persist != null) _persist = persist;
    _memory = tokens;
    if (_persist) {
      await _storage.write(key: _key, value: jsonEncode(tokens.toJson()));
    } else {
      await _storage.delete(key: _key);
    }
  }

  @override
  Future<void> clear() async {
    _memory = null;
    await _storage.delete(key: _key);
  }

  @override
  Future<bool> hasPersistedSession() async {
    try {
      return await _storage.containsKey(key: _key);
    } catch (_) {
      return false;
    }
  }

  /// Drops the in-memory copy so the next [read] goes to secure storage.
  /// Used before a biometric unlock.
  void forgetMemory() => _memory = null;
}

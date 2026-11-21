import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../models/models.dart';

class LocalNotificationService {
  LocalNotificationService._();
  static final LocalNotificationService instance = LocalNotificationService._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized || kIsWeb) return;
    try {
      const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosInit = DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      );
      const settings = InitializationSettings(
        android: androidInit,
        iOS: iosInit,
      );
      await _plugin.initialize(settings);
      _initialized = true;
    } catch (_) {
      // Safe fallback in unit/widget test environments without platform channels
    }
  }

  Future<void> showAppNotification(AppNotification item) async {
    if (!_initialized) return;
    try {
      const details = NotificationDetails(
        android: AndroidNotificationDetails(
          'autopark_ops_channel',
          'Auto Park Operations',
          channelDescription:
              'Automated parking, retrieval, and system notifications',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      );
      await _plugin.show(
        item.id.hashCode,
        item.title,
        item.body,
        details,
      );
    } catch (_) {}
  }

  Future<void> showAlarmAlert(Alarm alarm) async {
    if (!_initialized) return;
    try {
      const details = NotificationDetails(
        android: AndroidNotificationDetails(
          'autopark_alarms_channel',
          'Auto Park Critical Alarms',
          channelDescription: 'Critical industrial controller and PLC alarms',
          importance: Importance.max,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(presentSound: true),
      );
      await _plugin.show(
        alarm.id.hashCode,
        '[${alarm.severity.wire}] ${alarm.alarmCode}',
        '${alarm.source}: ${alarm.description}',
        details,
      );
    } catch (_) {}
  }
}

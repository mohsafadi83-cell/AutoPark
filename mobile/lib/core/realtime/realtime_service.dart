import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';
import '../models/models.dart';

class RealtimeService {
  io.Socket? _socket;

  final _systemStatusCtrl = StreamController<SystemStatus>.broadcast();
  final _requestCtrl = StreamController<ParkingRequest>.broadcast();
  final _spaceCtrl = StreamController<ParkingSpace>.broadcast();
  final _alarmCtrl = StreamController<Alarm>.broadcast();
  final _notificationCtrl = StreamController<AppNotification>.broadcast();
  final _vehicleMovingCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _heartbeatCtrl = StreamController<DateTime>.broadcast();
  final _connectedCtrl = StreamController<bool>.broadcast();
  final _reconnectingCtrl = StreamController<bool>.broadcast();

  Stream<SystemStatus> get systemStatusStream => _systemStatusCtrl.stream;
  Stream<ParkingRequest> get requestStream => _requestCtrl.stream;
  Stream<ParkingSpace> get spaceUpdatedStream => _spaceCtrl.stream;
  Stream<Alarm> get alarmStream => _alarmCtrl.stream;
  Stream<AppNotification> get notificationStream => _notificationCtrl.stream;
  Stream<Map<String, dynamic>> get vehicleMovingStream =>
      _vehicleMovingCtrl.stream;
  Stream<DateTime> get heartbeatStream => _heartbeatCtrl.stream;
  Stream<bool> get connectedStream => _connectedCtrl.stream;
  Stream<bool> get reconnectingStream => _reconnectingCtrl.stream;

  bool _isConnected = false;
  bool get isConnected => _isConnected;

  void connect({
    required String host,
    required String accessToken,
    Future<String?> Function()? onTokenExpired,
  }) {
    disconnect();
    final url = '${AppConfig.normalizeHost(host)}${AppConfig.realtimeNamespace}';
    final socket = io.io(
      url,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': accessToken})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(2000)
          .build(),
    );

    socket.onConnect((_) {
      _isConnected = true;
      _connectedCtrl.add(true);
      _reconnectingCtrl.add(false);
    });

    socket.onDisconnect((_) {
      _isConnected = false;
      _connectedCtrl.add(false);
      _reconnectingCtrl.add(true);
    });

    socket.onReconnectAttempt((_) {
      _isConnected = false;
      _connectedCtrl.add(false);
      _reconnectingCtrl.add(true);
    });

    socket.onConnectError((_) {
      _isConnected = false;
      _connectedCtrl.add(false);
      _reconnectingCtrl.add(true);
    });

    socket.onReconnectError((_) {
      _isConnected = false;
      _connectedCtrl.add(false);
      _reconnectingCtrl.add(true);
    });

    socket.on('auth.error', (_) async {
      _isConnected = false;
      _connectedCtrl.add(false);
      if (onTokenExpired != null) {
        final nextToken = await onTokenExpired();
        if (nextToken != null && nextToken.isNotEmpty) {
          connect(
            host: host,
            accessToken: nextToken,
            onTokenExpired: onTokenExpired,
          );
        }
      }
    });

    void handleSystemStatus(dynamic payload) {
      if (payload is Map<String, dynamic>) {
        _systemStatusCtrl.add(SystemStatus.fromJson(payload));
      } else if (payload is Map) {
        _systemStatusCtrl.add(
          SystemStatus.fromJson(Map<String, dynamic>.from(payload)),
        );
      }
    }

    socket.on('system.status.changed', handleSystemStatus);
    socket.on('controller.online', handleSystemStatus);
    socket.on('controller.offline', handleSystemStatus);

    void handleRequest(dynamic payload) {
      if (payload is Map) {
        _requestCtrl.add(
          ParkingRequest.fromJson(Map<String, dynamic>.from(payload)),
        );
      }
    }

    socket.on('parking.request.created', handleRequest);
    socket.on('parking.request.updated', handleRequest);
    socket.on('vehicle.parked', handleRequest);
    socket.on('vehicle.retrieved', handleRequest);

    socket.on('parking.space.updated', (payload) {
      if (payload is Map) {
        _spaceCtrl.add(
          ParkingSpace.fromJson(Map<String, dynamic>.from(payload)),
        );
      }
    });

    socket.on('vehicle.moving', (payload) {
      if (payload is Map) {
        _vehicleMovingCtrl.add(Map<String, dynamic>.from(payload));
      }
    });

    void handleAlarm(dynamic payload) {
      if (payload is Map) {
        _alarmCtrl.add(Alarm.fromJson(Map<String, dynamic>.from(payload)));
      }
    }

    socket.on('alarm.created', handleAlarm);
    socket.on('alarm.acknowledged', handleAlarm);
    socket.on('alarm.resolved', handleAlarm);

    socket.on('notification', (payload) {
      if (payload is Map) {
        _notificationCtrl.add(
          AppNotification.fromJson(Map<String, dynamic>.from(payload)),
        );
      }
    });

    socket.on('heartbeat', (payload) {
      _heartbeatCtrl.add(DateTime.now());
    });

    _socket = socket;
  }

  void disconnect() {
    _isConnected = false;
    try {
      _socket?.disconnect();
      _socket?.dispose();
    } catch (_) {}
    _socket = null;
  }

  void dispose() {
    disconnect();
    _systemStatusCtrl.close();
    _requestCtrl.close();
    _spaceCtrl.close();
    _alarmCtrl.close();
    _notificationCtrl.close();
    _vehicleMovingCtrl.close();
    _heartbeatCtrl.close();
    _connectedCtrl.close();
    _reconnectingCtrl.close();
  }
}

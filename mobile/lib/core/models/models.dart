class Permission {
  Permission._();

  static const String dashboardView = 'dashboard.view';
  static const String parkingView = 'parking.view';
  static const String parkingRequest = 'parking.request';
  static const String parkingRequestAny = 'parking.request.any';
  static const String vehiclesManageOwn = 'vehicles.manage.own';
  static const String vehiclesManageAny = 'vehicles.manage.any';
  static const String alarmsView = 'alarms.view';
  static const String alarmsAcknowledge = 'alarms.acknowledge';
  static const String historyViewOwn = 'history.view.own';
  static const String historyViewAll = 'history.view.all';
  static const String systemMonitor = 'system.monitor';
  static const String diagnosticsView = 'diagnostics.view';
  static const String commandsView = 'commands.view';
  static const String usersManage = 'users.manage';
  static const String configManage = 'config.manage';
  static const String auditView = 'audit.view';
  static const String simulationControl = 'simulation.control';
}

class User {
  const User({
    required this.id,
    required this.fullName,
    required this.username,
    required this.email,
    required this.phone,
    required this.role,
    required this.permissions,
    required this.status,
    required this.language,
    this.lastLogin,
  });

  final String id;
  final String fullName;
  final String username;
  final String email;
  final String? phone;
  final String role;
  final List<String> permissions;
  final String status;
  final String language;
  final DateTime? lastLogin;

  bool hasPermission(String perm) =>
      role == 'SUPER_ADMIN' || permissions.contains(perm);

  bool get canRequestParking =>
      hasPermission(Permission.parkingRequest) ||
      hasPermission(Permission.parkingRequestAny);

  bool get canRequestAnyVehicle => hasPermission(Permission.parkingRequestAny);

  bool get canManageVehicles =>
      hasPermission(Permission.vehiclesManageOwn) ||
      hasPermission(Permission.vehiclesManageAny);

  bool get canManageAnyVehicle => hasPermission(Permission.vehiclesManageAny);

  bool get canViewAlarms => hasPermission(Permission.alarmsView);

  bool get canAcknowledgeAlarms => hasPermission(Permission.alarmsAcknowledge);

  bool get canMonitorSystem => hasPermission(Permission.systemMonitor);

  bool get canManageConfig => hasPermission(Permission.configManage);

  bool get canControlSimulation => hasPermission(Permission.simulationControl);

  bool get canViewAllHistory => hasPermission(Permission.historyViewAll);

  bool get canViewAudit => hasPermission(Permission.auditView);

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String? ?? '',
        fullName: json['fullName'] as String? ?? '',
        username: json['username'] as String? ?? '',
        email: json['email'] as String? ?? '',
        phone: json['phone'] as String?,
        role: json['role'] as String? ?? 'CUSTOMER',
        permissions: (json['permissions'] as List<dynamic>? ?? const [])
            .map((e) => e.toString())
            .toList(),
        status: json['status'] as String? ?? 'ACTIVE',
        language: json['language'] as String? ?? 'ar',
        lastLogin: json['lastLogin'] != null
            ? DateTime.tryParse(json['lastLogin'].toString())
            : null,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'username': username,
        'email': email,
        'phone': phone,
        'role': role,
        'permissions': permissions,
        'status': status,
        'language': language,
        'lastLogin': lastLogin?.toIso8601String(),
      };
}

enum SystemState {
  online('ONLINE'),
  warning('WARNING'),
  error('ERROR'),
  offline('OFFLINE');

  const SystemState(this.wire);
  final String wire;

  static SystemState fromWire(String? value) => SystemState.values.firstWhere(
        (e) => e.wire == value,
        orElse: () => SystemState.offline,
      );
}

class SystemStatus {
  const SystemStatus({
    required this.mode,
    required this.adapter,
    required this.state,
    required this.controllerConnected,
    required this.plcConnected,
    required this.machineState,
    required this.emergencyStop,
    required this.safetyOk,
    required this.systemReady,
    required this.communication,
    this.lastHeartbeat,
    this.heartbeatAgeMs,
    this.activeCommandId,
    required this.lastUpdate,
    this.message,
  });

  final String mode; // SIMULATION | PRODUCTION
  final String adapter;
  final SystemState state;
  final bool controllerConnected;
  final bool plcConnected;
  final String machineState; // IDLE | BUSY | FAULT | EMERGENCY_STOP | MAINTENANCE | UNKNOWN
  final bool emergencyStop;
  final bool safetyOk;
  final bool systemReady;
  final String communication; // OK | DEGRADED | LOST
  final DateTime? lastHeartbeat;
  final int? heartbeatAgeMs;
  final String? activeCommandId;
  final DateTime lastUpdate;
  final String? message;

  bool get isSimulation => mode == 'SIMULATION';

  /// CRITICAL SAFETY RULE:
  /// Commands (Park / Retrieve) may only be dispatched when the controller and
  /// PLC are connected, system is not OFFLINE/ERROR, Emergency Stop is clear,
  /// and safety interlocks are OK.
  bool get canAcceptCommands =>
      state != SystemState.offline &&
      state != SystemState.error &&
      controllerConnected &&
      plcConnected &&
      !emergencyStop &&
      safetyOk &&
      systemReady;

  factory SystemStatus.offlineFallback([String? reason]) => SystemStatus(
        mode: 'PRODUCTION',
        adapter: 'UNKNOWN',
        state: SystemState.offline,
        controllerConnected: false,
        plcConnected: false,
        machineState: 'UNKNOWN',
        emergencyStop: false,
        safetyOk: false,
        systemReady: false,
        communication: 'LOST',
        lastUpdate: DateTime.now(),
        message: reason,
      );

  factory SystemStatus.fromJson(Map<String, dynamic> json) => SystemStatus(
        mode: json['mode'] as String? ?? 'SIMULATION',
        adapter: json['adapter'] as String? ?? 'MOCK',
        state: SystemState.fromWire(json['state'] as String?),
        controllerConnected: json['controllerConnected'] as bool? ?? false,
        plcConnected: json['plcConnected'] as bool? ?? false,
        machineState: json['machineState'] as String? ?? 'UNKNOWN',
        emergencyStop: json['emergencyStop'] as bool? ?? false,
        safetyOk: json['safetyOk'] as bool? ?? false,
        systemReady: json['systemReady'] as bool? ?? false,
        communication: json['communication'] as String? ?? 'LOST',
        lastHeartbeat: json['lastHeartbeat'] != null
            ? DateTime.tryParse(json['lastHeartbeat'].toString())
            : null,
        heartbeatAgeMs: (json['heartbeatAgeMs'] as num?)?.toInt(),
        activeCommandId: json['activeCommandId'] as String?,
        lastUpdate: json['lastUpdate'] != null
            ? (DateTime.tryParse(json['lastUpdate'].toString()) ??
                DateTime.now())
            : DateTime.now(),
        message: json['message'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'mode': mode,
        'adapter': adapter,
        'state': state.wire,
        'controllerConnected': controllerConnected,
        'plcConnected': plcConnected,
        'machineState': machineState,
        'emergencyStop': emergencyStop,
        'safetyOk': safetyOk,
        'systemReady': systemReady,
        'communication': communication,
        'lastHeartbeat': lastHeartbeat?.toIso8601String(),
        'heartbeatAgeMs': heartbeatAgeMs,
        'activeCommandId': activeCommandId,
        'lastUpdate': lastUpdate.toIso8601String(),
        'message': message,
      };
}

class SpaceTotals {
  const SpaceTotals({
    required this.total,
    required this.available,
    required this.occupied,
    required this.reserved,
    required this.moving,
    required this.blocked,
    required this.maintenance,
    required this.error,
  });

  final int total;
  final int available;
  final int occupied;
  final int reserved;
  final int moving;
  final int blocked;
  final int maintenance;
  final int error;

  factory SpaceTotals.fromJson(Map<String, dynamic> json) => SpaceTotals(
        total: (json['total'] as num?)?.toInt() ?? 0,
        available: (json['available'] as num?)?.toInt() ?? 0,
        occupied: (json['occupied'] as num?)?.toInt() ?? 0,
        reserved: (json['reserved'] as num?)?.toInt() ?? 0,
        moving: (json['moving'] as num?)?.toInt() ?? 0,
        blocked: (json['blocked'] as num?)?.toInt() ?? 0,
        maintenance: (json['maintenance'] as num?)?.toInt() ?? 0,
        error: (json['error'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'total': total,
        'available': available,
        'occupied': occupied,
        'reserved': reserved,
        'moving': moving,
        'blocked': blocked,
        'maintenance': maintenance,
        'error': error,
      };
}

class DashboardSummary {
  const DashboardSummary({
    required this.system,
    required this.totals,
    required this.activeAlarms,
    required this.criticalAlarms,
    required this.activeRequests,
    required this.health,
    required this.levels,
    required this.zones,
    this.isCached = false,
  });

  final SystemStatus system;
  final SpaceTotals totals;
  final int activeAlarms;
  final int criticalAlarms;
  final int activeRequests;
  final int health;
  final List<int> levels;
  final List<String> zones;
  final bool isCached;

  DashboardSummary copyWith({
    SystemStatus? system,
    bool? isCached,
  }) =>
      DashboardSummary(
        system: system ?? this.system,
        totals: totals,
        activeAlarms: activeAlarms,
        criticalAlarms: criticalAlarms,
        activeRequests: activeRequests,
        health: health,
        levels: levels,
        zones: zones,
        isCached: isCached ?? this.isCached,
      );

  factory DashboardSummary.fromJson(
    Map<String, dynamic> json, {
    bool isCached = false,
  }) =>
      DashboardSummary(
        system: SystemStatus.fromJson(
          (json['system'] as Map<String, dynamic>?) ?? const {},
        ),
        totals: SpaceTotals.fromJson(
          (json['totals'] as Map<String, dynamic>?) ?? const {},
        ),
        activeAlarms: (json['activeAlarms'] as num?)?.toInt() ?? 0,
        criticalAlarms: (json['criticalAlarms'] as num?)?.toInt() ?? 0,
        activeRequests: (json['activeRequests'] as num?)?.toInt() ?? 0,
        health: (json['health'] as num?)?.toInt() ?? 0,
        levels: (json['levels'] as List<dynamic>? ?? const [])
            .map((e) => (e as num).toInt())
            .toList(),
        zones: (json['zones'] as List<dynamic>? ?? const [])
            .map((e) => e.toString())
            .toList(),
        isCached: isCached,
      );

  Map<String, dynamic> toJson() => {
        'system': system.toJson(),
        'totals': totals.toJson(),
        'activeAlarms': activeAlarms,
        'criticalAlarms': criticalAlarms,
        'activeRequests': activeRequests,
        'health': health,
        'levels': levels,
        'zones': zones,
      };
}

enum SpaceStatus {
  available('AVAILABLE'),
  occupied('OCCUPIED'),
  reserved('RESERVED'),
  moving('MOVING'),
  blocked('BLOCKED'),
  maintenance('MAINTENANCE'),
  error('ERROR');

  const SpaceStatus(this.wire);
  final String wire;

  static SpaceStatus fromWire(String? value) => SpaceStatus.values.firstWhere(
        (e) => e.wire == value,
        orElse: () => SpaceStatus.available,
      );
}

class ParkingSpace {
  const ParkingSpace({
    required this.id,
    required this.spaceNumber,
    required this.level,
    required this.zone,
    required this.status,
    this.vehicleId,
    this.vehiclePlate,
    this.vehicleOwnerId,
    this.parkedByUserId,
    this.parkedByUsername,
    this.isOtherVehicle = false,
    this.colorCategory,
    required this.updatedAt,
  });

  final String id;
  final String spaceNumber;
  final int level;
  final String zone;
  final SpaceStatus status;
  final String? vehicleId;
  final String? vehiclePlate;
  final String? vehicleOwnerId;
  final String? parkedByUserId;
  final String? parkedByUsername;
  final bool isOtherVehicle;
  final String? colorCategory;
  final DateTime updatedAt;

  /// Resolves the exact 4-color category for the logged-in employee:
  /// - GREEN_EMPTY: empty bay
  /// - YELLOW_MY_CAR: employee moved park & parked their own car
  /// - PURPLE_PARKED_OTHER: employee moved park & parked another car
  /// - RED_COLLEAGUE: occupied by a colleague's car
  String resolveColorCategory(User? viewer) {
    if (status == SpaceStatus.available) return 'GREEN_EMPTY';
    if (colorCategory != null && colorCategory!.isNotEmpty) {
      return colorCategory!;
    }
    final parkedByMe = viewer != null &&
        ((parkedByUserId != null && parkedByUserId == viewer.id) ||
            (parkedByUsername != null &&
                parkedByUsername!.toLowerCase() ==
                    viewer.username.toLowerCase()));
    final ownedByMe = viewer != null &&
        vehicleOwnerId != null &&
        vehicleOwnerId == viewer.id;
    if (parkedByMe) {
      return isOtherVehicle ? 'PURPLE_PARKED_OTHER' : 'YELLOW_MY_CAR';
    }
    if (parkedByUserId == null && ownedByMe) {
      return 'YELLOW_MY_CAR';
    }
    return 'RED_COLLEAGUE';
  }

  factory ParkingSpace.fromJson(Map<String, dynamic> json) {
    final vehicle = json['vehicle'] as Map<String, dynamic>?;
    return ParkingSpace(
      id: json['id'] as String? ?? '',
      spaceNumber: json['spaceNumber'] as String? ?? '',
      level: (json['level'] as num?)?.toInt() ?? 1,
      zone: json['zone'] as String? ?? 'A',
      status: SpaceStatus.fromWire(json['status'] as String?),
      vehicleId: vehicle?['id'] as String?,
      vehiclePlate: vehicle?['plateNumber'] as String?,
      vehicleOwnerId: vehicle?['userId'] as String?,
      parkedByUserId: json['parkedByUserId'] as String?,
      parkedByUsername: json['parkedByUsername'] as String?,
      isOtherVehicle: json['isOtherVehicle'] as bool? ?? false,
      colorCategory: json['colorCategory'] as String?,
      updatedAt: json['updatedAt'] != null
          ? (DateTime.tryParse(json['updatedAt'].toString()) ?? DateTime.now())
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'spaceNumber': spaceNumber,
        'level': level,
        'zone': zone,
        'status': status.wire,
        'vehicle': vehiclePlate != null
            ? {
                'id': vehicleId ?? '',
                'plateNumber': vehiclePlate,
                if (vehicleOwnerId != null) 'userId': vehicleOwnerId,
              }
            : null,
        'parkedByUserId': parkedByUserId,
        'parkedByUsername': parkedByUsername,
        'isOtherVehicle': isOtherVehicle,
        'colorCategory': colorCategory,
        'updatedAt': updatedAt.toIso8601String(),
      };
}

class Vehicle {
  const Vehicle({
    required this.id,
    required this.userId,
    this.ownerName,
    required this.plateNumber,
    this.vehicleType,
    this.brand,
    this.model,
    this.color,
    required this.createdAt,
    required this.parked,
    this.parkingSpaceNumber,
    this.parkingLevel,
    this.parkingZone,
  });

  final String id;
  final String userId;
  final String? ownerName;
  final String plateNumber;
  final String? vehicleType;
  final String? brand;
  final String? model;
  final String? color;
  final DateTime createdAt;
  final bool parked;
  final String? parkingSpaceNumber;
  final int? parkingLevel;
  final String? parkingZone;

  String get displayName {
    final parts = [brand, model].whereType<String>().where((s) => s.isNotEmpty);
    return parts.isEmpty ? plateNumber : '$plateNumber • ${parts.join(' ')}';
  }

  factory Vehicle.fromJson(Map<String, dynamic> json) {
    final space = json['parkingSpace'] as Map<String, dynamic>?;
    return Vehicle(
      id: json['id'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      ownerName: json['ownerName'] as String?,
      plateNumber: json['plateNumber'] as String? ?? '',
      vehicleType: json['vehicleType'] as String?,
      brand: json['brand'] as String?,
      model: json['model'] as String?,
      color: json['color'] as String?,
      createdAt: json['createdAt'] != null
          ? (DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now())
          : DateTime.now(),
      parked: json['parked'] as bool? ?? false,
      parkingSpaceNumber: space?['spaceNumber'] as String?,
      parkingLevel: (space?['level'] as num?)?.toInt(),
      parkingZone: space?['zone'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'userId': userId,
        'ownerName': ownerName,
        'plateNumber': plateNumber,
        'vehicleType': vehicleType,
        'brand': brand,
        'model': model,
        'color': color,
        'createdAt': createdAt.toIso8601String(),
        'parked': parked,
        'parkingSpace': parkingSpaceNumber != null
            ? {
                'spaceNumber': parkingSpaceNumber,
                'level': parkingLevel ?? 1,
                'zone': parkingZone ?? 'A',
              }
            : null,
      };
}

class RequestStep {
  const RequestStep({
    required this.key,
    required this.status,
    this.at,
  });

  final String key;
  final String status; // DONE | ACTIVE | PENDING | FAILED
  final DateTime? at;

  factory RequestStep.fromJson(Map<String, dynamic> json) => RequestStep(
        key: json['key'] as String? ?? '',
        status: json['status'] as String? ?? 'PENDING',
        at: json['at'] != null ? DateTime.tryParse(json['at'].toString()) : null,
      );
}

class IndustrialCommand {
  const IndustrialCommand({
    required this.id,
    required this.commandId,
    required this.commandType,
    required this.status,
    required this.progress,
    this.phase,
    this.errorMessage,
    required this.createdAt,
    this.sentAt,
    this.acknowledgedAt,
    this.completedAt,
  });

  final String id;
  final String commandId;
  final String commandType;
  final String status;
  final int progress;
  final String? phase;
  final String? errorMessage;
  final DateTime createdAt;
  final DateTime? sentAt;
  final DateTime? acknowledgedAt;
  final DateTime? completedAt;

  bool get isAlreadySent =>
      status == 'SENT' ||
      status == 'ACKNOWLEDGED' ||
      status == 'EXECUTING' ||
      status == 'COMPLETED';

  factory IndustrialCommand.fromJson(Map<String, dynamic> json) =>
      IndustrialCommand(
        id: json['id'] as String? ?? '',
        commandId: json['commandId'] as String? ?? '',
        commandType: json['commandType'] as String? ?? 'PARK',
        status: json['status'] as String? ?? 'CREATED',
        progress: (json['progress'] as num?)?.toInt() ?? 0,
        phase: json['phase'] as String?,
        errorMessage: json['errorMessage'] as String?,
        createdAt: json['createdAt'] != null
            ? (DateTime.tryParse(json['createdAt'].toString()) ??
                DateTime.now())
            : DateTime.now(),
        sentAt: json['sentAt'] != null
            ? DateTime.tryParse(json['sentAt'].toString())
            : null,
        acknowledgedAt: json['acknowledgedAt'] != null
            ? DateTime.tryParse(json['acknowledgedAt'].toString())
            : null,
        completedAt: json['completedAt'] != null
            ? DateTime.tryParse(json['completedAt'].toString())
            : null,
      );
}

class ParkingRequest {
  const ParkingRequest({
    required this.id,
    required this.requestNumber,
    required this.requestType,
    required this.status,
    required this.source,
    required this.vehicleId,
    required this.plateNumber,
    this.vehicleBrand,
    this.vehicleModel,
    this.spaceNumber,
    this.spaceLevel,
    this.spaceZone,
    this.command,
    required this.steps,
    this.errorMessage,
    required this.createdAt,
    this.completedAt,
  });

  final String id;
  final String requestNumber;
  final String requestType; // PARK | RETRIEVE
  final String status; // PENDING | VALIDATING | APPROVED | PROCESSING | IN_PROGRESS | COMPLETED | FAILED | CANCELLED
  final String source;
  final String vehicleId;
  final String plateNumber;
  final String? vehicleBrand;
  final String? vehicleModel;
  final String? spaceNumber;
  final int? spaceLevel;
  final String? spaceZone;
  final IndustrialCommand? command;
  final List<RequestStep> steps;
  final String? errorMessage;
  final DateTime createdAt;
  final DateTime? completedAt;

  static const List<String> parkStepOrder = [
    'CREATED',
    'VALIDATED',
    'APPROVED',
    'COMMAND_SENT',
    'CONTROLLER_CONFIRMED',
    'VEHICLE_MOVING',
    'PARKING_COMPLETED',
  ];

  static const List<String> retrieveStepOrder = [
    'CREATED',
    'VALIDATED',
    'VEHICLE_LOCATED',
    'PREPARING_SYSTEM',
    'PLATFORM_MOVING',
    'RETRIEVAL_IN_PROGRESS',
    'VEHICLE_READY',
  ];

  bool get isActive =>
      status == 'PENDING' ||
      status == 'VALIDATING' ||
      status == 'APPROVED' ||
      status == 'PROCESSING' ||
      status == 'IN_PROGRESS';

  bool get isCompleted => status == 'COMPLETED';

  /// Only cancellable before the command is SENT to the controller.
  bool get canBeCancelled {
    if (!isActive) return false;
    if (command != null && command!.isAlreadySent) return false;
    final sentStep = steps.where((s) => s.key == 'COMMAND_SENT').firstOrNull;
    if (sentStep != null &&
        (sentStep.status == 'DONE' || sentStep.status == 'ACTIVE')) {
      return false;
    }
    return status == 'PENDING' ||
        status == 'VALIDATING' ||
        status == 'APPROVED';
  }

  factory ParkingRequest.fromJson(Map<String, dynamic> json) {
    final vehicle = json['vehicle'] as Map<String, dynamic>?;
    final space = json['parkingSpace'] as Map<String, dynamic>?;
    final cmd = json['command'] as Map<String, dynamic>?;
    return ParkingRequest(
      id: json['id'] as String? ?? '',
      requestNumber: json['requestNumber'] as String? ?? '',
      requestType: json['requestType'] as String? ?? 'PARK',
      status: json['status'] as String? ?? 'PENDING',
      source: json['source'] as String? ?? 'MOBILE',
      vehicleId: vehicle?['id'] as String? ?? '',
      plateNumber: vehicle?['plateNumber'] as String? ?? '',
      vehicleBrand: vehicle?['brand'] as String?,
      vehicleModel: vehicle?['model'] as String?,
      spaceNumber: space?['spaceNumber'] as String?,
      spaceLevel: (space?['level'] as num?)?.toInt(),
      spaceZone: space?['zone'] as String?,
      command: cmd != null ? IndustrialCommand.fromJson(cmd) : null,
      steps: (json['steps'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(RequestStep.fromJson)
          .toList(),
      errorMessage: json['errorMessage'] as String?,
      createdAt: json['createdAt'] != null
          ? (DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now())
          : DateTime.now(),
      completedAt: json['completedAt'] != null
          ? DateTime.tryParse(json['completedAt'].toString())
          : null,
    );
  }
}

enum AlarmSeverity {
  info('INFO'),
  warning('WARNING'),
  critical('CRITICAL'),
  emergency('EMERGENCY');

  const AlarmSeverity(this.wire);
  final String wire;

  static AlarmSeverity fromWire(String? value) =>
      AlarmSeverity.values.firstWhere(
        (e) => e.wire == value,
        orElse: () => AlarmSeverity.info,
      );
}

class Alarm {
  const Alarm({
    required this.id,
    required this.alarmCode,
    required this.severity,
    required this.description,
    required this.source,
    required this.status,
    required this.createdAt,
    this.acknowledgedByName,
    this.acknowledgedAt,
    this.resolvedAt,
  });

  final String id;
  final String alarmCode;
  final AlarmSeverity severity;
  final String description;
  final String source;
  final String status; // ACTIVE | ACKNOWLEDGED | RESOLVED
  final DateTime createdAt;
  final String? acknowledgedByName;
  final DateTime? acknowledgedAt;
  final DateTime? resolvedAt;

  bool get isActive => status == 'ACTIVE';
  bool get isResolved => status == 'RESOLVED';

  factory Alarm.fromJson(Map<String, dynamic> json) {
    final ackBy = json['acknowledgedBy'] as Map<String, dynamic>?;
    return Alarm(
      id: json['id'] as String? ?? '',
      alarmCode: json['alarmCode'] as String? ?? '',
      severity: AlarmSeverity.fromWire(json['severity'] as String?),
      description: json['description'] as String? ?? '',
      source: json['source'] as String? ?? 'PLC',
      status: json['status'] as String? ?? 'ACTIVE',
      createdAt: json['createdAt'] != null
          ? (DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now())
          : DateTime.now(),
      acknowledgedByName: ackBy?['fullName'] as String?,
      acknowledgedAt: json['acknowledgedAt'] != null
          ? DateTime.tryParse(json['acknowledgedAt'].toString())
          : null,
      resolvedAt: json['resolvedAt'] != null
          ? DateTime.tryParse(json['resolvedAt'].toString())
          : null,
    );
  }
}

class HistoryItem {
  const HistoryItem({
    required this.id,
    required this.kind,
    required this.title,
    this.description,
    this.plateNumber,
    this.status,
    this.actor,
    required this.createdAt,
    this.refId,
  });

  final String id;
  final String kind; // PARK | RETRIEVE | EVENT | AUDIT
  final String title;
  final String? description;
  final String? plateNumber;
  final String? status;
  final String? actor;
  final DateTime createdAt;
  final String? refId;

  factory HistoryItem.fromJson(Map<String, dynamic> json) => HistoryItem(
        id: json['id'] as String? ?? '',
        kind: json['kind'] as String? ?? 'EVENT',
        title: json['title'] as String? ?? '',
        description: json['description'] as String?,
        plateNumber: json['plateNumber'] as String?,
        status: json['status'] as String?,
        actor: json['actor'] as String?,
        createdAt: json['createdAt'] != null
            ? (DateTime.tryParse(json['createdAt'].toString()) ??
                DateTime.now())
            : DateTime.now(),
        refId: json['refId'] as String?,
      );
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.read,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final bool read;
  final DateTime createdAt;

  AppNotification copyWith({bool? read}) => AppNotification(
        id: id,
        type: type,
        title: title,
        body: body,
        read: read ?? this.read,
        createdAt: createdAt,
      );

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      AppNotification(
        id: json['id'] as String? ?? '',
        type: json['type'] as String? ?? 'INFO',
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? '',
        read: json['read'] as bool? ?? false,
        createdAt: json['createdAt'] != null
            ? (DateTime.tryParse(json['createdAt'].toString()) ??
                DateTime.now())
            : DateTime.now(),
      );
}

class IndustrialTagEntry {
  const IndustrialTagEntry({
    required this.address,
    required this.dataType,
    required this.access,
    this.description,
  });

  final String address;
  final String dataType;
  final String access;
  final String? description;

  IndustrialTagEntry copyWith({
    String? address,
    String? dataType,
    String? access,
  }) =>
      IndustrialTagEntry(
        address: address ?? this.address,
        dataType: dataType ?? this.dataType,
        access: access ?? this.access,
        description: description,
      );

  factory IndustrialTagEntry.fromJson(Map<String, dynamic> json) =>
      IndustrialTagEntry(
        address: json['address'] as String? ?? '',
        dataType: json['dataType'] as String? ?? 'BOOL',
        access: json['access'] as String? ?? 'R',
        description: json['description'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'address': address,
        'dataType': dataType,
        'access': access,
        if (description != null) 'description': description,
      };
}

class IndustrialConfig {
  const IndustrialConfig({
    required this.protocol,
    this.plcModel,
    this.host,
    this.port,
    this.rack,
    this.slot,
    this.opcuaEndpoint,
    this.opcuaSecurityMode,
    this.opcuaUsername,
    this.opcuaPassword,
    this.modbusUnitId,
    this.mqttUrl,
    this.mqttTopicPrefix,
    this.mqttUsername,
    this.mqttPassword,
    this.restBaseUrl,
    this.restApiKey,
    required this.pollIntervalMs,
    required this.ackTimeoutMs,
    required this.completionTimeoutMs,
    required this.heartbeatTimeoutMs,
    required this.supportsIdempotentCommands,
    required this.readOnly,
    required this.tagMap,
  });

  final String protocol;
  final String? plcModel;
  final String? host;
  final int? port;
  final int? rack;
  final int? slot;
  final String? opcuaEndpoint;
  final String? opcuaSecurityMode;
  final String? opcuaUsername;
  final String? opcuaPassword;
  final int? modbusUnitId;
  final String? mqttUrl;
  final String? mqttTopicPrefix;
  final String? mqttUsername;
  final String? mqttPassword;
  final String? restBaseUrl;
  final String? restApiKey;
  final int pollIntervalMs;
  final int ackTimeoutMs;
  final int completionTimeoutMs;
  final int heartbeatTimeoutMs;
  final bool supportsIdempotentCommands;
  final bool readOnly;
  final Map<String, IndustrialTagEntry> tagMap;

  static const List<String> protocols = [
    'VNC',
    'MOCK',
    'SIEMENS_S7',
    'OPC_UA',
    'MODBUS_TCP',
    'MQTT',
    'REST_GATEWAY',
    'CUSTOM_TCP',
  ];

  factory IndustrialConfig.fromJson(Map<String, dynamic> json) {
    final rawTags = json['tagMap'] as Map<String, dynamic>? ?? const {};
    final parsedTags = <String, IndustrialTagEntry>{};
    for (final entry in rawTags.entries) {
      if (entry.value is Map<String, dynamic>) {
        parsedTags[entry.key] =
            IndustrialTagEntry.fromJson(entry.value as Map<String, dynamic>);
      }
    }
    return IndustrialConfig(
      protocol: json['protocol'] as String? ?? 'MOCK',
      plcModel: json['plcModel'] as String?,
      host: json['host'] as String?,
      port: (json['port'] as num?)?.toInt(),
      rack: (json['rack'] as num?)?.toInt(),
      slot: (json['slot'] as num?)?.toInt(),
      opcuaEndpoint: json['opcuaEndpoint'] as String?,
      opcuaSecurityMode: json['opcuaSecurityMode'] as String?,
      opcuaUsername: json['opcuaUsername'] as String?,
      opcuaPassword: json['opcuaPassword'] as String?,
      modbusUnitId: (json['modbusUnitId'] as num?)?.toInt(),
      mqttUrl: json['mqttUrl'] as String?,
      mqttTopicPrefix: json['mqttTopicPrefix'] as String?,
      mqttUsername: json['mqttUsername'] as String?,
      mqttPassword: json['mqttPassword'] as String?,
      restBaseUrl: json['restBaseUrl'] as String?,
      restApiKey: json['restApiKey'] as String?,
      pollIntervalMs: (json['pollIntervalMs'] as num?)?.toInt() ?? 1000,
      ackTimeoutMs: (json['ackTimeoutMs'] as num?)?.toInt() ?? 5000,
      completionTimeoutMs:
          (json['completionTimeoutMs'] as num?)?.toInt() ?? 60000,
      heartbeatTimeoutMs:
          (json['heartbeatTimeoutMs'] as num?)?.toInt() ?? 10000,
      supportsIdempotentCommands:
          json['supportsIdempotentCommands'] as bool? ?? true,
      readOnly: json['readOnly'] as bool? ?? false,
      tagMap: parsedTags,
    );
  }

  Map<String, dynamic> toJson() => {
        'protocol': protocol,
        'plcModel': plcModel,
        'host': host,
        'port': port,
        'rack': rack,
        'slot': slot,
        'opcuaEndpoint': opcuaEndpoint,
        'opcuaSecurityMode': opcuaSecurityMode,
        'opcuaUsername': opcuaUsername,
        'opcuaPassword': opcuaPassword,
        'modbusUnitId': modbusUnitId,
        'mqttUrl': mqttUrl,
        'mqttTopicPrefix': mqttTopicPrefix,
        'mqttUsername': mqttUsername,
        'mqttPassword': mqttPassword,
        'restBaseUrl': restBaseUrl,
        'restApiKey': restApiKey,
        'pollIntervalMs': pollIntervalMs,
        'ackTimeoutMs': ackTimeoutMs,
        'completionTimeoutMs': completionTimeoutMs,
        'heartbeatTimeoutMs': heartbeatTimeoutMs,
        'supportsIdempotentCommands': supportsIdempotentCommands,
        'readOnly': readOnly,
        'tagMap': tagMap.map((k, v) => MapEntry(k, v.toJson())),
      };
}

class Paginated<T> {
  const Paginated({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  final List<T> items;
  final int total;
  final int page;
  final int limit;

  factory Paginated.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) fromItem,
  ) =>
      Paginated(
        items: (json['items'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(fromItem)
            .toList(),
        total: (json['total'] as num?)?.toInt() ?? 0,
        page: (json['page'] as num?)?.toInt() ?? 1,
        limit: (json['limit'] as num?)?.toInt() ?? 20,
      );
}

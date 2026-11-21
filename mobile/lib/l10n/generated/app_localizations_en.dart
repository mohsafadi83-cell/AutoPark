import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Auto Park';

  @override
  String get appSubtitle => 'Automated Smart Parking Control System';

  @override
  String get companyName => 'Industrial Smart Mobility Systems';

  @override
  String get initializingSystem => 'Initializing system telemetry...';

  @override
  String get restoringSession => 'Restoring operator session...';

  @override
  String get loginTitle => 'Sign In';

  @override
  String get loginSubtitle => 'Access the Automated Parking Control Center';

  @override
  String get usernameOrEmail => 'Username or Email';

  @override
  String get usernameRequired => 'Please enter your username or email';

  @override
  String get password => 'Password';

  @override
  String get passwordRequired => 'Please enter your password';

  @override
  String get rememberMe => 'Remember me on this device';

  @override
  String get forgotPassword => 'Forgot password?';

  @override
  String get forgotPasswordTitle => 'Password Reset Assistance';

  @override
  String get forgotPasswordBody => 'For security compliance in industrial control environments, password resets must be performed by a System Administrator or Super Admin via the User Management console.';

  @override
  String get signIn => 'Sign In';

  @override
  String get biometricSignIn => 'Sign in with Biometrics';

  @override
  String get biometricReason => 'Authenticate to unlock your Auto Park session';

  @override
  String get serverSettings => 'Server Connection';

  @override
  String get serverUrl => 'Backend Server URL';

  @override
  String get serverUrlHint => 'http://192.168.1.100:3000';

  @override
  String get serverUrlHelper => 'Base host address of the Auto Park backend API & WebSocket server.';

  @override
  String get invalidServerUrl => 'Please enter a valid http:// or https:// host URL';

  @override
  String get testConnection => 'Test Connection';

  @override
  String connectionSuccess(String mode, String adapter) {
    return 'Connected to server ($mode / $adapter)';
  }

  @override
  String get connectionFailed => 'Could not reach server';

  @override
  String get resetDefault => 'Reset Default';

  @override
  String get save => 'Save';

  @override
  String get cancel => 'Cancel';

  @override
  String get close => 'Close';

  @override
  String get confirm => 'Confirm';

  @override
  String get retry => 'Retry';

  @override
  String get refresh => 'Refresh';

  @override
  String get loading => 'Loading...';

  @override
  String get demoAccounts => 'Quick Demo Credentials';

  @override
  String get language => 'Language';

  @override
  String get arabic => 'العربية';

  @override
  String get english => 'English';

  @override
  String get theme => 'Appearance';

  @override
  String get darkMode => 'Industrial Dark';

  @override
  String get lightMode => 'Smart Light';

  @override
  String get systemTheme => 'System Default';

  @override
  String get navDashboard => 'Dashboard';

  @override
  String get navMap => 'Map';

  @override
  String get navOperations => 'Park / Retrieve';

  @override
  String get navAlarms => 'Alarms';

  @override
  String get navMore => 'Control & Profile';

  @override
  String get systemStatusOnline => 'System Online';

  @override
  String get systemStatusWarning => 'System Warning';

  @override
  String get systemStatusError => 'System Error';

  @override
  String get systemStatusOffline => 'System Offline';

  @override
  String get controllerConnected => 'Controller Connected';

  @override
  String get controllerDisconnected => 'Controller Offline';

  @override
  String get plcConnected => 'PLC Connected';

  @override
  String get plcDisconnected => 'PLC Disconnected';

  @override
  String get emergencyStopActive => 'EMERGENCY STOP ACTIVE';

  @override
  String get emergencyStopClear => 'Emergency Stop Clear';

  @override
  String get safetyInterlocksOk => 'Safety Interlocks OK';

  @override
  String get safetyInterlocksFault => 'Safety Interlock Tripped';

  @override
  String get systemReady => 'System Ready';

  @override
  String get systemNotReady => 'System Not Ready';

  @override
  String get modeSimulation => 'SIMULATION MODE';

  @override
  String get modeProduction => 'PRODUCTION MODE';

  @override
  String get cachedDataNotice => 'Viewing cached read-only snapshot — live control disabled';

  @override
  String get networkOfflineBanner => 'No network connection — control commands are disabled';

  @override
  String get backendUnreachableBanner => 'Backend server unreachable — showing cached data';

  @override
  String get controllerOfflineBanner => 'Industrial controller is OFFLINE — parking & retrieval commands blocked';

  @override
  String get totalSpaces => 'Total Spaces';

  @override
  String get availableSpaces => 'Available';

  @override
  String get occupiedSpaces => 'Occupied';

  @override
  String get reservedSpaces => 'Reserved';

  @override
  String get movingVehicles => 'Moving Now';

  @override
  String get blockedSpaces => 'Blocked / Fault';

  @override
  String get activeAlarmsCount => 'Active Alarms';

  @override
  String get systemHealth => 'System Health';

  @override
  String get quickActions => 'Quick Operations';

  @override
  String get requestParkAction => 'Park Vehicle';

  @override
  String get requestRetrieveAction => 'Retrieve Vehicle';

  @override
  String get openMapAction => 'Parking Map';

  @override
  String get liveMonitoringAction => 'Live Telemetry';

  @override
  String get activeRequestsTitle => 'Active Operations';

  @override
  String get noActiveRequests => 'No active parking or retrieval operations';

  @override
  String get simulationLab => 'Simulation Scenario Control';

  @override
  String get triggerScenario => 'Trigger Scenario';

  @override
  String get parkScreenTitle => 'Request Vehicle Parking';

  @override
  String get retrieveScreenTitle => 'Retrieve Parked Vehicle';

  @override
  String get selectVehicle => 'Select Registered Vehicle';

  @override
  String get enterPlateManual => 'Or Enter Plate Number (Staff)';

  @override
  String get plateNumber => 'License Plate Number';

  @override
  String get plateNumberRequired => 'Please select a vehicle or enter a plate number';

  @override
  String get noAvailableVehiclesToPark => 'All your registered vehicles are already parked or have an active request.';

  @override
  String get noParkedVehiclesToRetrieve => 'No parked vehicles found ready for retrieval.';

  @override
  String get confirmOperationTitle => 'Confirm Industrial Operation';

  @override
  String get operationType => 'Operation';

  @override
  String get operationPark => 'PARK VEHICLE';

  @override
  String get operationRetrieve => 'RETRIEVE VEHICLE';

  @override
  String get estimatedStatus => 'System Readiness';

  @override
  String get readyForDispatch => 'Ready — Controller & Safety Verified';

  @override
  String get submitRequest => 'Dispatch Command';

  @override
  String get cancelRequest => 'Cancel Request';

  @override
  String get cancelRequestConfirm => 'Cancel this request before the controller executes the command?';

  @override
  String get commandAlreadySentNote => 'Command already sent to industrial controller — cancellation locked';

  @override
  String get assignedSpace => 'Assigned Space';

  @override
  String get requestNumberLabel => 'Request #';

  @override
  String get liveProgressTitle => 'Live Operation Progress';

  @override
  String get stepCreated => 'Request Created';

  @override
  String get stepValidated => 'Safety & Space Validated';

  @override
  String get stepApproved => 'Operation Approved';

  @override
  String get stepCommandSent => 'Command Sent to Controller';

  @override
  String get stepControllerConfirmed => 'Controller Acknowledged';

  @override
  String get stepVehicleMoving => 'Vehicle Moving on Platform';

  @override
  String get stepParkingCompleted => 'Parking Completed (Controller Verified)';

  @override
  String get stepVehicleLocated => 'Vehicle Located in Bay';

  @override
  String get stepPreparingSystem => 'Preparing Lift & Shuttle';

  @override
  String get stepPlatformMoving => 'Platform Moving';

  @override
  String get stepRetrievalInProgress => 'Retrieval in Progress';

  @override
  String get stepVehicleReady => 'Vehicle Ready at Exit Bay';

  @override
  String get reqStatusPending => 'Pending';

  @override
  String get reqStatusValidating => 'Validating';

  @override
  String get reqStatusApproved => 'Approved';

  @override
  String get reqStatusProcessing => 'Processing';

  @override
  String get reqStatusInProgress => 'In Progress';

  @override
  String get reqStatusCompleted => 'Completed';

  @override
  String get reqStatusFailed => 'Failed';

  @override
  String get reqStatusCancelled => 'Cancelled';

  @override
  String get mapScreenTitle => 'Visual Parking Map';

  @override
  String get allLevels => 'All Levels';

  @override
  String levelLabel(int level) {
    return 'Level $level';
  }

  @override
  String get allZones => 'All Zones';

  @override
  String zoneLabel(String zone) {
    return 'Zone $zone';
  }

  @override
  String get allStatuses => 'All Statuses';

  @override
  String get spaceAvailable => 'Available';

  @override
  String get spaceOccupied => 'Occupied';

  @override
  String get spaceReserved => 'Reserved';

  @override
  String get spaceMoving => 'Moving';

  @override
  String get spaceBlocked => 'Blocked';

  @override
  String get spaceMaintenance => 'Maintenance';

  @override
  String get spaceError => 'Fault / Error';

  @override
  String spaceDetailsTitle(String spaceNumber) {
    return 'Space $spaceNumber';
  }

  @override
  String get monitoringScreenTitle => 'Live System Monitoring';

  @override
  String get plcStatus => 'PLC Connection';

  @override
  String get controllerStatus => 'Controller Link';

  @override
  String get machineState => 'Machine State';

  @override
  String get heartbeatStatus => 'System Heartbeat';

  @override
  String heartbeatAge(int ms) {
    return '$ms ms ago';
  }

  @override
  String get safetyInterlocks => 'Safety Interlocks';

  @override
  String get emergencyStop => 'Emergency Stop';

  @override
  String get communicationHealth => 'Communication Link';

  @override
  String get adapterProtocol => 'Industrial Adapter';

  @override
  String get activeCommand => 'Active Command ID';

  @override
  String get lastTelemetryUpdate => 'Last Telemetry Update';

  @override
  String get alarmsScreenTitle => 'System Alarms';

  @override
  String get activeAlarmsTab => 'Active / Unresolved';

  @override
  String get allAlarmsTab => 'All Alarms';

  @override
  String get severityInfo => 'INFO';

  @override
  String get severityWarning => 'WARNING';

  @override
  String get severityCritical => 'CRITICAL';

  @override
  String get severityEmergency => 'EMERGENCY';

  @override
  String get alarmStatusActive => 'ACTIVE';

  @override
  String get alarmStatusAcknowledged => 'ACKNOWLEDGED';

  @override
  String get alarmStatusResolved => 'RESOLVED';

  @override
  String get acknowledgeAlarm => 'Acknowledge';

  @override
  String get acknowledgeNoteHint => 'Optional operator note...';

  @override
  String get alarmSafetyNote => 'Alarms resolve automatically only when the PLC/Controller clears the fault condition.';

  @override
  String get noAlarmsFound => 'No alarms matching the current filter';

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get markAllRead => 'Mark all read';

  @override
  String get noNotifications => 'No notifications yet';

  @override
  String get vehiclesScreenTitle => 'Vehicles Management';

  @override
  String get addVehicle => 'Add Vehicle';

  @override
  String get editVehicle => 'Edit Vehicle';

  @override
  String get deleteVehicle => 'Delete Vehicle';

  @override
  String deleteVehicleConfirm(String plate) {
    return 'Remove vehicle $plate from the system?';
  }

  @override
  String get vehicleBrand => 'Brand (e.g. Toyota)';

  @override
  String get vehicleModel => 'Model (e.g. Camry)';

  @override
  String get vehicleColor => 'Color';

  @override
  String get vehicleType => 'Type (Sedan, SUV...)';

  @override
  String vehicleParkedBadge(String space) {
    return 'Parked in $space';
  }

  @override
  String get vehicleNotParkedBadge => 'Outside Facility';

  @override
  String vehicleHistoryTitle(String plate) {
    return 'Vehicle History — $plate';
  }

  @override
  String get historyScreenTitle => 'Operations & Event History';

  @override
  String get filterAll => 'All';

  @override
  String get filterPark => 'Parking';

  @override
  String get filterRetrieve => 'Retrieval';

  @override
  String get filterEvent => 'System Events';

  @override
  String get filterAudit => 'Audit Log';

  @override
  String get searchPlaceholder => 'Search plate, request #, actor...';

  @override
  String get exportCsv => 'Export CSV';

  @override
  String get dateRange => 'Date Range';

  @override
  String get clearFilters => 'Clear Filters';

  @override
  String get profileAndSettingsTitle => 'Profile & System Settings';

  @override
  String get profileSection => 'Operator / User Profile';

  @override
  String get fullName => 'Full Name';

  @override
  String get email => 'Email Address';

  @override
  String get phone => 'Phone Number';

  @override
  String get roleLabel => 'Assigned Role';

  @override
  String get updateProfile => 'Update Profile';

  @override
  String get changePassword => 'Change Password';

  @override
  String get currentPassword => 'Current Password';

  @override
  String get newPassword => 'New Password';

  @override
  String get passwordPolicyHint => 'Minimum 8 characters with uppercase, lowercase, and a digit';

  @override
  String get securitySection => 'Security & Biometrics';

  @override
  String get enableBiometric => 'Unlock with Fingerprint / Face ID';

  @override
  String get notificationsSection => 'Notification Preferences';

  @override
  String get notifyParking => 'Parking & Retrieval Updates';

  @override
  String get notifyAlarms => 'Critical & Warning Alarms';

  @override
  String get notifyMaintenance => 'Maintenance Alerts';

  @override
  String get industrialConfigTitle => 'Industrial Integration & Connection Settings';

  @override
  String get industrialConfigSubtitle => 'Configure PLC/Controller protocol, IP, port, tags & backend host';

  @override
  String get protocolLabel => 'Adapter Protocol';

  @override
  String get plcHostLabel => 'Controller / PLC IP or Host';

  @override
  String get plcPortLabel => 'Port';

  @override
  String get plcModelLabel => 'PLC Model';

  @override
  String get rackLabel => 'Rack';

  @override
  String get slotLabel => 'Slot';

  @override
  String get opcuaEndpointLabel => 'OPC UA Endpoint URL';

  @override
  String get modbusUnitIdLabel => 'Modbus Unit ID';

  @override
  String get mqttUrlLabel => 'MQTT Broker URL';

  @override
  String get mqttTopicPrefixLabel => 'MQTT Topic Prefix';

  @override
  String get restBaseUrlLabel => 'REST Gateway Base URL';

  @override
  String get pollIntervalLabel => 'Poll Interval (ms)';

  @override
  String get ackTimeoutLabel => 'Ack Timeout (ms)';

  @override
  String get completionTimeoutLabel => 'Completion Timeout (ms)';

  @override
  String get heartbeatTimeoutLabel => 'Heartbeat Timeout (ms)';

  @override
  String get readOnlyModeToggle => 'Read-Only Monitoring Mode (Block Write Commands)';

  @override
  String get idempotentCommandsToggle => 'Supports Idempotent Command Retry';

  @override
  String get tagMappingSection => 'PLC / Controller Tag Map';

  @override
  String get testIndustrialConnection => 'Test PLC / Controller Link';

  @override
  String get saveIndustrialConfig => 'Apply & Reconnect Adapter';

  @override
  String get logout => 'Sign Out';

  @override
  String get logoutConfirm => 'Sign out of your current Auto Park session?';

  @override
  String get errSystemOffline => 'System is currently offline. Control operations are blocked.';

  @override
  String get errSystemNotReady => 'Controller reports system is not ready.';

  @override
  String get errEmergencyStop => 'Emergency Stop is active! Clear E-Stop on hardware before operating.';

  @override
  String get errSafetyInterlock => 'Safety interlock violation detected. Operation blocked.';

  @override
  String get errCriticalAlarm => 'Active critical alarm prevents automated motion.';

  @override
  String get errMachineBusy => 'Machinery is currently executing another command.';

  @override
  String get errDuplicateRequest => 'This vehicle already has an active parking or retrieval request.';

  @override
  String get errVehicleAlreadyParked => 'Vehicle is already parked inside the facility.';

  @override
  String get errVehicleNotParked => 'Vehicle is not currently parked in the facility.';

  @override
  String get errNoSpaceAvailable => 'No available parking spaces match the request.';

  @override
  String get errVehicleNotFound => 'Vehicle could not be found.';

  @override
  String get errForbiddenVehicle => 'You do not have permission to operate this vehicle.';

  @override
  String get errCommandAlreadySent => 'Command has already been dispatched to the controller and cannot be cancelled.';

  @override
  String get errAccountLocked => 'Account temporarily locked due to failed sign-in attempts. Try again in 15 minutes.';

  @override
  String get errInvalidCredentials => 'Invalid username/email or password.';

  @override
  String get errGeneric => 'Operation could not be completed. Please verify connection and try again.';
}

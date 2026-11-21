import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en')
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'Auto Park'**
  String get appTitle;

  /// No description provided for @appSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Automated Smart Parking Control System'**
  String get appSubtitle;

  /// No description provided for @companyName.
  ///
  /// In en, this message translates to:
  /// **'Industrial Smart Mobility Systems'**
  String get companyName;

  /// No description provided for @initializingSystem.
  ///
  /// In en, this message translates to:
  /// **'Initializing system telemetry...'**
  String get initializingSystem;

  /// No description provided for @restoringSession.
  ///
  /// In en, this message translates to:
  /// **'Restoring operator session...'**
  String get restoringSession;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign In'**
  String get loginTitle;

  /// No description provided for @loginSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Access the Automated Parking Control Center'**
  String get loginSubtitle;

  /// No description provided for @usernameOrEmail.
  ///
  /// In en, this message translates to:
  /// **'Username or Email'**
  String get usernameOrEmail;

  /// No description provided for @usernameRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter your username or email'**
  String get usernameRequired;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @passwordRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter your password'**
  String get passwordRequired;

  /// No description provided for @rememberMe.
  ///
  /// In en, this message translates to:
  /// **'Remember me on this device'**
  String get rememberMe;

  /// No description provided for @forgotPassword.
  ///
  /// In en, this message translates to:
  /// **'Forgot password?'**
  String get forgotPassword;

  /// No description provided for @forgotPasswordTitle.
  ///
  /// In en, this message translates to:
  /// **'Password Reset Assistance'**
  String get forgotPasswordTitle;

  /// No description provided for @forgotPasswordBody.
  ///
  /// In en, this message translates to:
  /// **'For security compliance in industrial control environments, password resets must be performed by a System Administrator or Super Admin via the User Management console.'**
  String get forgotPasswordBody;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign In'**
  String get signIn;

  /// No description provided for @biometricSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in with Biometrics'**
  String get biometricSignIn;

  /// No description provided for @biometricReason.
  ///
  /// In en, this message translates to:
  /// **'Authenticate to unlock your Auto Park session'**
  String get biometricReason;

  /// No description provided for @serverSettings.
  ///
  /// In en, this message translates to:
  /// **'Server Connection'**
  String get serverSettings;

  /// No description provided for @serverUrl.
  ///
  /// In en, this message translates to:
  /// **'Backend Server URL'**
  String get serverUrl;

  /// No description provided for @serverUrlHint.
  ///
  /// In en, this message translates to:
  /// **'http://192.168.1.100:3000'**
  String get serverUrlHint;

  /// No description provided for @serverUrlHelper.
  ///
  /// In en, this message translates to:
  /// **'Base host address of the Auto Park backend API & WebSocket server.'**
  String get serverUrlHelper;

  /// No description provided for @invalidServerUrl.
  ///
  /// In en, this message translates to:
  /// **'Please enter a valid http:// or https:// host URL'**
  String get invalidServerUrl;

  /// No description provided for @testConnection.
  ///
  /// In en, this message translates to:
  /// **'Test Connection'**
  String get testConnection;

  /// No description provided for @connectionSuccess.
  ///
  /// In en, this message translates to:
  /// **'Connected to server ({mode} / {adapter})'**
  String connectionSuccess(String mode, String adapter);

  /// No description provided for @connectionFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not reach server'**
  String get connectionFailed;

  /// No description provided for @resetDefault.
  ///
  /// In en, this message translates to:
  /// **'Reset Default'**
  String get resetDefault;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @close.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// No description provided for @confirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get confirm;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @refresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get refresh;

  /// No description provided for @loading.
  ///
  /// In en, this message translates to:
  /// **'Loading...'**
  String get loading;

  /// No description provided for @demoAccounts.
  ///
  /// In en, this message translates to:
  /// **'Quick Demo Credentials'**
  String get demoAccounts;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @arabic.
  ///
  /// In en, this message translates to:
  /// **'العربية'**
  String get arabic;

  /// No description provided for @english.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get english;

  /// No description provided for @theme.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get theme;

  /// No description provided for @darkMode.
  ///
  /// In en, this message translates to:
  /// **'Industrial Dark'**
  String get darkMode;

  /// No description provided for @lightMode.
  ///
  /// In en, this message translates to:
  /// **'Smart Light'**
  String get lightMode;

  /// No description provided for @systemTheme.
  ///
  /// In en, this message translates to:
  /// **'System Default'**
  String get systemTheme;

  /// No description provided for @navDashboard.
  ///
  /// In en, this message translates to:
  /// **'Dashboard'**
  String get navDashboard;

  /// No description provided for @navMap.
  ///
  /// In en, this message translates to:
  /// **'Map'**
  String get navMap;

  /// No description provided for @navOperations.
  ///
  /// In en, this message translates to:
  /// **'Park / Retrieve'**
  String get navOperations;

  /// No description provided for @navAlarms.
  ///
  /// In en, this message translates to:
  /// **'Alarms'**
  String get navAlarms;

  /// No description provided for @navMore.
  ///
  /// In en, this message translates to:
  /// **'Control & Profile'**
  String get navMore;

  /// No description provided for @systemStatusOnline.
  ///
  /// In en, this message translates to:
  /// **'System Online'**
  String get systemStatusOnline;

  /// No description provided for @systemStatusWarning.
  ///
  /// In en, this message translates to:
  /// **'System Warning'**
  String get systemStatusWarning;

  /// No description provided for @systemStatusError.
  ///
  /// In en, this message translates to:
  /// **'System Error'**
  String get systemStatusError;

  /// No description provided for @systemStatusOffline.
  ///
  /// In en, this message translates to:
  /// **'System Offline'**
  String get systemStatusOffline;

  /// No description provided for @controllerConnected.
  ///
  /// In en, this message translates to:
  /// **'Controller Connected'**
  String get controllerConnected;

  /// No description provided for @controllerDisconnected.
  ///
  /// In en, this message translates to:
  /// **'Controller Offline'**
  String get controllerDisconnected;

  /// No description provided for @plcConnected.
  ///
  /// In en, this message translates to:
  /// **'PLC Connected'**
  String get plcConnected;

  /// No description provided for @plcDisconnected.
  ///
  /// In en, this message translates to:
  /// **'PLC Disconnected'**
  String get plcDisconnected;

  /// No description provided for @emergencyStopActive.
  ///
  /// In en, this message translates to:
  /// **'EMERGENCY STOP ACTIVE'**
  String get emergencyStopActive;

  /// No description provided for @emergencyStopClear.
  ///
  /// In en, this message translates to:
  /// **'Emergency Stop Clear'**
  String get emergencyStopClear;

  /// No description provided for @safetyInterlocksOk.
  ///
  /// In en, this message translates to:
  /// **'Safety Interlocks OK'**
  String get safetyInterlocksOk;

  /// No description provided for @safetyInterlocksFault.
  ///
  /// In en, this message translates to:
  /// **'Safety Interlock Tripped'**
  String get safetyInterlocksFault;

  /// No description provided for @systemReady.
  ///
  /// In en, this message translates to:
  /// **'System Ready'**
  String get systemReady;

  /// No description provided for @systemNotReady.
  ///
  /// In en, this message translates to:
  /// **'System Not Ready'**
  String get systemNotReady;

  /// No description provided for @modeSimulation.
  ///
  /// In en, this message translates to:
  /// **'SIMULATION MODE'**
  String get modeSimulation;

  /// No description provided for @modeProduction.
  ///
  /// In en, this message translates to:
  /// **'PRODUCTION MODE'**
  String get modeProduction;

  /// No description provided for @cachedDataNotice.
  ///
  /// In en, this message translates to:
  /// **'Viewing cached read-only snapshot — live control disabled'**
  String get cachedDataNotice;

  /// No description provided for @networkOfflineBanner.
  ///
  /// In en, this message translates to:
  /// **'No network connection — control commands are disabled'**
  String get networkOfflineBanner;

  /// No description provided for @backendUnreachableBanner.
  ///
  /// In en, this message translates to:
  /// **'Backend server unreachable — showing cached data'**
  String get backendUnreachableBanner;

  /// No description provided for @controllerOfflineBanner.
  ///
  /// In en, this message translates to:
  /// **'Industrial controller is OFFLINE — parking & retrieval commands blocked'**
  String get controllerOfflineBanner;

  /// No description provided for @totalSpaces.
  ///
  /// In en, this message translates to:
  /// **'Total Spaces'**
  String get totalSpaces;

  /// No description provided for @availableSpaces.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get availableSpaces;

  /// No description provided for @occupiedSpaces.
  ///
  /// In en, this message translates to:
  /// **'Occupied'**
  String get occupiedSpaces;

  /// No description provided for @reservedSpaces.
  ///
  /// In en, this message translates to:
  /// **'Reserved'**
  String get reservedSpaces;

  /// No description provided for @movingVehicles.
  ///
  /// In en, this message translates to:
  /// **'Moving Now'**
  String get movingVehicles;

  /// No description provided for @blockedSpaces.
  ///
  /// In en, this message translates to:
  /// **'Blocked / Fault'**
  String get blockedSpaces;

  /// No description provided for @activeAlarmsCount.
  ///
  /// In en, this message translates to:
  /// **'Active Alarms'**
  String get activeAlarmsCount;

  /// No description provided for @systemHealth.
  ///
  /// In en, this message translates to:
  /// **'System Health'**
  String get systemHealth;

  /// No description provided for @quickActions.
  ///
  /// In en, this message translates to:
  /// **'Quick Operations'**
  String get quickActions;

  /// No description provided for @requestParkAction.
  ///
  /// In en, this message translates to:
  /// **'Park Vehicle'**
  String get requestParkAction;

  /// No description provided for @requestRetrieveAction.
  ///
  /// In en, this message translates to:
  /// **'Retrieve Vehicle'**
  String get requestRetrieveAction;

  /// No description provided for @openMapAction.
  ///
  /// In en, this message translates to:
  /// **'Parking Map'**
  String get openMapAction;

  /// No description provided for @liveMonitoringAction.
  ///
  /// In en, this message translates to:
  /// **'Live Telemetry'**
  String get liveMonitoringAction;

  /// No description provided for @activeRequestsTitle.
  ///
  /// In en, this message translates to:
  /// **'Active Operations'**
  String get activeRequestsTitle;

  /// No description provided for @noActiveRequests.
  ///
  /// In en, this message translates to:
  /// **'No active parking or retrieval operations'**
  String get noActiveRequests;

  /// No description provided for @simulationLab.
  ///
  /// In en, this message translates to:
  /// **'Simulation Scenario Control'**
  String get simulationLab;

  /// No description provided for @triggerScenario.
  ///
  /// In en, this message translates to:
  /// **'Trigger Scenario'**
  String get triggerScenario;

  /// No description provided for @parkScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'Request Vehicle Parking'**
  String get parkScreenTitle;

  /// No description provided for @retrieveScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'Retrieve Parked Vehicle'**
  String get retrieveScreenTitle;

  /// No description provided for @selectVehicle.
  ///
  /// In en, this message translates to:
  /// **'Select Registered Vehicle'**
  String get selectVehicle;

  /// No description provided for @enterPlateManual.
  ///
  /// In en, this message translates to:
  /// **'Or Enter Plate Number (Staff)'**
  String get enterPlateManual;

  /// No description provided for @plateNumber.
  ///
  /// In en, this message translates to:
  /// **'License Plate Number'**
  String get plateNumber;

  /// No description provided for @plateNumberRequired.
  ///
  /// In en, this message translates to:
  /// **'Please select a vehicle or enter a plate number'**
  String get plateNumberRequired;

  /// No description provided for @noAvailableVehiclesToPark.
  ///
  /// In en, this message translates to:
  /// **'All your registered vehicles are already parked or have an active request.'**
  String get noAvailableVehiclesToPark;

  /// No description provided for @noParkedVehiclesToRetrieve.
  ///
  /// In en, this message translates to:
  /// **'No parked vehicles found ready for retrieval.'**
  String get noParkedVehiclesToRetrieve;

  /// No description provided for @confirmOperationTitle.
  ///
  /// In en, this message translates to:
  /// **'Confirm Industrial Operation'**
  String get confirmOperationTitle;

  /// No description provided for @operationType.
  ///
  /// In en, this message translates to:
  /// **'Operation'**
  String get operationType;

  /// No description provided for @operationPark.
  ///
  /// In en, this message translates to:
  /// **'PARK VEHICLE'**
  String get operationPark;

  /// No description provided for @operationRetrieve.
  ///
  /// In en, this message translates to:
  /// **'RETRIEVE VEHICLE'**
  String get operationRetrieve;

  /// No description provided for @estimatedStatus.
  ///
  /// In en, this message translates to:
  /// **'System Readiness'**
  String get estimatedStatus;

  /// No description provided for @readyForDispatch.
  ///
  /// In en, this message translates to:
  /// **'Ready — Controller & Safety Verified'**
  String get readyForDispatch;

  /// No description provided for @submitRequest.
  ///
  /// In en, this message translates to:
  /// **'Dispatch Command'**
  String get submitRequest;

  /// No description provided for @cancelRequest.
  ///
  /// In en, this message translates to:
  /// **'Cancel Request'**
  String get cancelRequest;

  /// No description provided for @cancelRequestConfirm.
  ///
  /// In en, this message translates to:
  /// **'Cancel this request before the controller executes the command?'**
  String get cancelRequestConfirm;

  /// No description provided for @commandAlreadySentNote.
  ///
  /// In en, this message translates to:
  /// **'Command already sent to industrial controller — cancellation locked'**
  String get commandAlreadySentNote;

  /// No description provided for @assignedSpace.
  ///
  /// In en, this message translates to:
  /// **'Assigned Space'**
  String get assignedSpace;

  /// No description provided for @requestNumberLabel.
  ///
  /// In en, this message translates to:
  /// **'Request #'**
  String get requestNumberLabel;

  /// No description provided for @liveProgressTitle.
  ///
  /// In en, this message translates to:
  /// **'Live Operation Progress'**
  String get liveProgressTitle;

  /// No description provided for @stepCreated.
  ///
  /// In en, this message translates to:
  /// **'Request Created'**
  String get stepCreated;

  /// No description provided for @stepValidated.
  ///
  /// In en, this message translates to:
  /// **'Safety & Space Validated'**
  String get stepValidated;

  /// No description provided for @stepApproved.
  ///
  /// In en, this message translates to:
  /// **'Operation Approved'**
  String get stepApproved;

  /// No description provided for @stepCommandSent.
  ///
  /// In en, this message translates to:
  /// **'Command Sent to Controller'**
  String get stepCommandSent;

  /// No description provided for @stepControllerConfirmed.
  ///
  /// In en, this message translates to:
  /// **'Controller Acknowledged'**
  String get stepControllerConfirmed;

  /// No description provided for @stepVehicleMoving.
  ///
  /// In en, this message translates to:
  /// **'Vehicle Moving on Platform'**
  String get stepVehicleMoving;

  /// No description provided for @stepParkingCompleted.
  ///
  /// In en, this message translates to:
  /// **'Parking Completed (Controller Verified)'**
  String get stepParkingCompleted;

  /// No description provided for @stepVehicleLocated.
  ///
  /// In en, this message translates to:
  /// **'Vehicle Located in Bay'**
  String get stepVehicleLocated;

  /// No description provided for @stepPreparingSystem.
  ///
  /// In en, this message translates to:
  /// **'Preparing Lift & Shuttle'**
  String get stepPreparingSystem;

  /// No description provided for @stepPlatformMoving.
  ///
  /// In en, this message translates to:
  /// **'Platform Moving'**
  String get stepPlatformMoving;

  /// No description provided for @stepRetrievalInProgress.
  ///
  /// In en, this message translates to:
  /// **'Retrieval in Progress'**
  String get stepRetrievalInProgress;

  /// No description provided for @stepVehicleReady.
  ///
  /// In en, this message translates to:
  /// **'Vehicle Ready at Exit Bay'**
  String get stepVehicleReady;

  /// No description provided for @reqStatusPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get reqStatusPending;

  /// No description provided for @reqStatusValidating.
  ///
  /// In en, this message translates to:
  /// **'Validating'**
  String get reqStatusValidating;

  /// No description provided for @reqStatusApproved.
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get reqStatusApproved;

  /// No description provided for @reqStatusProcessing.
  ///
  /// In en, this message translates to:
  /// **'Processing'**
  String get reqStatusProcessing;

  /// No description provided for @reqStatusInProgress.
  ///
  /// In en, this message translates to:
  /// **'In Progress'**
  String get reqStatusInProgress;

  /// No description provided for @reqStatusCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get reqStatusCompleted;

  /// No description provided for @reqStatusFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get reqStatusFailed;

  /// No description provided for @reqStatusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get reqStatusCancelled;

  /// No description provided for @mapScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'Visual Parking Map'**
  String get mapScreenTitle;

  /// No description provided for @allLevels.
  ///
  /// In en, this message translates to:
  /// **'All Levels'**
  String get allLevels;

  /// No description provided for @levelLabel.
  ///
  /// In en, this message translates to:
  /// **'Level {level}'**
  String levelLabel(int level);

  /// No description provided for @allZones.
  ///
  /// In en, this message translates to:
  /// **'All Zones'**
  String get allZones;

  /// No description provided for @zoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Zone {zone}'**
  String zoneLabel(String zone);

  /// No description provided for @allStatuses.
  ///
  /// In en, this message translates to:
  /// **'All Statuses'**
  String get allStatuses;

  /// No description provided for @spaceAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get spaceAvailable;

  /// No description provided for @spaceOccupied.
  ///
  /// In en, this message translates to:
  /// **'Occupied'**
  String get spaceOccupied;

  /// No description provided for @spaceReserved.
  ///
  /// In en, this message translates to:
  /// **'Reserved'**
  String get spaceReserved;

  /// No description provided for @spaceMoving.
  ///
  /// In en, this message translates to:
  /// **'Moving'**
  String get spaceMoving;

  /// No description provided for @spaceBlocked.
  ///
  /// In en, this message translates to:
  /// **'Blocked'**
  String get spaceBlocked;

  /// No description provided for @spaceMaintenance.
  ///
  /// In en, this message translates to:
  /// **'Maintenance'**
  String get spaceMaintenance;

  /// No description provided for @spaceError.
  ///
  /// In en, this message translates to:
  /// **'Fault / Error'**
  String get spaceError;

  /// No description provided for @spaceDetailsTitle.
  ///
  /// In en, this message translates to:
  /// **'Space {spaceNumber}'**
  String spaceDetailsTitle(String spaceNumber);

  /// No description provided for @monitoringScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'Live System Monitoring'**
  String get monitoringScreenTitle;

  /// No description provided for @plcStatus.
  ///
  /// In en, this message translates to:
  /// **'PLC Connection'**
  String get plcStatus;

  /// No description provided for @controllerStatus.
  ///
  /// In en, this message translates to:
  /// **'Controller Link'**
  String get controllerStatus;

  /// No description provided for @machineState.
  ///
  /// In en, this message translates to:
  /// **'Machine State'**
  String get machineState;

  /// No description provided for @heartbeatStatus.
  ///
  /// In en, this message translates to:
  /// **'System Heartbeat'**
  String get heartbeatStatus;

  /// No description provided for @heartbeatAge.
  ///
  /// In en, this message translates to:
  /// **'{ms} ms ago'**
  String heartbeatAge(int ms);

  /// No description provided for @safetyInterlocks.
  ///
  /// In en, this message translates to:
  /// **'Safety Interlocks'**
  String get safetyInterlocks;

  /// No description provided for @emergencyStop.
  ///
  /// In en, this message translates to:
  /// **'Emergency Stop'**
  String get emergencyStop;

  /// No description provided for @communicationHealth.
  ///
  /// In en, this message translates to:
  /// **'Communication Link'**
  String get communicationHealth;

  /// No description provided for @adapterProtocol.
  ///
  /// In en, this message translates to:
  /// **'Industrial Adapter'**
  String get adapterProtocol;

  /// No description provided for @activeCommand.
  ///
  /// In en, this message translates to:
  /// **'Active Command ID'**
  String get activeCommand;

  /// No description provided for @lastTelemetryUpdate.
  ///
  /// In en, this message translates to:
  /// **'Last Telemetry Update'**
  String get lastTelemetryUpdate;

  /// No description provided for @alarmsScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'System Alarms'**
  String get alarmsScreenTitle;

  /// No description provided for @activeAlarmsTab.
  ///
  /// In en, this message translates to:
  /// **'Active / Unresolved'**
  String get activeAlarmsTab;

  /// No description provided for @allAlarmsTab.
  ///
  /// In en, this message translates to:
  /// **'All Alarms'**
  String get allAlarmsTab;

  /// No description provided for @severityInfo.
  ///
  /// In en, this message translates to:
  /// **'INFO'**
  String get severityInfo;

  /// No description provided for @severityWarning.
  ///
  /// In en, this message translates to:
  /// **'WARNING'**
  String get severityWarning;

  /// No description provided for @severityCritical.
  ///
  /// In en, this message translates to:
  /// **'CRITICAL'**
  String get severityCritical;

  /// No description provided for @severityEmergency.
  ///
  /// In en, this message translates to:
  /// **'EMERGENCY'**
  String get severityEmergency;

  /// No description provided for @alarmStatusActive.
  ///
  /// In en, this message translates to:
  /// **'ACTIVE'**
  String get alarmStatusActive;

  /// No description provided for @alarmStatusAcknowledged.
  ///
  /// In en, this message translates to:
  /// **'ACKNOWLEDGED'**
  String get alarmStatusAcknowledged;

  /// No description provided for @alarmStatusResolved.
  ///
  /// In en, this message translates to:
  /// **'RESOLVED'**
  String get alarmStatusResolved;

  /// No description provided for @acknowledgeAlarm.
  ///
  /// In en, this message translates to:
  /// **'Acknowledge'**
  String get acknowledgeAlarm;

  /// No description provided for @acknowledgeNoteHint.
  ///
  /// In en, this message translates to:
  /// **'Optional operator note...'**
  String get acknowledgeNoteHint;

  /// No description provided for @alarmSafetyNote.
  ///
  /// In en, this message translates to:
  /// **'Alarms resolve automatically only when the PLC/Controller clears the fault condition.'**
  String get alarmSafetyNote;

  /// No description provided for @noAlarmsFound.
  ///
  /// In en, this message translates to:
  /// **'No alarms matching the current filter'**
  String get noAlarmsFound;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @markAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all read'**
  String get markAllRead;

  /// No description provided for @noNotifications.
  ///
  /// In en, this message translates to:
  /// **'No notifications yet'**
  String get noNotifications;

  /// No description provided for @vehiclesScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'Vehicles Management'**
  String get vehiclesScreenTitle;

  /// No description provided for @addVehicle.
  ///
  /// In en, this message translates to:
  /// **'Add Vehicle'**
  String get addVehicle;

  /// No description provided for @editVehicle.
  ///
  /// In en, this message translates to:
  /// **'Edit Vehicle'**
  String get editVehicle;

  /// No description provided for @deleteVehicle.
  ///
  /// In en, this message translates to:
  /// **'Delete Vehicle'**
  String get deleteVehicle;

  /// No description provided for @deleteVehicleConfirm.
  ///
  /// In en, this message translates to:
  /// **'Remove vehicle {plate} from the system?'**
  String deleteVehicleConfirm(String plate);

  /// No description provided for @vehicleBrand.
  ///
  /// In en, this message translates to:
  /// **'Brand (e.g. Toyota)'**
  String get vehicleBrand;

  /// No description provided for @vehicleModel.
  ///
  /// In en, this message translates to:
  /// **'Model (e.g. Camry)'**
  String get vehicleModel;

  /// No description provided for @vehicleColor.
  ///
  /// In en, this message translates to:
  /// **'Color'**
  String get vehicleColor;

  /// No description provided for @vehicleType.
  ///
  /// In en, this message translates to:
  /// **'Type (Sedan, SUV...)'**
  String get vehicleType;

  /// No description provided for @vehicleParkedBadge.
  ///
  /// In en, this message translates to:
  /// **'Parked in {space}'**
  String vehicleParkedBadge(String space);

  /// No description provided for @vehicleNotParkedBadge.
  ///
  /// In en, this message translates to:
  /// **'Outside Facility'**
  String get vehicleNotParkedBadge;

  /// No description provided for @vehicleHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Vehicle History — {plate}'**
  String vehicleHistoryTitle(String plate);

  /// No description provided for @historyScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'Operations & Event History'**
  String get historyScreenTitle;

  /// No description provided for @filterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get filterAll;

  /// No description provided for @filterPark.
  ///
  /// In en, this message translates to:
  /// **'Parking'**
  String get filterPark;

  /// No description provided for @filterRetrieve.
  ///
  /// In en, this message translates to:
  /// **'Retrieval'**
  String get filterRetrieve;

  /// No description provided for @filterEvent.
  ///
  /// In en, this message translates to:
  /// **'System Events'**
  String get filterEvent;

  /// No description provided for @filterAudit.
  ///
  /// In en, this message translates to:
  /// **'Audit Log'**
  String get filterAudit;

  /// No description provided for @searchPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Search plate, request #, actor...'**
  String get searchPlaceholder;

  /// No description provided for @exportCsv.
  ///
  /// In en, this message translates to:
  /// **'Export CSV'**
  String get exportCsv;

  /// No description provided for @dateRange.
  ///
  /// In en, this message translates to:
  /// **'Date Range'**
  String get dateRange;

  /// No description provided for @clearFilters.
  ///
  /// In en, this message translates to:
  /// **'Clear Filters'**
  String get clearFilters;

  /// No description provided for @profileAndSettingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile & System Settings'**
  String get profileAndSettingsTitle;

  /// No description provided for @profileSection.
  ///
  /// In en, this message translates to:
  /// **'Operator / User Profile'**
  String get profileSection;

  /// No description provided for @fullName.
  ///
  /// In en, this message translates to:
  /// **'Full Name'**
  String get fullName;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email Address'**
  String get email;

  /// No description provided for @phone.
  ///
  /// In en, this message translates to:
  /// **'Phone Number'**
  String get phone;

  /// No description provided for @roleLabel.
  ///
  /// In en, this message translates to:
  /// **'Assigned Role'**
  String get roleLabel;

  /// No description provided for @updateProfile.
  ///
  /// In en, this message translates to:
  /// **'Update Profile'**
  String get updateProfile;

  /// No description provided for @changePassword.
  ///
  /// In en, this message translates to:
  /// **'Change Password'**
  String get changePassword;

  /// No description provided for @currentPassword.
  ///
  /// In en, this message translates to:
  /// **'Current Password'**
  String get currentPassword;

  /// No description provided for @newPassword.
  ///
  /// In en, this message translates to:
  /// **'New Password'**
  String get newPassword;

  /// No description provided for @passwordPolicyHint.
  ///
  /// In en, this message translates to:
  /// **'Minimum 8 characters with uppercase, lowercase, and a digit'**
  String get passwordPolicyHint;

  /// No description provided for @securitySection.
  ///
  /// In en, this message translates to:
  /// **'Security & Biometrics'**
  String get securitySection;

  /// No description provided for @enableBiometric.
  ///
  /// In en, this message translates to:
  /// **'Unlock with Fingerprint / Face ID'**
  String get enableBiometric;

  /// No description provided for @notificationsSection.
  ///
  /// In en, this message translates to:
  /// **'Notification Preferences'**
  String get notificationsSection;

  /// No description provided for @notifyParking.
  ///
  /// In en, this message translates to:
  /// **'Parking & Retrieval Updates'**
  String get notifyParking;

  /// No description provided for @notifyAlarms.
  ///
  /// In en, this message translates to:
  /// **'Critical & Warning Alarms'**
  String get notifyAlarms;

  /// No description provided for @notifyMaintenance.
  ///
  /// In en, this message translates to:
  /// **'Maintenance Alerts'**
  String get notifyMaintenance;

  /// No description provided for @industrialConfigTitle.
  ///
  /// In en, this message translates to:
  /// **'Industrial Integration & Connection Settings'**
  String get industrialConfigTitle;

  /// No description provided for @industrialConfigSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Configure PLC/Controller protocol, IP, port, tags & backend host'**
  String get industrialConfigSubtitle;

  /// No description provided for @protocolLabel.
  ///
  /// In en, this message translates to:
  /// **'Adapter Protocol'**
  String get protocolLabel;

  /// No description provided for @plcHostLabel.
  ///
  /// In en, this message translates to:
  /// **'Controller / PLC IP or Host'**
  String get plcHostLabel;

  /// No description provided for @plcPortLabel.
  ///
  /// In en, this message translates to:
  /// **'Port'**
  String get plcPortLabel;

  /// No description provided for @plcModelLabel.
  ///
  /// In en, this message translates to:
  /// **'PLC Model'**
  String get plcModelLabel;

  /// No description provided for @rackLabel.
  ///
  /// In en, this message translates to:
  /// **'Rack'**
  String get rackLabel;

  /// No description provided for @slotLabel.
  ///
  /// In en, this message translates to:
  /// **'Slot'**
  String get slotLabel;

  /// No description provided for @opcuaEndpointLabel.
  ///
  /// In en, this message translates to:
  /// **'OPC UA Endpoint URL'**
  String get opcuaEndpointLabel;

  /// No description provided for @modbusUnitIdLabel.
  ///
  /// In en, this message translates to:
  /// **'Modbus Unit ID'**
  String get modbusUnitIdLabel;

  /// No description provided for @mqttUrlLabel.
  ///
  /// In en, this message translates to:
  /// **'MQTT Broker URL'**
  String get mqttUrlLabel;

  /// No description provided for @mqttTopicPrefixLabel.
  ///
  /// In en, this message translates to:
  /// **'MQTT Topic Prefix'**
  String get mqttTopicPrefixLabel;

  /// No description provided for @restBaseUrlLabel.
  ///
  /// In en, this message translates to:
  /// **'REST Gateway Base URL'**
  String get restBaseUrlLabel;

  /// No description provided for @pollIntervalLabel.
  ///
  /// In en, this message translates to:
  /// **'Poll Interval (ms)'**
  String get pollIntervalLabel;

  /// No description provided for @ackTimeoutLabel.
  ///
  /// In en, this message translates to:
  /// **'Ack Timeout (ms)'**
  String get ackTimeoutLabel;

  /// No description provided for @completionTimeoutLabel.
  ///
  /// In en, this message translates to:
  /// **'Completion Timeout (ms)'**
  String get completionTimeoutLabel;

  /// No description provided for @heartbeatTimeoutLabel.
  ///
  /// In en, this message translates to:
  /// **'Heartbeat Timeout (ms)'**
  String get heartbeatTimeoutLabel;

  /// No description provided for @readOnlyModeToggle.
  ///
  /// In en, this message translates to:
  /// **'Read-Only Monitoring Mode (Block Write Commands)'**
  String get readOnlyModeToggle;

  /// No description provided for @idempotentCommandsToggle.
  ///
  /// In en, this message translates to:
  /// **'Supports Idempotent Command Retry'**
  String get idempotentCommandsToggle;

  /// No description provided for @tagMappingSection.
  ///
  /// In en, this message translates to:
  /// **'PLC / Controller Tag Map'**
  String get tagMappingSection;

  /// No description provided for @testIndustrialConnection.
  ///
  /// In en, this message translates to:
  /// **'Test PLC / Controller Link'**
  String get testIndustrialConnection;

  /// No description provided for @saveIndustrialConfig.
  ///
  /// In en, this message translates to:
  /// **'Apply & Reconnect Adapter'**
  String get saveIndustrialConfig;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Sign Out'**
  String get logout;

  /// No description provided for @logoutConfirm.
  ///
  /// In en, this message translates to:
  /// **'Sign out of your current Auto Park session?'**
  String get logoutConfirm;

  /// No description provided for @errSystemOffline.
  ///
  /// In en, this message translates to:
  /// **'System is currently offline. Control operations are blocked.'**
  String get errSystemOffline;

  /// No description provided for @errSystemNotReady.
  ///
  /// In en, this message translates to:
  /// **'Controller reports system is not ready.'**
  String get errSystemNotReady;

  /// No description provided for @errEmergencyStop.
  ///
  /// In en, this message translates to:
  /// **'Emergency Stop is active! Clear E-Stop on hardware before operating.'**
  String get errEmergencyStop;

  /// No description provided for @errSafetyInterlock.
  ///
  /// In en, this message translates to:
  /// **'Safety interlock violation detected. Operation blocked.'**
  String get errSafetyInterlock;

  /// No description provided for @errCriticalAlarm.
  ///
  /// In en, this message translates to:
  /// **'Active critical alarm prevents automated motion.'**
  String get errCriticalAlarm;

  /// No description provided for @errMachineBusy.
  ///
  /// In en, this message translates to:
  /// **'Machinery is currently executing another command.'**
  String get errMachineBusy;

  /// No description provided for @errDuplicateRequest.
  ///
  /// In en, this message translates to:
  /// **'This vehicle already has an active parking or retrieval request.'**
  String get errDuplicateRequest;

  /// No description provided for @errVehicleAlreadyParked.
  ///
  /// In en, this message translates to:
  /// **'Vehicle is already parked inside the facility.'**
  String get errVehicleAlreadyParked;

  /// No description provided for @errVehicleNotParked.
  ///
  /// In en, this message translates to:
  /// **'Vehicle is not currently parked in the facility.'**
  String get errVehicleNotParked;

  /// No description provided for @errNoSpaceAvailable.
  ///
  /// In en, this message translates to:
  /// **'No available parking spaces match the request.'**
  String get errNoSpaceAvailable;

  /// No description provided for @errVehicleNotFound.
  ///
  /// In en, this message translates to:
  /// **'Vehicle could not be found.'**
  String get errVehicleNotFound;

  /// No description provided for @errForbiddenVehicle.
  ///
  /// In en, this message translates to:
  /// **'You do not have permission to operate this vehicle.'**
  String get errForbiddenVehicle;

  /// No description provided for @errCommandAlreadySent.
  ///
  /// In en, this message translates to:
  /// **'Command has already been dispatched to the controller and cannot be cancelled.'**
  String get errCommandAlreadySent;

  /// No description provided for @errAccountLocked.
  ///
  /// In en, this message translates to:
  /// **'Account temporarily locked due to failed sign-in attempts. Try again in 15 minutes.'**
  String get errAccountLocked;

  /// No description provided for @errInvalidCredentials.
  ///
  /// In en, this message translates to:
  /// **'Invalid username/email or password.'**
  String get errInvalidCredentials;

  /// No description provided for @errGeneric.
  ///
  /// In en, this message translates to:
  /// **'Operation could not be completed. Please verify connection and try again.'**
  String get errGeneric;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {


  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar': return AppLocalizationsAr();
    case 'en': return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.'
  );
}

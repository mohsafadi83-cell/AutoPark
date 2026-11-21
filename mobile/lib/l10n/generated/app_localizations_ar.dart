import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appTitle => 'أوتو بارك';

  @override
  String get appSubtitle => 'نظام التحكم الآلي الذكي بالمواقف';

  @override
  String get companyName => 'أنظمة التنقل الصناعي الذكي';

  @override
  String get initializingSystem => 'جاري تهيئة قياسات النظام عن بُعد...';

  @override
  String get restoringSession => 'جاري استعادة جلسة المشغّل...';

  @override
  String get loginTitle => 'تسجيل الدخول';

  @override
  String get loginSubtitle => 'الدخول إلى مركز التحكم الآلي بالمواقف';

  @override
  String get usernameOrEmail => 'اسم المستخدم أو البريد الإلكتروني';

  @override
  String get usernameRequired => 'يرجى إدخال اسم المستخدم أو البريد الإلكتروني';

  @override
  String get password => 'كلمة المرور';

  @override
  String get passwordRequired => 'يرجى إدخال كلمة المرور';

  @override
  String get rememberMe => 'تذكرني على هذا الجهاز';

  @override
  String get forgotPassword => 'هل نسيت كلمة المرور؟';

  @override
  String get forgotPasswordTitle => 'المساعدة في إعادة تعيين كلمة المرور';

  @override
  String get forgotPasswordBody => 'للامتثال لمعايير السلامة والأمن في بيئات التحكم الصناعي، يجب إعادة تعيين كلمات المرور بواسطة مسؤول النظام عبر لوحة إدارة المستخدمين.';

  @override
  String get signIn => 'تسجيل الدخول';

  @override
  String get biometricSignIn => 'الدخول بالبصمة / الهوية الحيوية';

  @override
  String get biometricReason => 'يرجى المصادقة لفتح جلسة أوتو بارك';

  @override
  String get serverSettings => 'إعدادات اتصال الخادم';

  @override
  String get serverUrl => 'عنوان خادم النظام (Backend URL)';

  @override
  String get serverUrlHint => 'http://192.168.1.100:3000';

  @override
  String get serverUrlHelper => 'العنوان الأساسي لخادم واجهة برمجة التطبيقات والبث الفوري (WebSocket).';

  @override
  String get invalidServerUrl => 'يرجى إدخال عنوان خادم صحيح يبدأ بـ http:// أو https://';

  @override
  String get testConnection => 'اختبار الاتصال';

  @override
  String connectionSuccess(String mode, String adapter) {
    return 'تم الاتصال بالخادم ($mode / $adapter)';
  }

  @override
  String get connectionFailed => 'تعذر الوصول إلى الخادم';

  @override
  String get resetDefault => 'استعادة الافتراضي';

  @override
  String get save => 'حفظ';

  @override
  String get cancel => 'إلغاء';

  @override
  String get close => 'إغلاق';

  @override
  String get confirm => 'تأكيد';

  @override
  String get retry => 'إعادة المحاولة';

  @override
  String get refresh => 'تحديث';

  @override
  String get loading => 'جاري التحميل...';

  @override
  String get demoAccounts => 'حسابات تجريبية سريعة';

  @override
  String get language => 'اللغة';

  @override
  String get arabic => 'العربية';

  @override
  String get english => 'English';

  @override
  String get theme => 'المظهر';

  @override
  String get darkMode => 'داكن صناعي';

  @override
  String get lightMode => 'فاتح ذكي';

  @override
  String get systemTheme => 'تلقائي حسب النظام';

  @override
  String get navDashboard => 'الرئيسية';

  @override
  String get navMap => 'الخريطة';

  @override
  String get navOperations => 'إيقاف / استرجاع';

  @override
  String get navAlarms => 'الإنذارات';

  @override
  String get navMore => 'التحكم والحساب';

  @override
  String get systemStatusOnline => 'النظام متصل وجاهز';

  @override
  String get systemStatusWarning => 'تحذير في النظام';

  @override
  String get systemStatusError => 'عطل في النظام';

  @override
  String get systemStatusOffline => 'النظام غير متصل';

  @override
  String get controllerConnected => 'المتحكم متصل';

  @override
  String get controllerDisconnected => 'المتحكم غير متصل';

  @override
  String get plcConnected => 'وحدة PLC متصلة';

  @override
  String get plcDisconnected => 'وحدة PLC مفصولة';

  @override
  String get emergencyStopActive => 'توقف الطوارئ مفعّل!';

  @override
  String get emergencyStopClear => 'توقف الطوارئ سليم';

  @override
  String get safetyInterlocksOk => 'أقفال السلامة سليمة';

  @override
  String get safetyInterlocksFault => 'خلل في أقفال السلامة';

  @override
  String get systemReady => 'النظام جاهز للتشغيل';

  @override
  String get systemNotReady => 'النظام غير جاهز';

  @override
  String get modeSimulation => 'وضع المحاكاة (SIMULATION)';

  @override
  String get modeProduction => 'الوضع التشغيلي الفعلي (PRODUCTION)';

  @override
  String get cachedDataNotice => 'عرض بيانات مخزنة مؤقتاً للقراءة فقط — أوامر التحكم معطلة';

  @override
  String get networkOfflineBanner => 'لا يوجد اتصال بالشبكة — تم تعطيل أوامر التحكم حفاظاً على السلامة';

  @override
  String get backendUnreachableBanner => 'تعذر الاتصال بالخادم — يتم عرض آخر بيانات مخزنة';

  @override
  String get controllerOfflineBanner => 'المتحكم الصناعي غير متصل — تم حظر أوامر الإيقاف والاسترجاع';

  @override
  String get totalSpaces => 'إجمالي المواقف';

  @override
  String get availableSpaces => 'متاح';

  @override
  String get occupiedSpaces => 'مشغول';

  @override
  String get reservedSpaces => 'محجوز';

  @override
  String get movingVehicles => 'قيد الحركة';

  @override
  String get blockedSpaces => 'محظور / عطل';

  @override
  String get activeAlarmsCount => 'إنذارات نشطة';

  @override
  String get systemHealth => 'صحة النظام';

  @override
  String get quickActions => 'عمليات سريعة';

  @override
  String get requestParkAction => 'طلب إيقاف مركبة';

  @override
  String get requestRetrieveAction => 'استرجاع مركبة';

  @override
  String get openMapAction => 'خريطة المواقف';

  @override
  String get liveMonitoringAction => 'المراقبة الحية';

  @override
  String get activeRequestsTitle => 'العمليات الجارية حالياً';

  @override
  String get noActiveRequests => 'لا توجد عمليات إيقاف أو استرجاع جارية حالياً';

  @override
  String get simulationLab => 'تحكم سيناريوهات المحاكاة';

  @override
  String get triggerScenario => 'تطبيق السيناريو';

  @override
  String get parkScreenTitle => 'طلب إيقاف مركبة آلياً';

  @override
  String get retrieveScreenTitle => 'استرجاع مركبة متوقفة';

  @override
  String get selectVehicle => 'اختر مركبة مسجلة';

  @override
  String get enterPlateManual => 'أو أدخل رقم اللوحة يدوياً (للموظفين)';

  @override
  String get plateNumber => 'رقم لوحة المركبة';

  @override
  String get plateNumberRequired => 'يرجى اختيار مركبة أو إدخال رقم اللوحة';

  @override
  String get noAvailableVehiclesToPark => 'جميع مركباتك المسجلة متوقفة بالفعل أو لديها طلب جارٍ.';

  @override
  String get noParkedVehiclesToRetrieve => 'لا توجد مركبات متوقفة حالياً جاهزة للاسترجاع.';

  @override
  String get confirmOperationTitle => 'تأكيد أمر التشغيل الصناعي';

  @override
  String get operationType => 'نوع العملية';

  @override
  String get operationPark => 'إيقاف مركبة (PARK)';

  @override
  String get operationRetrieve => 'استرجاع مركبة (RETRIEVE)';

  @override
  String get estimatedStatus => 'جاهزية النظام';

  @override
  String get readyForDispatch => 'جاهز — تم التحقق من المتحكم وأقفال السلامة';

  @override
  String get submitRequest => 'إرسال الأمر للمتحكم';

  @override
  String get cancelRequest => 'إلغاء الطلب';

  @override
  String get cancelRequestConfirm => 'هل تريد إلغاء هذا الطلب قبل إرسال الأمر للمتحكم الصناعي؟';

  @override
  String get commandAlreadySentNote => 'تم إرسال الأمر بالفعل للمتحكم الصناعي — لا يمكن الإلغاء';

  @override
  String get assignedSpace => 'الموقف المخصص';

  @override
  String get requestNumberLabel => 'رقم الطلب';

  @override
  String get liveProgressTitle => 'متابعة خطوات التنفيذ الحية';

  @override
  String get stepCreated => 'تم إنشاء الطلب';

  @override
  String get stepValidated => 'تم التحقق من السلامة والموقف';

  @override
  String get stepApproved => 'تمت الموافقة على العملية';

  @override
  String get stepCommandSent => 'تم إرسال الأمر للمتحكم';

  @override
  String get stepControllerConfirmed => 'تأكيد استلام المتحكم';

  @override
  String get stepVehicleMoving => 'جاري نقل المركبة عبر المنصة';

  @override
  String get stepParkingCompleted => 'اكتمل الإيقاف بتأكيد المتحكم';

  @override
  String get stepVehicleLocated => 'تم تحديد موقع المركبة';

  @override
  String get stepPreparingSystem => 'جاري تجهيز الرافعة والناقل';

  @override
  String get stepPlatformMoving => 'المنصة قيد الحركة';

  @override
  String get stepRetrievalInProgress => 'جاري استرجاع المركبة';

  @override
  String get stepVehicleReady => 'المركبة جاهزة في بوابة الخروج';

  @override
  String get reqStatusPending => 'قيد الانتظار';

  @override
  String get reqStatusValidating => 'جاري التحقق';

  @override
  String get reqStatusApproved => 'معتمد';

  @override
  String get reqStatusProcessing => 'قيد المعالجة';

  @override
  String get reqStatusInProgress => 'قيد التنفيذ';

  @override
  String get reqStatusCompleted => 'مكتمل';

  @override
  String get reqStatusFailed => 'فشل التنفيذ';

  @override
  String get reqStatusCancelled => 'ملغى';

  @override
  String get mapScreenTitle => 'الخريطة التفاعلية للمواقف';

  @override
  String get allLevels => 'جميع الطوابق';

  @override
  String levelLabel(int level) {
    return 'الطابق $level';
  }

  @override
  String get allZones => 'جميع المناطق';

  @override
  String zoneLabel(String zone) {
    return 'منطقة $zone';
  }

  @override
  String get allStatuses => 'جميع الحالات';

  @override
  String get spaceAvailable => 'متاح';

  @override
  String get spaceOccupied => 'مشغول';

  @override
  String get spaceReserved => 'محجوز';

  @override
  String get spaceMoving => 'قيد الحركة';

  @override
  String get spaceBlocked => 'محظور';

  @override
  String get spaceMaintenance => 'صيانة';

  @override
  String get spaceError => 'عطل';

  @override
  String spaceDetailsTitle(String spaceNumber) {
    return 'موقف $spaceNumber';
  }

  @override
  String get monitoringScreenTitle => 'المراقبة الحية للنظام الصناعي';

  @override
  String get plcStatus => 'اتصال وحدة PLC';

  @override
  String get controllerStatus => 'ارتباط المتحكم';

  @override
  String get machineState => 'حالة الآلة';

  @override
  String get heartbeatStatus => 'نبض النظام (Heartbeat)';

  @override
  String heartbeatAge(int ms) {
    return 'منذ $ms مللي ثانية';
  }

  @override
  String get safetyInterlocks => 'أقفال السلامة (Safety)';

  @override
  String get emergencyStop => 'توقف الطوارئ (E-Stop)';

  @override
  String get communicationHealth => 'حالة الاتصال الصناعي';

  @override
  String get adapterProtocol => 'بروتوكول الربط';

  @override
  String get activeCommand => 'الأمر النشط حالياً';

  @override
  String get lastTelemetryUpdate => 'آخر تحديث للقياسات';

  @override
  String get alarmsScreenTitle => 'إنذارات النظام';

  @override
  String get activeAlarmsTab => 'النشطة / غير المحلولة';

  @override
  String get allAlarmsTab => 'سجل جميع الإنذارات';

  @override
  String get severityInfo => 'معلومات';

  @override
  String get severityWarning => 'تحذير';

  @override
  String get severityCritical => 'حرج';

  @override
  String get severityEmergency => 'طوارئ';

  @override
  String get alarmStatusActive => 'نشط';

  @override
  String get alarmStatusAcknowledged => 'تم الإقرار';

  @override
  String get alarmStatusResolved => 'تم الحل';

  @override
  String get acknowledgeAlarm => 'إقرار الاستلام (Acknowledge)';

  @override
  String get acknowledgeNoteHint => 'ملاحظة المشغّل (اختياري)...';

  @override
  String get alarmSafetyNote => 'يتم إغلاق الإنذارات تلقائياً فقط عندما يزول سبب العطل من وحدة PLC / المتحكم.';

  @override
  String get noAlarmsFound => 'لا توجد إنذارات مطابقة للتصفية الحالية';

  @override
  String get notificationsTitle => 'الإشعارات';

  @override
  String get markAllRead => 'تحديد الكل كمقروء';

  @override
  String get noNotifications => 'لا توجد إشعارات حالياً';

  @override
  String get vehiclesScreenTitle => 'إدارة المركبات';

  @override
  String get addVehicle => 'إضافة مركبة';

  @override
  String get editVehicle => 'تعديل المركبة';

  @override
  String get deleteVehicle => 'حذف المركبة';

  @override
  String deleteVehicleConfirm(String plate) {
    return 'هل أنت متأكد من حذف المركبة $plate؟';
  }

  @override
  String get vehicleBrand => 'الشركة المصنعة (مثال: تويوتا)';

  @override
  String get vehicleModel => 'الطراز (مثال: كامري)';

  @override
  String get vehicleColor => 'اللون';

  @override
  String get vehicleType => 'النوع (سيدان، دفع رباعي...)';

  @override
  String vehicleParkedBadge(String space) {
    return 'متوقفة في $space';
  }

  @override
  String get vehicleNotParkedBadge => 'خارج المبنى';

  @override
  String vehicleHistoryTitle(String plate) {
    return 'سجل عمليات المركبة — $plate';
  }

  @override
  String get historyScreenTitle => 'سجل العمليات والأحداث';

  @override
  String get filterAll => 'الكل';

  @override
  String get filterPark => 'إيقاف';

  @override
  String get filterRetrieve => 'استرجاع';

  @override
  String get filterEvent => 'أحداث النظام';

  @override
  String get filterAudit => 'سجل التدقيق';

  @override
  String get searchPlaceholder => 'بحث برقم اللوحة، رقم الطلب، المستخدم...';

  @override
  String get exportCsv => 'تصدير CSV';

  @override
  String get dateRange => 'الفترة الزمنية';

  @override
  String get clearFilters => 'مسح التصفية';

  @override
  String get profileAndSettingsTitle => 'الملف الشخصي وإعدادات النظام';

  @override
  String get profileSection => 'بيانات المشغّل / المستخدم';

  @override
  String get fullName => 'الاسم الكامل';

  @override
  String get email => 'البريد الإلكتروني';

  @override
  String get phone => 'رقم الهاتف';

  @override
  String get roleLabel => 'الدور الوظيفي';

  @override
  String get updateProfile => 'تحديث البيانات';

  @override
  String get changePassword => 'تغيير كلمة المرور';

  @override
  String get currentPassword => 'كلمة المرور الحالية';

  @override
  String get newPassword => 'كلمة المرور الجديدة';

  @override
  String get passwordPolicyHint => '8 أحرف على الأقل تتضمن حرفاً كبيراً وصغيراً ورقماً';

  @override
  String get securitySection => 'الأمان والدخول الحيوي';

  @override
  String get enableBiometric => 'تفعيل الدخول بالبصمة / التعرف على الوجه';

  @override
  String get notificationsSection => 'تفضيلات الإشعارات';

  @override
  String get notifyParking => 'تحديثات الإيقاف والاسترجاع';

  @override
  String get notifyAlarms => 'الإنذارات الحرجة والتحذيرات';

  @override
  String get notifyMaintenance => 'تنبيهات الصيانة';

  @override
  String get industrialConfigTitle => 'إعدادات الربط الصناعي والاتصال (PLC / Controller)';

  @override
  String get industrialConfigSubtitle => 'تهيئة بروتوكول المتحكم وعنوان IP والمنفذ وعناوين الذاكرة (Tags) وعنوان الخادم';

  @override
  String get protocolLabel => 'بروتوكول الاتصال الصناعي';

  @override
  String get plcHostLabel => 'عنوان IP أو المضيف للمتحكم / PLC';

  @override
  String get plcPortLabel => 'المنفذ (Port)';

  @override
  String get plcModelLabel => 'طراز وحدة PLC';

  @override
  String get rackLabel => 'الرف (Rack)';

  @override
  String get slotLabel => 'الفتحة (Slot)';

  @override
  String get opcuaEndpointLabel => 'رابط نقطة نهاية OPC UA';

  @override
  String get modbusUnitIdLabel => 'معرف وحدة Modbus (Unit ID)';

  @override
  String get mqttUrlLabel => 'عنوان وسيط MQTT';

  @override
  String get mqttTopicPrefixLabel => 'بادئة مواضيع MQTT';

  @override
  String get restBaseUrlLabel => 'عنوان بوابة REST';

  @override
  String get pollIntervalLabel => 'فترة الاستطلاع (مللي ثانية)';

  @override
  String get ackTimeoutLabel => 'مهلة تأكيد الاستلام (مللي ثانية)';

  @override
  String get completionTimeoutLabel => 'مهلة إتمام العملية (مللي ثانية)';

  @override
  String get heartbeatTimeoutLabel => 'مهلة نبض النظام (مللي ثانية)';

  @override
  String get readOnlyModeToggle => 'وضع المراقبة للقراءة فقط (حظر أوامر الكتابة والتحريك)';

  @override
  String get idempotentCommandsToggle => 'دعم الأوامر غير المتكررة (Idempotent Commands)';

  @override
  String get tagMappingSection => 'خريطة عناوين الذاكرة (PLC Tag Map)';

  @override
  String get testIndustrialConnection => 'اختبار اتصال المتحكم / PLC';

  @override
  String get saveIndustrialConfig => 'حفظ وإعادة ربط المحول الصناعي';

  @override
  String get logout => 'تسجيل الخروج';

  @override
  String get logoutConfirm => 'هل تريد تسجيل الخروج من جلسة أوتو بارك الحالية؟';

  @override
  String get errSystemOffline => 'النظام غير متصل حالياً. تم حظر أوامر التشغيل.';

  @override
  String get errSystemNotReady => 'المتحكم يفيد بأن النظام غير جاهز للتشغيل.';

  @override
  String get errEmergencyStop => 'توقف الطوارئ مفعّل! يجب تحرير زر الطوارئ المادي أولاً.';

  @override
  String get errSafetyInterlock => 'تم رصد خلل في أقفال السلامة. تم حظر العملية.';

  @override
  String get errCriticalAlarm => 'يوجد إنذار حرج نشط يمنع الحركة الآلية.';

  @override
  String get errMachineBusy => 'الآلة مشغولة حالياً بتنفيذ أمر آخر.';

  @override
  String get errDuplicateRequest => 'توجد عملية نشطة بالفعل لهذه المركبة.';

  @override
  String get errVehicleAlreadyParked => 'المركبة متوقفة بالفعل داخل المبنى.';

  @override
  String get errVehicleNotParked => 'المركبة غير متوقفة حالياً داخل المبنى.';

  @override
  String get errNoSpaceAvailable => 'لا توجد مواقف متاحة حالياً.';

  @override
  String get errVehicleNotFound => 'لم يتم العثور على المركبة.';

  @override
  String get errForbiddenVehicle => 'ليست لديك صلاحية تشغيل هذه المركبة.';

  @override
  String get errCommandAlreadySent => 'تم إرسال الأمر بالفعل للمتحكم ولا يمكن إلغاؤه.';

  @override
  String get errAccountLocked => 'تم قفل الحساب مؤقتاً بسبب محاولات دخول فاشلة. حاول بعد 15 دقيقة.';

  @override
  String get errInvalidCredentials => 'اسم المستخدم أو كلمة المرور غير صحيحة.';

  @override
  String get errGeneric => 'تعذر إتمام العملية. يرجى التحقق من الاتصال والمحاولة مرة أخرى.';
}

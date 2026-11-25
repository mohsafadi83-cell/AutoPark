import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_error.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';

/// Full PLC Manual Control & Live Sensors Screen.
/// Mirrors the exact behavior of the desktop AutoPark.exe ManualMaintenancePage + SensorMonitorPage:
/// - Mode switch (Auto Mode <-> Manual Mode with confirmation & automatic output release on exit)
/// - Rows 1-3: Toggle ON/OFF (Pump, UP, DOWN, Wall, Cutoff, Allow Wall, Stopper S1-S4 with M0.3)
/// - Row 4: Momentary Press & Hold (Lane L1-L4 driving lane bit + M0.3 + M0.4 Accept_action_manual)
/// - Protected Slot Occupancy Reset (L11-L43) & Periodic Maintenance Counter Reset
/// - Merged Live PLC Sensors (8 safety cards, 32 physical inputs I0.0-I3.7, 4x3 limit switch matrix)
class ManualPlcControlScreen extends ConsumerStatefulWidget {
  const ManualPlcControlScreen({super.key});

  @override
  ConsumerState<ManualPlcControlScreen> createState() =>
      _ManualPlcControlScreenState();
}

class _ManualPlcControlScreenState
    extends ConsumerState<ManualPlcControlScreen> {
  bool _manualEnabled = false;
  bool _modeBusy = false;
  String? _activeMomentaryKey;
  final Map<String, bool> _toggleStates = <String, bool>{
    'man_pump_tag': false,
    'man_up_tag': false,
    'man_down_tag': false,
    'man_wall_tag': false,
    'man_cutoff_tag': false,
    'allow_wall_tag': false,
    'man_s1_tag': false,
    'man_s2_tag': false,
    'man_s3_tag': false,
    'man_s4_tag': false,
  };

  String _statusLine = '';
  Color _statusColor = AppColors.statusOffline;

  Map<String, dynamic>? _sensors;
  bool _loadingSensors = false;
  Timer? _sensorTimer;

  static const _stopperKeys = <String>{
    'man_s1_tag',
    'man_s2_tag',
    'man_s3_tag',
    'man_s4_tag',
  };

  static const _allManualOutputKeys = <String>[
    'man_pump_tag',
    'man_up_tag',
    'man_down_tag',
    'man_wall_tag',
    'man_cutoff_tag',
    'allow_wall_tag',
    'man_s1_tag',
    'man_s2_tag',
    'man_s3_tag',
    'man_s4_tag',
    'man_l1_tag',
    'man_l2_tag',
    'man_l3_tag',
    'man_l4_tag',
  ];

  bool get _hasAnyActiveStopper =>
      _stopperKeys.any((k) => _toggleStates[k] == true);

  bool get _hasAnyActiveToggle => _toggleStates.values.any((v) => v);

  @override
  void initState() {
    super.initState();
    _pollSensors();
    _sensorTimer = Timer.periodic(
      const Duration(milliseconds: 1500),
      (_) => _pollSensors(),
    );
  }

  @override
  void dispose() {
    _sensorTimer?.cancel();
    if (_activeMomentaryKey != null || _hasAnyActiveToggle || _manualEnabled) {
      _cleanupOutputsOnDispose();
    }
    super.dispose();
  }

  void _cleanupOutputsOnDispose() {
    final notifier = ref.read(appControllerProvider.notifier);
    if (_activeMomentaryKey != null) {
      unawaited(
        notifier.sendManualControl(_activeMomentaryKey!, false).catchError((_) => const <String, dynamic>{}),
      );
      unawaited(
        notifier.writeLivePlcTag('M0.4', false).catchError((_) => const <String, dynamic>{}),
      );
    }
    for (final key in _allManualOutputKeys) {
      if (_toggleStates[key] == true) {
        unawaited(
          notifier.sendManualControl(key, false).catchError((_) => const <String, dynamic>{}),
        );
      }
    }
    unawaited(
      notifier.writeLivePlcTag('M0.3', false).catchError((_) => const <String, dynamic>{}),
    );
    if (_manualEnabled) {
      unawaited(
        notifier.sendManualControl('manual_mode_tag', false).catchError((_) => const <String, dynamic>{}),
      );
    }
  }

  Future<void> _pollSensors() async {
    if (_loadingSensors || !mounted) return;
    final appState = ref.read(appControllerProvider);
    if (!appState.networkOnline) return;
    _loadingSensors = true;
    try {
      final data =
          await ref.read(appControllerProvider.notifier).fetchLiveSensors();
      if (mounted) {
        setState(() => _sensors = data);
        // Safety guard: if E-Stop activates while manual outputs are on, release them immediately.
        final isEStop = (data['emergencyStop'] == true) ||
            (appState.systemStatus?.emergencyStop ?? false);
        if (isEStop && (_activeMomentaryKey != null || _hasAnyActiveToggle)) {
          await _releaseAllOutputs(
            isAr: appState.locale.languageCode == 'ar',
            reasonEn: 'Emergency Stop activated — all manual outputs halted!',
            reasonAr: 'تم تفعيل إيقاف الطوارئ — إيقاف جميع المخارج اليدوية فوراً!',
          );
        }
      }
    } catch (_) {
      // Keep last sensor snapshot during transient network blips
    } finally {
      _loadingSensors = false;
    }
  }

  Future<void> _setManualMode(bool enable, bool isAr) async {
    if (_modeBusy || _manualEnabled == enable) return;
    final appState = ref.read(appControllerProvider);
    final isEStop = (appState.systemStatus?.emergencyStop ?? false) ||
        (_sensors?['emergencyStop'] == true);

    if (enable && isEStop) {
      _showToast(
        isAr
            ? '🔴 ممنوع تفعيل الوضع اليدوي أثناء تفعيل إيقاف الطوارئ!'
            : '🔴 Cannot enter Manual Mode while Emergency Stop is active!',
        isError: true,
      );
      return;
    }

    if (enable) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Row(
            children: [
              const Icon(Icons.engineering_rounded, color: AppColors.statusWarning),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  isAr ? 'تفعيل الوضع اليدوي (Manual Mode)' : 'Enable Manual PLC Mode',
                ),
              ),
            ],
          ),
          content: Text(
            isAr
                ? 'سيتم تحويل لوحة الـ PLC إلى الوضع اليدوي (manual_mode_tag = ON) لتشغيل المضخة والمصعد والصمامات والمسارات مباشرة.\n\nتأكد من خلو الموقف والمصاعد قبل المتابعة.'
                : 'This switches the PLC into Manual Maintenance Mode (manual_mode_tag = ON) for direct pump, lift, valve, stopper, and lane control.\n\nVerify all bays and lifts are clear before proceeding.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(isAr ? 'إلغاء' : 'Cancel'),
            ),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.statusWarning,
                foregroundColor: Colors.black,
              ),
              onPressed: () => Navigator.of(ctx).pop(true),
              icon: const Icon(Icons.handyman_rounded, size: 18),
              label: Text(
                isAr ? 'تفعيل الوضع اليدوي' : 'Enable Manual Mode',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }

    setState(() => _modeBusy = true);
    try {
      final notifier = ref.read(appControllerProvider.notifier);
      if (!enable && (_activeMomentaryKey != null || _hasAnyActiveToggle)) {
        await _releaseAllOutputs(
          isAr: isAr,
          reasonEn: 'Switching back to Auto Mode — all outputs released',
          reasonAr: 'العودة للوضع التلقائي — تم إيقاف جميع المخارج',
        );
      }
      await notifier.sendManualControl('manual_mode_tag', enable);
      HapticFeedback.mediumImpact();
      if (!mounted) return;
      setState(() {
        _manualEnabled = enable;
        _statusLine = enable
            ? (isAr
                ? '🟡 الوضع اليدوي مفعّل (Manual Mode) — الصفوف 1–3 تبديل | المسارات L1–L4 ضغط مستمر'
                : '🟡 Manual Mode ACTIVE — Rows 1–3 Toggle | Lanes L1–L4 Press & Hold')
            : (isAr
                ? '🟢 الوضع التلقائي (Auto Mode) — جميع أزرار الصيانة اليدوية مقفلة بأمان'
                : '🟢 Auto Mode — Manual maintenance controls safely locked');
        _statusColor =
            enable ? AppColors.statusWarning : AppColors.statusOnline;
      });
    } on ApiError catch (e) {
      if (!mounted) return;
      _showToast(e.localizedMessage(AppLocalizations.of(context)), isError: true);
    } catch (_) {
      if (!mounted) return;
      _showToast(
        isAr ? 'تعذر تبديل وضع الـ PLC — تحقق من الاتصال' : 'Failed to switch PLC mode — check connection',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _modeBusy = false);
    }
  }

  Future<void> _toggleControl(String controlKey, String label, bool isAr) async {
    if (!_manualEnabled) return;
    final appState = ref.read(appControllerProvider);
    final isEStop = (appState.systemStatus?.emergencyStop ?? false) ||
        (_sensors?['emergencyStop'] == true);
    if (isEStop) {
      setState(() {
        _statusLine = isAr
            ? '🔴 ممنوع التشغيل اليدوي أثناء تفعيل إيقاف الطوارئ!'
            : '🔴 Manual operation blocked while Emergency Stop is active!';
        _statusColor = AppColors.statusError;
      });
      return;
    }
    if (appState.connectionPhase == ConnectionPhase.offline) {
      _showToast(
        isAr ? 'غير متصل بالسيرفر — تم حظر الأمر اليدوي' : 'Offline — manual command blocked',
        isError: true,
      );
      return;
    }

    final nextState = !(_toggleStates[controlKey] ?? false);
    setState(() {
      // Exact desktop hydraulic UP/DOWN + Cutoff interlock synchronization
      if (nextState && controlKey == 'man_up_tag') {
        _toggleStates['man_down_tag'] = false;
        _toggleStates['man_cutoff_tag'] = false;
      } else if (nextState && controlKey == 'man_down_tag') {
        _toggleStates['man_up_tag'] = false;
        _toggleStates['man_pump_tag'] = false;
        _toggleStates['man_cutoff_tag'] = false;
      }
      _toggleStates[controlKey] = nextState;
      _statusLine = nextState
          ? (isAr
              ? '🟢 تم التشغيل (ON = 1): $label ($controlKey)'
              : '🟢 Toggled ON (1): $label ($controlKey)')
          : (isAr
              ? '⚪ تم الإيقاف (OFF = 0): $label ($controlKey)'
              : '⚪ Toggled OFF (0): $label ($controlKey)');
      _statusColor = nextState ? AppColors.statusOnline : AppColors.statusOffline;
    });
    HapticFeedback.selectionClick();

    final notifier = ref.read(appControllerProvider.notifier);
    final isStopper = _stopperKeys.contains(controlKey);
    final m03State = _hasAnyActiveStopper || (_activeMomentaryKey != null);

    try {
      await notifier.sendManualControl(controlKey, nextState);
      if (isStopper) {
        await notifier.writeLivePlcTag('M0.3', m03State).catchError((_) => const <String, dynamic>{});
      }
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() => _toggleStates[controlKey] = !nextState);
      _showToast(e.localizedMessage(AppLocalizations.of(context)), isError: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _toggleStates[controlKey] = !nextState);
      _showToast(
        isAr ? 'فشل إرسال الأمر اليدوي ($controlKey)' : 'Failed sending manual command ($controlKey)',
        isError: true,
      );
    }
  }

  Future<void> _startMomentary(String controlKey, String label, bool isAr) async {
    if (!_manualEnabled) return;
    final appState = ref.read(appControllerProvider);
    final isEStop = (appState.systemStatus?.emergencyStop ?? false) ||
        (_sensors?['emergencyStop'] == true);
    if (isEStop) {
      setState(() {
        _statusLine = isAr
            ? '🔴 ممنوع التشغيل اليدوي أثناء تفعيل إيقاف الطوارئ!'
            : '🔴 Manual operation blocked while Emergency Stop is active!';
        _statusColor = AppColors.statusError;
      });
      return;
    }
    if (appState.connectionPhase == ConnectionPhase.offline) {
      _showToast(
        isAr ? 'غير متصل بالسيرفر — تم حظر التشغيل اللحظي' : 'Offline — momentary hold blocked',
        isError: true,
      );
      return;
    }

    if (_activeMomentaryKey != null && _activeMomentaryKey != controlKey) {
      await _releaseMomentary(_activeMomentaryKey!, _activeMomentaryKey!, isAr);
    }

    setState(() {
      _activeMomentaryKey = controlKey;
      _statusLine = isAr
          ? '🟡 تشغيل لحظي نشط (Hold): $label ($controlKey = 1 + M0.3 + M0.4)'
          : '🟡 Momentary ACTIVE (Hold): $label ($controlKey = 1 + M0.3 + M0.4)';
      _statusColor = AppColors.statusWarning;
    });
    HapticFeedback.mediumImpact();

    final notifier = ref.read(appControllerProvider.notifier);
    try {
      await notifier.sendManualControl(controlKey, true);
      await notifier.writeLivePlcTag('M0.3', true).catchError((_) => const <String, dynamic>{});
      await notifier.writeLivePlcTag('M0.4', true).catchError((_) => const <String, dynamic>{});
    } catch (_) {
      if (mounted) {
        await _releaseMomentary(controlKey, label, isAr);
      }
    }
  }

  Future<void> _releaseMomentary(String controlKey, String label, bool isAr) async {
    if (_activeMomentaryKey != controlKey) return;
    final keepM03 = _hasAnyActiveStopper;
    if (mounted) {
      setState(() {
        _activeMomentaryKey = null;
        _statusLine = isAr
            ? '🟢 تم إفلات الزر اللحظي (0): $label (M0.4 = 0)'
            : '🟢 Momentary released (0): $label (M0.4 = 0)';
        _statusColor = AppColors.statusOnline;
      });
    } else {
      _activeMomentaryKey = null;
    }

    final notifier = ref.read(appControllerProvider.notifier);
    await notifier.sendManualControl(controlKey, false).catchError((_) => const <String, dynamic>{});
    await notifier.writeLivePlcTag('M0.4', false).catchError((_) => const <String, dynamic>{});
    await notifier.writeLivePlcTag('M0.3', keepM03).catchError((_) => const <String, dynamic>{});
  }

  Future<void> _releaseAllOutputs({
    required bool isAr,
    required String reasonEn,
    required String reasonAr,
  }) async {
    final activeMomentary = _activeMomentaryKey;
    final activeToggles = _toggleStates.entries
        .where((e) => e.value)
        .map((e) => e.key)
        .toList();

    if (mounted) {
      setState(() {
        _activeMomentaryKey = null;
        for (final k in _toggleStates.keys) {
          _toggleStates[k] = false;
        }
        _statusLine = '🛑 ${isAr ? reasonAr : reasonEn}';
        _statusColor = AppColors.statusError;
      });
    }
    HapticFeedback.heavyImpact();

    final notifier = ref.read(appControllerProvider.notifier);
    final futures = <Future<dynamic>>[
      notifier.writeLivePlcTag('M0.4', false).catchError((_) => const <String, dynamic>{}),
      notifier.writeLivePlcTag('M0.3', false).catchError((_) => const <String, dynamic>{}),
    ];
    if (activeMomentary != null) {
      futures.add(
        notifier.sendManualControl(activeMomentary, false).catchError((_) => const <String, dynamic>{}),
      );
    }
    for (final k in activeToggles) {
      futures.add(
        notifier.sendManualControl(k, false).catchError((_) => const <String, dynamic>{}),
      );
    }
    await Future.wait(futures);
  }

  Future<void> _confirmResetSlot(String slotCode, bool isAr) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          isAr ? 'تأكيد تصفير الموقف $slotCode' : 'Confirm Reset Slot $slotCode',
          style: const TextStyle(color: AppColors.statusError, fontWeight: FontWeight.w800),
        ),
        content: Text(
          isAr
              ? 'هل أنت متأكد من تصفير حالة إشغال الموقف $slotCode في الـ PLC؟\nاستخدم هذا الإجراء فقط بعد التأكد بصرياً من أن الموقف فارغ تماماً.'
              : 'Are you sure you want to reset occupancy for bay $slotCode in the PLC?\nOnly use this after visually confirming the bay is completely empty.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(isAr ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.statusError,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(isAr ? 'تأكيد التصفير' : 'Reset Slot'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref
          .read(appControllerProvider.notifier)
          .sendManualControl('reset_${slotCode.toLowerCase()}_tag', true);
      if (!mounted) return;
      _showToast(
        isAr ? '✅ تم إرسال أمر تصفير الموقف $slotCode' : '✅ Reset command sent for slot $slotCode',
      );
    } catch (e) {
      if (!mounted) return;
      _showToast(
        isAr ? 'تعذر تصفير الموقف $slotCode: $e' : 'Failed to reset slot $slotCode: $e',
        isError: true,
      );
    }
  }

  Future<void> _confirmResetMaintenance(bool isAr) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          isAr ? 'تصفير عداد الصيانة الدورية' : 'Reset Periodic Maintenance Counter',
        ),
        content: Text(
          isAr
              ? 'هل تم تنفيذ فحوصات الصيانة الدورية وتريد بدء فترة صيانة جديدة (New_Maintanence_period)؟'
              : 'Confirm periodic machine maintenance is complete and start a new maintenance period (New_Maintanence_period)?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(isAr ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.statusWarning,
              foregroundColor: Colors.black,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(isAr ? 'تأكيد' : 'Confirm'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref
          .read(appControllerProvider.notifier)
          .sendManualControl('maintenance_reset_tag', true);
      if (!mounted) return;
      _showToast(
        isAr ? '✅ تم تصفير عداد الصيانة الدورية' : '✅ Maintenance counter reset sent',
      );
    } catch (e) {
      if (!mounted) return;
      _showToast(
        isAr ? 'تعذر تصفير العداد: $e' : 'Failed to reset counter: $e',
        isError: true,
      );
    }
  }

  Future<void> _sendSafeReset(bool isAr) async {
    try {
      await ref
          .read(appControllerProvider.notifier)
          .executeEmergencyRecovery('SAFE_RESET');
      await _pollSensors();
      if (!mounted) return;
      _showToast(
        isAr
            ? '✅ تم إرسال نبضة إعادة الضبط الآمنة (ParkDB.Reset)'
            : '✅ Safe Reset pulse (ParkDB.Reset) sent',
      );
    } catch (e) {
      if (!mounted) return;
      _showToast(
        isAr ? 'تعذر إرسال إعادة الضبط الآمنة: $e' : 'Safe Reset failed: $e',
        isError: true,
      );
    }
  }

  void _showToast(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg, style: const TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: isError ? AppColors.statusError : AppColors.statusOnline,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  static String _inputName(int idx) {
    switch (idx) {
      case 0: return 'MAIN_PF';
      case 1: return 'PCELL_IN';
      case 2: return 'OUT_PCELL';
      case 3: return 'PUMP_OL';
      case 4: return 'COMP_OL';
      case 5: return 'SPARE2';
      case 6: return 'SPARE3';
      case 7: return 'EMERGENCY';
      case 16: return 'PL1_MG';
      case 17: return 'PL2_MG';
      case 18: return 'PL3_MG';
      case 19: return 'PL4_MG';
      case 20: return 'PL1_BTM';
      case 21: return 'PL2_BTM';
      case 22: return 'PL3_BTM';
      case 23: return 'PL4_BTM';
      case 24: return 'PL1_TOP';
      case 25: return 'PL2_TOP';
      case 26: return 'PL3_TOP';
      case 27: return 'PL4_TOP';
      case 28: return 'PL1_MID';
      case 29: return 'PL2_MID';
      case 30: return 'PL3_MID';
      case 31: return 'PL4_MID';
      default: return '—';
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = ref.watch(appControllerProvider);
    final isAr = appState.locale.languageCode == 'ar';
    final isEStop = (appState.systemStatus?.emergencyStop ?? false) ||
        (_sensors?['emergencyStop'] == true);
    final isOffline = appState.connectionPhase == ConnectionPhase.offline;
    final controlsEnabled = _manualEnabled && !isEStop && !isOffline;

    return RefreshIndicator(
      onRefresh: _pollSensors,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 28),
        children: [
          // 1. Mode Switch Card (Auto Mode <-> Manual Mode + Stop All Outputs)
          _buildModeCard(isAr, isEStop, isOffline),
          const SizedBox(height: 12),

          // 2. Direct Manual Controls Card (Rows 1-3 Toggle, Row 4 Momentary Press & Hold)
          _buildManualControlsCard(isAr, controlsEnabled),
          const SizedBox(height: 12),

          // 3. Protected Slot Occupancy Reset & Maintenance Counter
          _buildSlotResetCard(isAr, controlsEnabled),
          const SizedBox(height: 16),

          // 4. Merged Live PLC Sensors & Digital Inputs Monitor (Always Live!)
          _buildLiveSensorsSection(isAr),
        ],
      ),
    );
  }

  Widget _buildModeCard(bool isAr, bool isEStop, bool isOffline) {
    return Card(
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: (_manualEnabled
                  ? AppColors.statusWarning
                  : AppColors.primaryCyan)
              .withOpacity(0.55),
          width: 1.4,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  _manualEnabled
                      ? Icons.handyman_rounded
                      : Icons.auto_mode_rounded,
                  color: _manualEnabled
                      ? AppColors.statusWarning
                      : AppColors.primaryCyan,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isAr
                        ? 'وضع تشغيل لوحة الـ PLC (يدوي / تلقائي)'
                        : 'PLC Operating Mode (Manual / Auto)',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: (_manualEnabled
                            ? AppColors.statusWarning
                            : AppColors.statusOnline)
                        .withOpacity(0.18),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    _manualEnabled
                        ? (isAr ? 'يدوي (MANUAL)' : 'MANUAL')
                        : (isAr ? 'تلقائي (AUTO)' : 'AUTO'),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      color: _manualEnabled
                          ? AppColors.statusWarning
                          : AppColors.statusOnline,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: !_manualEnabled
                          ? AppColors.statusOnline
                          : AppColors.surfaceDark,
                      foregroundColor:
                          !_manualEnabled ? Colors.white : AppColors.statusOffline,
                    ),
                    onPressed: _modeBusy || !_manualEnabled
                        ? null
                        : () => _setManualMode(false, isAr),
                    icon: const Icon(Icons.auto_mode_rounded, size: 18),
                    label: Text(isAr ? 'وضع تلقائي' : 'Auto Mode'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: _manualEnabled
                          ? AppColors.statusWarning
                          : AppColors.surfaceDark,
                      foregroundColor:
                          _manualEnabled ? Colors.black : Colors.white,
                    ),
                    onPressed: _modeBusy || _manualEnabled || isEStop || isOffline
                        ? null
                        : () => _setManualMode(true, isAr),
                    icon: const Icon(Icons.engineering_rounded, size: 18),
                    label: Text(isAr ? 'وضع يدوي' : 'Manual Mode'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 40,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.statusError,
                  foregroundColor: Colors.white,
                ),
                onPressed: () => _releaseAllOutputs(
                  isAr: isAr,
                  reasonEn: 'Immediate stop of all manual outputs',
                  reasonAr: 'إيقاف فوري لجميع المخارج اليدوية',
                ),
                icon: const Icon(Icons.stop_circle_rounded, size: 18),
                label: Text(
                  isAr ? '🛑 إيقاف جميع المخارج فوراً' : '🛑 Stop All Manual Outputs',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _statusLine.isNotEmpty
                  ? _statusLine
                  : (isAr
                      ? 'الوضع الحالي: تلقائي (Auto) — فعّل الوضع اليدوي لاستخدام أزرار التحكم المباشر.'
                      : 'Current Mode: Auto — Enable Manual Mode to operate direct PLC controls.'),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: _statusColor,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildManualControlsCard(bool isAr, bool enabled) {
    return Opacity(
      opacity: enabled ? 1.0 : 0.48,
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                isAr
                    ? 'التحكم اليدوي المباشر (تبديل ON/OFF — الصفوف 1–3)'
                    : 'Direct Manual Controls (Toggle ON/OFF — Rows 1–3)',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                  color: AppColors.primaryCyan,
                ),
              ),
              const SizedBox(height: 10),
              // Row 1: Pump, UP, DOWN, Wall
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 2.5,
                children: [
                  _toggleBtn(
                    isAr ? '⚡ المضخة (Pump)' : '⚡ Pump',
                    'man_pump_tag',
                    const Color(0xFF0E7490),
                    enabled,
                    isAr,
                  ),
                  _toggleBtn(
                    isAr ? '⬆ صعود (UP)' : '⬆ Lift UP',
                    'man_up_tag',
                    const Color(0xFF1D4ED8),
                    enabled,
                    isAr,
                  ),
                  _toggleBtn(
                    isAr ? '⬇ نزول (DOWN)' : '⬇ Lift DOWN',
                    'man_down_tag',
                    const Color(0xFF1E3A8A),
                    enabled,
                    isAr,
                  ),
                  _toggleBtn(
                    isAr ? '🧱 الحاجز (Wall)' : '🧱 Wall Valve',
                    'man_wall_tag',
                    const Color(0xFF6D28D9),
                    enabled,
                    isAr,
                  ),
                  _toggleBtn(
                    isAr ? '🔧 صمام القطع (Cutoff)' : '🔧 Cutoff Valve',
                    'man_cutoff_tag',
                    const Color(0xFF334155),
                    enabled,
                    isAr,
                  ),
                  _toggleBtn(
                    isAr ? '🔓 السماح بالحاجز' : '🔓 Allow Wall',
                    'allow_wall_tag',
                    const Color(0xFFB45309),
                    enabled,
                    isAr,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              // Row 3: Stoppers S1..S4 (Toggle + M0.3 only)
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 4,
                mainAxisSpacing: 6,
                crossAxisSpacing: 6,
                childAspectRatio: 1.55,
                children: [
                  _toggleBtn('🔒 S1', 'man_s1_tag', const Color(0xFF0F766E), enabled, isAr),
                  _toggleBtn('🔒 S2', 'man_s2_tag', const Color(0xFF0F766E), enabled, isAr),
                  _toggleBtn('🔒 S3', 'man_s3_tag', const Color(0xFF0F766E), enabled, isAr),
                  _toggleBtn('🔒 S4', 'man_s4_tag', const Color(0xFF0F766E), enabled, isAr),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                isAr
                    ? 'المسارات L1–L4 (اضغط واستمر — Momentary + M0.3 + M0.4)'
                    : 'Lanes L1–L4 (Press & Hold — Momentary + M0.3 + M0.4)',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 12.5,
                  color: AppColors.statusWarning,
                ),
              ),
              const SizedBox(height: 8),
              // Row 4: Momentary Press & Hold Lanes L1..L4
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 2.6,
                children: [
                  _momentaryBtn(isAr ? '🚗 المسار L1' : '🚗 Lane L1', 'man_l1_tag', enabled, isAr),
                  _momentaryBtn(isAr ? '🚗 المسار L2 (آمن)' : '🚗 Lane L2 (Safe)', 'man_l2_tag', enabled, isAr),
                  _momentaryBtn(isAr ? '🚗 المسار L3' : '🚗 Lane L3', 'man_l3_tag', enabled, isAr),
                  _momentaryBtn(isAr ? '🚗 المسار L4' : '🚗 Lane L4', 'man_l4_tag', enabled, isAr),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _toggleBtn(
    String label,
    String controlKey,
    Color offColor,
    bool enabled,
    bool isAr,
  ) {
    final isOn = _toggleStates[controlKey] == true;
    return ElevatedButton(
      onPressed: enabled ? () => _toggleControl(controlKey, label, isAr) : null,
      style: ElevatedButton.styleFrom(
        backgroundColor: isOn ? AppColors.statusOnline : offColor,
        disabledBackgroundColor: offColor.withOpacity(0.45),
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: isOn ? const Color(0xFFBBF7D0) : Colors.white12,
            width: isOn ? 2 : 1,
          ),
        ),
      ),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          isOn ? '● $label [ON]' : label,
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
        ),
      ),
    );
  }

  Widget _momentaryBtn(
    String label,
    String controlKey,
    bool enabled,
    bool isAr,
  ) {
    final isHeld = _activeMomentaryKey == controlKey;
    return Listener(
      onPointerDown: enabled
          ? (_) => _startMomentary(controlKey, label, isAr)
          : null,
      onPointerUp: (_) => _releaseMomentary(controlKey, label, isAr),
      onPointerCancel: (_) => _releaseMomentary(controlKey, label, isAr),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 100),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isHeld
              ? AppColors.statusWarning
              : const Color(0xFF334155),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isHeld ? Colors.white : Colors.white24,
            width: isHeld ? 2 : 1,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            isHeld ? '● $label [HOLD]' : label,
            style: TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 12.5,
              color: isHeld ? Colors.black : Colors.white,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSlotResetCard(bool isAr, bool enabled) {
    const slots = [
      'L13', 'L23', 'L33', 'L43',
      'L12', 'L22', 'L32', 'L42',
      'L11', 'L21', 'L31', 'L41',
    ];
    return Card(
      margin: EdgeInsets.zero,
      child: ExpansionTile(
        leading: const Icon(Icons.cleaning_services_rounded, color: AppColors.statusError),
        title: Text(
          isAr
              ? 'تصفير إشغال المواقف والصيانة الدورية'
              : 'Protected Slot Reset & Maintenance Counter',
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        children: [
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 4,
            mainAxisSpacing: 6,
            crossAxisSpacing: 6,
            childAspectRatio: 2.1,
            children: [
              for (final code in slots)
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    padding: EdgeInsets.zero,
                    side: BorderSide(color: AppColors.statusError.withOpacity(0.45)),
                  ),
                  onPressed: enabled ? () => _confirmResetSlot(code, isAr) : null,
                  child: Text(
                    code,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.statusWarning,
                side: const BorderSide(color: AppColors.statusWarning),
              ),
              onPressed: enabled ? () => _confirmResetMaintenance(isAr) : null,
              icon: const Icon(Icons.build_circle_outlined, size: 18),
              label: Text(
                isAr
                    ? '🛠 تصفير عداد الصيانة الدورية'
                    : '🛠 Reset Periodic Maintenance Counter',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLiveSensorsSection(bool isAr) {
    final s = _sensors ?? const <String, dynamic>{};
    final lanes = (s['lanes'] as List?) ?? const [];
    final rawInputs = s['rawInputs'] as Map<String, dynamic>?;
    final ib = [
      (rawInputs?['IB0'] as num?)?.toInt() ?? 0,
      (rawInputs?['IB1'] as num?)?.toInt() ?? 0,
      (rawInputs?['IB2'] as num?)?.toInt() ?? 0,
      (rawInputs?['IB3'] as num?)?.toInt() ?? 0,
    ];
    final hasRaw = rawInputs != null;

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.sensors_rounded, color: AppColors.primaryCyan),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isAr
                        ? '📡 الحساسات الحية للـ PLC والمداخل الفيزيائية'
                        : '📡 Live PLC Sensors & Physical Inputs (I0.0–I3.7)',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13.5,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: isAr ? 'تحديث' : 'Refresh',
                  onPressed: _pollSensors,
                  icon: const Icon(Icons.refresh_rounded, size: 20),
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Safety Interlock Badges
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _sensorChip(
                  isAr ? 'طوارئ (E-Stop)' : 'E-Stop',
                  s['emergencyStop'] == true,
                  dangerWhenTrue: true,
                ),
                _sensorChip(
                  isAr ? 'حساس داخلي' : 'Photocell In',
                  s['photocellInside'] == true || s['photocell'] == true,
                ),
                _sensorChip(
                  isAr ? 'حساس خارجي' : 'Photocell Out',
                  s['photocellOutside'] == true,
                ),
                _sensorChip(
                  isAr ? 'عائق (M3.3)' : 'Obstacle',
                  s['obstacle'] == true,
                  dangerWhenTrue: true,
                ),
                _sensorChip(
                  isAr ? 'حمل المضخة' : 'Pump O.L',
                  s['pumpOverload'] == true,
                  dangerWhenTrue: true,
                ),
                _sensorChip(
                  isAr ? 'حمل الضاغط' : 'Comp O.L',
                  s['compressorOverload'] == true,
                  dangerWhenTrue: true,
                ),
              ],
            ),
            const SizedBox(height: 12),
            // 32 Physical Digital Inputs (4x8)
            Text(
              hasRaw
                  ? 'IB0=${ib[0]}  IB1=${ib[1]}  IB2=${ib[2]}  IB3=${ib[3]}'
                  : (isAr ? 'مداخل I0.0–I3.7 (بانتظار القراءة)' : 'Inputs I0.0–I3.7 (awaiting snapshot)'),
              style: const TextStyle(
                fontSize: 11,
                fontFamily: 'monospace',
                color: AppColors.statusOffline,
              ),
            ),
            const SizedBox(height: 6),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: 32,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 4,
                mainAxisSpacing: 4,
                crossAxisSpacing: 4,
                childAspectRatio: 2.15,
              ),
              itemBuilder: (_, i) {
                final byteIdx = i ~/ 8;
                final bitIdx = i % 8;
                final isHigh = hasRaw && ((ib[byteIdx] & (1 << bitIdx)) != 0);
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  decoration: BoxDecoration(
                    color: isHigh
                        ? AppColors.statusOnline.withOpacity(0.22)
                        : AppColors.surfaceDark.withOpacity(0.55),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: isHigh
                          ? AppColors.statusOnline
                          : Colors.white12,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'I$byteIdx.$bitIdx',
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w900,
                          color: isHigh ? AppColors.statusOnline : Colors.white70,
                        ),
                      ),
                      Text(
                        _inputName(i),
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 8.5,
                          color: AppColors.statusOffline,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            if (lanes.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                isAr
                    ? 'حساسات الطوابق (P3 TOP / P2 MID / P1 BTM) و MG_PROT'
                    : 'Floor Limit Switches (P3 TOP / P2 MID / P1 BTM) & MG_PROT',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 12.5,
                ),
              ),
              const SizedBox(height: 6),
              for (final raw in lanes)
                if (raw is Map<String, dynamic>)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 58,
                          child: Text(
                            'Lane ${raw['lane']}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        Expanded(
                          child: Wrap(
                            spacing: 5,
                            runSpacing: 4,
                            children: [
                              _miniBit('TOP', raw['lsTop'] == true),
                              _miniBit('MID', raw['lsMid'] == true),
                              _miniBit('BTM', raw['lsBtm'] == true),
                              _miniBit(
                                'MG',
                                raw['mgProt'] == true,
                                dangerWhenTrue: true,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Alarm Word: ${s['alarmWord'] ?? 0}',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.statusOffline,
                    ),
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: () => _sendSafeReset(isAr),
                  icon: const Icon(Icons.restart_alt_rounded, size: 17),
                  label: Text(isAr ? 'إعادة ضبط آمنة' : 'Safe PLC Reset'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _sensorChip(String label, bool active, {bool dangerWhenTrue = false}) {
    final color = active
        ? (dangerWhenTrue ? AppColors.statusError : AppColors.statusOnline)
        : AppColors.statusOffline;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(active ? 0.2 : 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(
        '$label: ${active ? "ON" : "OFF"}',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: color,
        ),
      ),
    );
  }

  Widget _miniBit(String label, bool active, {bool dangerWhenTrue = false}) {
    final color = active
        ? (dangerWhenTrue ? AppColors.statusError : AppColors.statusOnline)
        : Colors.white30;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(active ? 0.22 : 0.06),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          color: active ? color : AppColors.statusOffline,
        ),
      ),
    );
  }
}

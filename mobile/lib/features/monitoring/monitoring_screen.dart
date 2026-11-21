import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/models/models.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/system_status_hero.dart';
import '../../l10n/generated/app_localizations.dart';

class MonitoringScreen extends ConsumerStatefulWidget {
  const MonitoringScreen({super.key});

  @override
  ConsumerState<MonitoringScreen> createState() => _MonitoringScreenState();
}

class _MonitoringScreenState extends ConsumerState<MonitoringScreen> {
  Map<String, dynamic>? _sensors;
  bool _loadingSensors = false;

  @override
  void initState() {
    super.initState();
    _loadSensors();
  }

  Future<void> _loadSensors() async {
    if (_loadingSensors) return;
    setState(() => _loadingSensors = true);
    try {
      final data =
          await ref.read(appControllerProvider.notifier).fetchLiveSensors();
      if (mounted) setState(() => _sensors = data);
    } catch (_) {
      // keep previous snapshot
    } finally {
      if (mounted) setState(() => _loadingSensors = false);
    }
  }

  Future<void> _runRecovery(String action, String titleEn, String titleAr) async {
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    try {
      final res = await ref
          .read(appControllerProvider.notifier)
          .executeEmergencyRecovery(action);
      await _loadSensors();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isAr ? ((res['message'] as String?) ?? titleAr) : titleEn),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isAr ? 'تعذر تنفيذ الإجراء: $e' : 'Action failed: $e'),
          backgroundColor: AppColors.statusError,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    final appState = ref.watch(appControllerProvider);
    final sys =
        appState.systemStatus ??
        appState.dashboard?.system ??
        SystemStatus.offlineFallback();
    final timeFmt = DateFormat('yyyy-MM-dd HH:mm:ss');
    final lanes = (_sensors?['lanes'] as List?) ?? const [];
    final isEStop = sys.emergencyStop || (_sensors?['emergencyStop'] == true);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.monitoringScreenTitle),
        actions: [
          IconButton(
            onPressed: () {
              ref.read(appControllerProvider.notifier).refreshDashboardSilent();
              _loadSensors();
            },
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref
              .read(appControllerProvider.notifier)
              .refreshDashboardSilent();
          await _loadSensors();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SystemStatusHero(
              status: sys,
              isCached: !appState.backendReachable,
            ),
            const SizedBox(height: 14),
            // Emergency Stop & Safe Recovery Card
            Card(
              margin: EdgeInsets.zero,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: BorderSide(
                  color: (isEStop ? AppColors.statusError : Colors.teal)
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
                          isEStop
                              ? Icons.emergency_rounded
                              : Icons.verified_user_rounded,
                          color: isEStop
                              ? AppColors.statusError
                              : AppColors.statusOnline,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            isEStop
                                ? (isAr
                                    ? '🔴 إيقاف الطوارئ مفعّل — اختر إجراء الاستعادة'
                                    : '🔴 Emergency Stop Active — Choose Recovery Action')
                                : (isAr
                                    ? 'التحكم السريع بالطوارئ وإعادة الضبط الآمنة'
                                    : 'Emergency Stop & Safe PLC Reset'),
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (!isEStop)
                          FilledButton.icon(
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.statusError,
                            ),
                            onPressed: () => _runRecovery(
                              'ESTOP_ON',
                              'Emergency Stop Activated',
                              'تم تفعيل إيقاف الطوارئ',
                            ),
                            icon: const Icon(Icons.stop_circle_rounded, size: 18),
                            label: Text(isAr ? 'إيقاف طارئ (E-Stop)' : 'Emergency Stop'),
                          )
                        else ...[
                          FilledButton.icon(
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.statusOnline,
                            ),
                            onPressed: () => _runRecovery(
                              'ESTOP_OFF',
                              'Emergency Stop Cleared',
                              'تم إلغاء الطوارئ',
                            ),
                            icon: const Icon(Icons.play_arrow_rounded, size: 18),
                            label: Text(isAr ? 'إلغاء الطوارئ' : 'Clear E-Stop'),
                          ),
                          OutlinedButton.icon(
                            onPressed: () => _runRecovery(
                              'COMPLETE_SEQ',
                              'Complete Sequence Sent',
                              'تم إرسال إكمال المسار',
                            ),
                            icon: const Icon(Icons.check_circle_outline, size: 18),
                            label: Text(isAr ? 'إكمال المسار' : 'Complete Seq'),
                          ),
                          OutlinedButton.icon(
                            onPressed: () => _runRecovery(
                              'RETURN_PARK',
                              'Return Platform Sent',
                              'تم إرسال إرجاع المنصة',
                            ),
                            icon: const Icon(Icons.undo_rounded, size: 18),
                            label: Text(isAr ? 'إرجاع المنصة' : 'Return Park'),
                          ),
                        ],
                        OutlinedButton.icon(
                          onPressed: () => _runRecovery(
                            'SAFE_RESET',
                            'Safe Reset Pulse Sent (ParkDB.Reset)',
                            'تم إرسال إعادة ضبط آمنة',
                          ),
                          icon: const Icon(Icons.restart_alt_rounded, size: 18),
                          label: Text(isAr ? 'إعادة ضبط آمنة' : 'Safe Reset'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            if (lanes.isNotEmpty) ...[
              const SizedBox(height: 14),
              Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isAr
                            ? 'حساسات الطوابق (P3 TOP / P2 MID / P1 BTM) و MG_PROT'
                            : 'Floor Limit Switches (P3 TOP / P2 MID / P1 BTM) & MG_PROT',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13.5,
                        ),
                      ),
                      const SizedBox(height: 10),
                      for (final raw in lanes)
                        if (raw is Map<String, dynamic>)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(
                              children: [
                                SizedBox(
                                  width: 68,
                                  child: Text(
                                    'Lane ${raw['lane']}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 12.5,
                                    ),
                                  ),
                                ),
                                _SensorChip('P3', raw['lsTop'] == true),
                                const SizedBox(width: 6),
                                _SensorChip('P2', raw['lsMid'] == true),
                                const SizedBox(width: 6),
                                _SensorChip('P1', raw['lsBtm'] == true),
                                const SizedBox(width: 6),
                                _SensorChip('MG', raw['mgProt'] == true),
                              ],
                            ),
                          ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            _TelemetryTile(
              icon: Icons.lan_rounded,
              title: l10n.controllerStatus,
              value: sys.controllerConnected
                  ? l10n.controllerConnected
                  : l10n.controllerDisconnected,
              ok: sys.controllerConnected,
            ),
            _TelemetryTile(
              icon: Icons.memory_rounded,
              title: l10n.plcStatus,
              value: sys.plcConnected ? l10n.plcConnected : l10n.plcDisconnected,
              ok: sys.plcConnected,
            ),
            _TelemetryTile(
              icon: Icons.precision_manufacturing_rounded,
              title: l10n.machineState,
              value: sys.machineState,
              ok: sys.machineState == 'IDLE' || sys.machineState == 'BUSY',
            ),
            _TelemetryTile(
              icon: Icons.favorite_rounded,
              title: l10n.heartbeatStatus,
              value: sys.heartbeatAgeMs != null
                  ? l10n.heartbeatAge(sys.heartbeatAgeMs!)
                  : (sys.lastHeartbeat != null
                      ? timeFmt.format(sys.lastHeartbeat!.toLocal())
                      : '—'),
              ok: (sys.heartbeatAgeMs ?? 99999) < 15000,
            ),
            _TelemetryTile(
              icon: Icons.verified_user_rounded,
              title: l10n.safetyInterlocks,
              value: sys.safetyOk
                  ? l10n.safetyInterlocksOk
                  : l10n.safetyInterlocksFault,
              ok: sys.safetyOk,
            ),
            _TelemetryTile(
              icon: Icons.emergency_rounded,
              title: l10n.emergencyStop,
              value: isEStop
                  ? l10n.emergencyStopActive
                  : l10n.emergencyStopClear,
              ok: !isEStop,
            ),
            _TelemetryTile(
              icon: Icons.cable_rounded,
              title: l10n.communicationHealth,
              value: sys.communication,
              ok: sys.communication == 'OK',
            ),
            _TelemetryTile(
              icon: Icons.settings_ethernet_rounded,
              title: l10n.adapterProtocol,
              value: '${sys.adapter} (${sys.mode})',
              ok: true,
            ),
            _TelemetryTile(
              icon: Icons.code_rounded,
              title: l10n.activeCommand,
              value: sys.activeCommandId ?? 'IDLE',
              ok: true,
            ),
            _TelemetryTile(
              icon: Icons.schedule_rounded,
              title: l10n.lastTelemetryUpdate,
              value: timeFmt.format(sys.lastUpdate.toLocal()),
              ok: appState.socketConnected,
            ),
          ],
        ),
      ),
    );
  }
}

class _SensorChip extends StatelessWidget {
  const _SensorChip(this.label, this.on);
  final String label;
  final bool on;

  @override
  Widget build(BuildContext context) {
    final c = on ? AppColors.statusOnline : Colors.grey;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 4),
        decoration: BoxDecoration(
          color: c.withOpacity(0.16),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: c.withOpacity(0.6)),
        ),
        child: Text(
          '$label ${on ? "●" : "○"}',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: c,
          ),
        ),
      ),
    );
  }
}

class _TelemetryTile extends StatelessWidget {
  const _TelemetryTile({
    required this.icon,
    required this.title,
    required this.value,
    required this.ok,
  });

  final IconData icon;
  final String title;
  final String value;
  final bool ok;

  @override
  Widget build(BuildContext context) {
    final color = ok ? AppColors.statusOnline : AppColors.statusError;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        margin: EdgeInsets.zero,
        child: ListTile(
          leading: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color),
          ),
          title: Text(
            title,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          trailing: Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: color,
              fontSize: 13.5,
            ),
          ),
        ),
      ),
    );
  }
}

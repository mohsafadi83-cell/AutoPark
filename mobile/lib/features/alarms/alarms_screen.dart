import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/models/models.dart';
import '../../core/network/api_error.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/alarm_severity_badge.dart';
import '../../l10n/generated/app_localizations.dart';

class AlarmsScreen extends ConsumerStatefulWidget {
  const AlarmsScreen({super.key});

  @override
  ConsumerState<AlarmsScreen> createState() => _AlarmsScreenState();
}

class _AlarmsScreenState extends ConsumerState<AlarmsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _acknowledge(Alarm alarm) async {
    final l10n = AppLocalizations.of(context);
    final noteCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${l10n.acknowledgeAlarm} — ${alarm.alarmCode}'),
        content: TextField(
          controller: noteCtrl,
          decoration: InputDecoration(
            hintText: l10n.acknowledgeNoteHint,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.confirm),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref
          .read(appControllerProvider.notifier)
          .api
          .acknowledgeAlarm(alarm.id, note: noteCtrl.text);
      await ref.read(appControllerProvider.notifier).refreshAlarmsSilent();
      await ref.read(appControllerProvider.notifier).refreshDashboardSilent();
    } on ApiError catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.statusError,
          content: Text(e.localizedMessage(l10n)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final appState = ref.watch(appControllerProvider);
    final canAck = appState.user?.canAcknowledgeAlarms ?? false;
    final activeAlarms =
        appState.alarms.where((a) => a.status != 'RESOLVED').toList();

    return Column(
      children: [
        Material(
          color: Theme.of(context).appBarTheme.backgroundColor,
          child: TabBar(
            controller: _tabCtrl,
            tabs: [
              Tab(text: '${l10n.activeAlarmsTab} (${activeAlarms.length})'),
              Tab(text: l10n.allAlarmsTab),
            ],
          ),
        ),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          color: AppColors.primaryCyan.withOpacity(0.1),
          child: Row(
            children: [
              const Icon(
                Icons.shield_outlined,
                size: 16,
                color: AppColors.primaryCyan,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.alarmSafetyNote,
                  style: const TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: [
              _buildList(activeAlarms, canAck, l10n),
              _buildList(appState.alarms, canAck, l10n),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildList(
    List<Alarm> items,
    bool canAck,
    AppLocalizations l10n,
  ) {
    final fmt = DateFormat('yyyy-MM-dd HH:mm:ss');
    return RefreshIndicator(
      onRefresh: () =>
          ref.read(appControllerProvider.notifier).refreshAlarmsSilent(),
      child: items.isEmpty
          ? ListView(
              children: [
                const SizedBox(height: 60),
                Center(child: Text(l10n.noAlarmsFound)),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.all(14),
              itemCount: items.length,
              itemBuilder: (context, index) {
                final alarm = items[index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Card(
                    margin: EdgeInsets.zero,
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              AlarmSeverityBadge(severity: alarm.severity),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  '${alarm.alarmCode} • ${alarm.source}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              _StatusChip(status: alarm.status, l10n: l10n),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            alarm.description,
                            style: const TextStyle(fontSize: 14),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  fmt.format(alarm.createdAt.toLocal()),
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ),
                              if (canAck && alarm.status == 'ACTIVE')
                                OutlinedButton.icon(
                                  key: Key('ack_alarm_${alarm.id}'),
                                  onPressed: () => _acknowledge(alarm),
                                  icon: const Icon(
                                    Icons.check_rounded,
                                    size: 16,
                                  ),
                                  label: Text(l10n.acknowledgeAlarm),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status, required this.l10n});
  final String status;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    Color c = AppColors.statusError;
    String label = l10n.alarmStatusActive;
    if (status == 'ACKNOWLEDGED') {
      c = AppColors.statusWarning;
      label = l10n.alarmStatusAcknowledged;
    } else if (status == 'RESOLVED') {
      c = AppColors.statusOnline;
      label = l10n.alarmStatusResolved;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: c.withOpacity(0.16),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: c,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

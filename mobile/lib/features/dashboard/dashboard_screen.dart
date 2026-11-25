import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/request_step_timeline.dart';
import '../../core/widgets/system_status_hero.dart';
import '../../l10n/generated/app_localizations.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({
    super.key,
    required this.onNavigateTab,
    required this.onOpenMonitoring,
    required this.onOpenNotifications,
  });

  final void Function(int index, {int? subTab}) onNavigateTab;
  final VoidCallback onOpenMonitoring;
  final VoidCallback onOpenNotifications;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final appState = ref.watch(appControllerProvider);
    final dash = appState.dashboard;
    final sys =
        appState.systemStatus ?? dash?.system ?? SystemStatus.offlineFallback();
    final totals = dash?.totals ??
        const SpaceTotals(
          total: 0,
          available: 0,
          occupied: 0,
          reserved: 0,
          moving: 0,
          blocked: 0,
          maintenance: 0,
          error: 0,
        );
    final user = appState.user;
    final canDispatch = appState.canDispatchCommands &&
        (user?.canRequestParking ?? false);

    return RefreshIndicator(
      onRefresh: () => ref.read(appControllerProvider.notifier).refreshAllData(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SystemStatusHero(
            status: sys,
            isCached: dash?.isCached ?? !appState.backendReachable,
            onTapMonitoring:
                (user?.canMonitorSystem ?? false) ? onOpenMonitoring : null,
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.75,
            children: [
              _MetricCard(
                icon: Icons.grid_view_rounded,
                label: l10n.totalSpaces,
                value: '${totals.total}',
                color: AppColors.primaryCyan,
              ),
              _MetricCard(
                icon: Icons.check_circle_outline_rounded,
                label: l10n.availableSpaces,
                value: '${totals.available}',
                color: AppColors.statusOnline,
              ),
              _MetricCard(
                icon: Icons.directions_car_filled_rounded,
                label: l10n.occupiedSpaces,
                value: '${totals.occupied}',
                color: AppColors.accentBlue,
              ),
              _MetricCard(
                icon: Icons.sync_rounded,
                label: l10n.movingVehicles,
                value: '${totals.moving}',
                color: AppColors.statusMoving,
              ),
              _MetricCard(
                icon: Icons.warning_amber_rounded,
                label: l10n.activeAlarmsCount,
                value: '${dash?.activeAlarms ?? appState.activeAlarmsCount}',
                color: (dash?.activeAlarms ?? 0) > 0
                    ? AppColors.statusError
                    : AppColors.statusOnline,
                onTap: () => onNavigateTab(3),
              ),
              _MetricCard(
                icon: Icons.monitor_heart_rounded,
                label: l10n.systemHealth,
                value: '${dash?.health ?? 0}%',
                color: (dash?.health ?? 100) >= 80
                    ? AppColors.statusOnline
                    : AppColors.statusWarning,
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            l10n.quickActions,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  key: const Key('dashboard_park_button'),
                  onPressed:
                      canDispatch ? () => onNavigateTab(2, subTab: 0) : null,
                  icon: const Icon(Icons.south_east_rounded),
                  label: Text(l10n.requestParkAction),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  key: const Key('dashboard_retrieve_button'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.accentBlue,
                    foregroundColor: Colors.white,
                  ),
                  onPressed:
                      canDispatch ? () => onNavigateTab(2, subTab: 1) : null,
                  icon: const Icon(Icons.north_east_rounded),
                  label: Text(l10n.requestRetrieveAction),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => onNavigateTab(1),
                  icon: const Icon(Icons.map_outlined),
                  label: Text(l10n.openMapAction),
                ),
              ),
              if (user?.canMonitorSystem ?? false) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onOpenMonitoring,
                    icon: const Icon(Icons.sensors_rounded),
                    label: Text(l10n.liveMonitoringAction),
                  ),
                ),
              ],
            ],
          ),
          if (sys.isSimulation && (user?.canControlSimulation ?? false)) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => _showSimulationSheet(context, ref),
              icon: const Icon(
                Icons.science_rounded,
                color: AppColors.statusWarning,
              ),
              label: Text(l10n.simulationLab),
            ),
          ],
          const SizedBox(height: 20),
          Text(
            l10n.activeRequestsTitle,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 10),
          if (appState.activeRequests.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    const Icon(
                      Icons.check_circle_outline_rounded,
                      color: AppColors.statusOnline,
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Text(l10n.noActiveRequests)),
                  ],
                ),
              ),
            )
          else
            for (final req in appState.activeRequests)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.primaryCyan
                                    .withOpacity(0.16),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                req.requestType,
                                style: const TextStyle(
                                  color: AppColors.primaryCyan,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                req.requestNumber,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            if (req.spaceNumber != null)
                              Text(
                                req.spaceNumber!,
                                style: const TextStyle(
                                  color: AppColors.statusOnline,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        RequestStepTimeline(request: req),
                      ],
                    ),
                  ),
                ),
              ),
        ],
      ),
    );
  }

  void _showSimulationSheet(BuildContext context, WidgetRef ref) {
    final scenarios = [
      'NORMAL',
      'FAIL_NEXT',
      'TIMEOUT_NEXT',
      'GO_OFFLINE',
      'GO_ONLINE',
      'RAISE_WARNING',
      'RAISE_CRITICAL',
      'EMERGENCY_STOP',
      'CLEAR_EMERGENCY',
      'CLEAR_ALARMS',
    ];
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) {
        final l10n = AppLocalizations.of(ctx);
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.simulationLab,
                  style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final sc in scenarios)
                      ActionChip(
                        label: Text(sc),
                        onPressed: () async {
                          Navigator.of(ctx).pop();
                          try {
                            await ref
                                .read(appControllerProvider.notifier)
                                .api
                                .triggerSimulationScenario(sc);
                            await ref
                                .read(appControllerProvider.notifier)
                                .refreshAllData();
                          } catch (_) {}
                        },
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      value,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

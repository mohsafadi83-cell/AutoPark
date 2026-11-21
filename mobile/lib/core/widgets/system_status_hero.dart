import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

class SystemStatusHero extends StatelessWidget {
  const SystemStatusHero({
    super.key,
    required this.status,
    this.isCached = false,
    this.onTapMonitoring,
  });

  final SystemStatus status;
  final bool isCached;
  final VoidCallback? onTapMonitoring;

  String _stateLabel(AppLocalizations l10n) {
    switch (status.state) {
      case SystemState.online:
        return l10n.systemStatusOnline;
      case SystemState.warning:
        return l10n.systemStatusWarning;
      case SystemState.error:
        return l10n.systemStatusError;
      case SystemState.offline:
        return l10n.systemStatusOffline;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final color = AppColors.forSystemState(status.state);
    final icon = AppColors.iconForSystemState(status.state);

    return Card(
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: color.withOpacity(0.7), width: 1.6),
      ),
      child: InkWell(
        onTap: onTapMonitoring,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.16),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, color: color, size: 28),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _stateLabel(l10n),
                          style:
                              Theme.of(context).textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: color,
                                  ),
                        ),
                        Text(
                          '${status.adapter} • ${status.machineState}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: status.isSimulation
                          ? AppColors.statusWarning.withOpacity(0.18)
                          : AppColors.primaryCyan.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      status.isSimulation
                          ? l10n.modeSimulation
                          : l10n.modeProduction,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: status.isSimulation
                            ? AppColors.statusWarning
                            : AppColors.primaryCyan,
                      ),
                    ),
                  ),
                ],
              ),
              if (status.message != null && status.message!.isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    status.message!,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: color,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _TelemetryChip(
                    icon: status.controllerConnected
                        ? Icons.lan_rounded
                        : Icons.lan_outlined,
                    label: status.controllerConnected
                        ? l10n.controllerConnected
                        : l10n.controllerDisconnected,
                    ok: status.controllerConnected,
                  ),
                  _TelemetryChip(
                    icon: status.plcConnected
                        ? Icons.memory_rounded
                        : Icons.power_off_rounded,
                    label: status.plcConnected
                        ? l10n.plcConnected
                        : l10n.plcDisconnected,
                    ok: status.plcConnected,
                  ),
                  _TelemetryChip(
                    icon: status.safetyOk
                        ? Icons.verified_user_rounded
                        : Icons.gpp_bad_rounded,
                    label: status.safetyOk
                        ? l10n.safetyInterlocksOk
                        : l10n.safetyInterlocksFault,
                    ok: status.safetyOk,
                  ),
                  if (status.emergencyStop)
                    _TelemetryChip(
                      icon: Icons.emergency_rounded,
                      label: l10n.emergencyStopActive,
                      ok: false,
                    ),
                ],
              ),
              if (isCached) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    const Icon(
                      Icons.history_toggle_off_rounded,
                      size: 16,
                      color: AppColors.statusWarning,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        l10n.cachedDataNotice,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.statusWarning,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _TelemetryChip extends StatelessWidget {
  const _TelemetryChip({
    required this.icon,
    required this.label,
    required this.ok,
  });

  final IconData icon;
  final String label;
  final bool ok;

  @override
  Widget build(BuildContext context) {
    final color = ok ? AppColors.statusOnline : AppColors.statusError;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.14),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.45)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

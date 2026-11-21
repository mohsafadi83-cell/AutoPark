import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

/// Industrial safety badge: NEVER relies on color alone — always pairs an
/// explicit icon + text label + semantic color.
class AlarmSeverityBadge extends StatelessWidget {
  const AlarmSeverityBadge({
    super.key,
    required this.severity,
  });

  final AlarmSeverity severity;

  String _label(AppLocalizations l10n) {
    switch (severity) {
      case AlarmSeverity.info:
        return l10n.severityInfo;
      case AlarmSeverity.warning:
        return l10n.severityWarning;
      case AlarmSeverity.critical:
        return l10n.severityCritical;
      case AlarmSeverity.emergency:
        return l10n.severityEmergency;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final color = AppColors.forAlarmSeverity(severity);
    final icon = AppColors.iconForAlarmSeverity(severity);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.16),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.6)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 5),
          Text(
            _label(l10n),
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class SpaceStatusBadge extends StatelessWidget {
  const SpaceStatusBadge({
    super.key,
    required this.status,
  });

  final SpaceStatus status;

  static String labelFor(AppLocalizations l10n, SpaceStatus status) {
    switch (status) {
      case SpaceStatus.available:
        return l10n.spaceAvailable;
      case SpaceStatus.occupied:
        return l10n.spaceOccupied;
      case SpaceStatus.reserved:
        return l10n.spaceReserved;
      case SpaceStatus.moving:
        return l10n.spaceMoving;
      case SpaceStatus.blocked:
        return l10n.spaceBlocked;
      case SpaceStatus.maintenance:
        return l10n.spaceMaintenance;
      case SpaceStatus.error:
        return l10n.spaceError;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final color = AppColors.forSpaceStatus(status);
    final icon = AppColors.iconForSpaceStatus(status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Text(
            labelFor(l10n, status),
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

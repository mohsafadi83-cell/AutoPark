import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

class SafetyConnectivityBanner extends StatelessWidget {
  const SafetyConnectivityBanner({
    super.key,
    required this.networkOnline,
    required this.backendReachable,
    required this.systemStatus,
  });

  final bool networkOnline;
  final bool backendReachable;
  final SystemStatus? systemStatus;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    String? text;
    IconData icon = Icons.warning_amber_rounded;
    Color bg = AppColors.statusWarning;

    if (!networkOnline) {
      text = l10n.networkOfflineBanner;
      icon = Icons.wifi_off_rounded;
      bg = AppColors.statusError;
    } else if (!backendReachable) {
      text = l10n.backendUnreachableBanner;
      icon = Icons.cloud_off_rounded;
      bg = AppColors.statusWarning;
    } else if (systemStatus != null && systemStatus!.emergencyStop) {
      text = l10n.emergencyStopActive;
      icon = Icons.emergency_rounded;
      bg = AppColors.statusError;
    } else if (systemStatus != null &&
        (!systemStatus!.controllerConnected ||
            systemStatus!.state == SystemState.offline)) {
      text = l10n.controllerOfflineBanner;
      icon = Icons.power_off_rounded;
      bg = AppColors.statusError;
    }

    if (text == null) return const SizedBox.shrink();

    return Material(
      color: bg,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            children: [
              Icon(icon, color: Colors.white, size: 18),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  text,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

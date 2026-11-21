import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../l10n/generated/app_localizations.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

/// Renders the 7-step industrial execution timeline for a PARK or RETRIEVE
/// request.
///
/// CRITICAL SAFETY RULE:
/// The final step (`PARKING_COMPLETED` or `VEHICLE_READY`) is NEVER displayed
/// as `DONE` unless `request.status == 'COMPLETED'` (which only happens when
/// the industrial controller confirms completion).
class RequestStepTimeline extends StatelessWidget {
  const RequestStepTimeline({
    super.key,
    required this.request,
  });

  final ParkingRequest request;

  String _stepTitle(AppLocalizations l10n, String key) {
    switch (key) {
      case 'CREATED':
        return l10n.stepCreated;
      case 'VALIDATED':
        return l10n.stepValidated;
      case 'APPROVED':
        return l10n.stepApproved;
      case 'COMMAND_SENT':
        return l10n.stepCommandSent;
      case 'CONTROLLER_CONFIRMED':
        return l10n.stepControllerConfirmed;
      case 'VEHICLE_MOVING':
        return l10n.stepVehicleMoving;
      case 'PARKING_COMPLETED':
        return l10n.stepParkingCompleted;
      case 'VEHICLE_LOCATED':
        return l10n.stepVehicleLocated;
      case 'PREPARING_SYSTEM':
        return l10n.stepPreparingSystem;
      case 'PLATFORM_MOVING':
        return l10n.stepPlatformMoving;
      case 'RETRIEVAL_IN_PROGRESS':
        return l10n.stepRetrievalInProgress;
      case 'VEHICLE_READY':
        return l10n.stepVehicleReady;
      default:
        return key;
    }
  }

  /// Enforces the industrial safety rule that the final step cannot be DONE
  /// unless the overall request status is `COMPLETED`.
  static String effectiveStepStatus({
    required ParkingRequest request,
    required String stepKey,
    required String rawStatus,
  }) {
    final isFinalKey =
        stepKey == 'PARKING_COMPLETED' || stepKey == 'VEHICLE_READY';
    if (isFinalKey && rawStatus == 'DONE' && request.status != 'COMPLETED') {
      return 'ACTIVE';
    }
    return rawStatus;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final orderedKeys = request.requestType == 'RETRIEVE'
        ? ParkingRequest.retrieveStepOrder
        : ParkingRequest.parkStepOrder;

    final stepByKey = {for (final s in request.steps) s.key: s};
    final timeFmt = DateFormat('HH:mm:ss');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < orderedKeys.length; i++)
          Builder(
            builder: (context) {
              final key = orderedKeys[i];
              final raw = stepByKey[key];
              final status = effectiveStepStatus(
                request: request,
                stepKey: key,
                rawStatus: raw?.status ?? 'PENDING',
              );
              final isLast = i == orderedKeys.length - 1;

              Color color;
              IconData icon;
              switch (status) {
                case 'DONE':
                  color = AppColors.statusOnline;
                  icon = Icons.check_circle_rounded;
                  break;
                case 'ACTIVE':
                  color = AppColors.primaryCyan;
                  icon = Icons.radio_button_checked_rounded;
                  break;
                case 'FAILED':
                  color = AppColors.statusError;
                  icon = Icons.cancel_rounded;
                  break;
                default:
                  color = AppColors.statusOffline;
                  icon = Icons.radio_button_unchecked_rounded;
              }

              return IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      children: [
                        Icon(icon, color: color, size: 22),
                        if (!isLast)
                          Expanded(
                            child: Container(
                              width: 2,
                              margin: const EdgeInsets.symmetric(vertical: 4),
                              color: status == 'DONE'
                                  ? AppColors.statusOnline
                                  : AppColors.borderDark,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(bottom: isLast ? 4 : 14),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                _stepTitle(l10n, key),
                                style: TextStyle(
                                  fontWeight: status == 'ACTIVE' ||
                                          status == 'DONE'
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  color: status == 'PENDING'
                                      ? AppColors.statusOffline
                                      : null,
                                ),
                              ),
                            ),
                            if (raw?.at != null)
                              Text(
                                timeFmt.format(raw!.at!.toLocal()),
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
      ],
    );
  }
}

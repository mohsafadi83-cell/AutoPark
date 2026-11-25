import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/network/api_error.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/alarm_severity_badge.dart';
import '../../l10n/generated/app_localizations.dart';

/// Unified AutoPark Mobile Control Console:
/// 1. Live Connection + Available / Occupied KPI Strip
/// 2. Live Lift Status Card (Standby / Moving / Safety Blocked)
/// 3. Interactive 12-Bay Parking Map (L11–L43; tap ONLY selects bay — never triggers motion)
/// 4. Inline Selected Bay Action Panel (CALL LIFT / RETRIEVE VEHICLE + independent RETURN LIFT TO HOME)
class ParkingMapScreen extends ConsumerStatefulWidget {
  const ParkingMapScreen({super.key});

  @override
  ConsumerState<ParkingMapScreen> createState() => _ParkingMapScreenState();
}

class _ParkingMapScreenState extends ConsumerState<ParkingMapScreen> {
  int? _selectedLevel;
  String? _selectedZone;
  SpaceStatus? _selectedStatus;
  String? _selectedSpaceNumber;
  bool _submitting = false;

  String _floorDescription(int level, bool isAr) {
    switch (level) {
      case 3:
        return isAr ? 'P3 (سطح الأرض — دخول وخروج)' : 'P3 (Ground Level — Entry/Exit)';
      case 2:
        return isAr ? 'P2 (الطابق الأوسط تحت الأرض)' : 'P2 (Middle Underground)';
      default:
        return isAr ? 'P1 (الطابق السفلي تحت الأرض)' : 'P1 (Lower Underground)';
    }
  }

  Future<void> _confirmAndCallLift({
    required ParkingSpace space,
    required bool isPark,
  }) async {
    final l10n = AppLocalizations.of(context);
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    final messenger = ScaffoldMessenger.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            Icon(
              isPark ? Icons.local_parking_rounded : Icons.directions_car_rounded,
              color: isPark ? const Color(0xFF16A34A) : AppColors.primaryCyan,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                isPark
                    ? (isAr ? 'تأكيد استدعاء المصعد للإيداع' : 'Confirm Call Lift (Park)')
                    : (isAr ? 'تأكيد استدعاء السيارة' : 'Confirm Retrieve Vehicle'),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isAr
                  ? 'الموقف المحدد: ${space.spaceNumber}'
                  : 'Selected Bay: ${space.spaceNumber}',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text('${space.zone} • ${_floorDescription(space.level, isAr)}'),
            const SizedBox(height: 10),
            Text(
              isAr
                  ? 'سيتم إرسال الأمر عبر الخادم وطابور الأمان إلى المصعد بعد التحقق من جميع شروط السلامة.'
                  : 'The command will be dispatched through the backend FIFO safety queue after all PLC interlock checks pass.',
              style: Theme.of(ctx).textTheme.bodySmall,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor:
                  isPark ? const Color(0xFF16A34A) : AppColors.primaryCyan,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              isPark
                  ? (isAr ? 'استدعاء المصعد' : 'CALL LIFT')
                  : (isAr ? 'استدعاء السيارة' : 'RETRIEVE VEHICLE'),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _submitting = true);
    try {
      final api = ref.read(appControllerProvider.notifier).api;
      final req = isPark
          ? await api.requestPark(
              targetSpaceNumber: space.spaceNumber,
            )
          : await api.requestRetrieve(
              plateNumber: space.vehiclePlate,
              targetSpaceNumber: space.spaceNumber,
            );
      ref.read(appControllerProvider.notifier).upsertRequest(req);
      await ref.read(appControllerProvider.notifier).refreshAllData();
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            backgroundColor: const Color(0xFF16A34A),
            content: Text(
              isPark
                  ? (isAr
                      ? '✅ تم إرسال أمر استدعاء المصعد للموقف ${space.spaceNumber}'
                      : '✅ Lift called for bay ${space.spaceNumber}')
                  : (isAr
                      ? '✅ تم إرسال أمر استدعاء السيارة من الموقف ${space.spaceNumber}'
                      : '✅ Vehicle retrieval started from bay ${space.spaceNumber}'),
            ),
          ),
        );
      }
    } on ApiError catch (e) {
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            backgroundColor: AppColors.statusError,
            content: Text(e.localizedMessage(l10n)),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            backgroundColor: AppColors.statusError,
            content: Text(e.toString()),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _confirmAndReturnLiftToHome() async {
    final l10n = AppLocalizations.of(context);
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    final messenger = ScaffoldMessenger.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.home_work_rounded, color: Color(0xFFD97706)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                isAr
                    ? 'إرجاع المصعد إلى الوضع الطبيعي'
                    : 'Return Lift to Home',
              ),
            ),
          ],
        ),
        content: Text(
          isAr
              ? 'يرجى التأكد من اكتمال التخزين أو خروج السيارة وخلو منصة المصعد تماماً قبل إرجاع المصعد إلى موضع الانتظار الطبيعي.'
              : 'Please verify that the vehicle has been stored or exited and the lift platform is completely clear before returning the lift to Home.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFD97706),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              isAr ? 'تأكيد الإرجاع' : 'RETURN LIFT TO HOME',
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _submitting = true);
    try {
      await ref.read(appControllerProvider.notifier).api.returnLiftToHome();
      await ref.read(appControllerProvider.notifier).refreshAllData();
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            backgroundColor: const Color(0xFFD97706),
            content: Text(
              isAr
                  ? '✅ تم إرسال أمر إرجاع المصعد إلى الوضع الطبيعي بنجاح'
                  : '✅ Return Lift to Home command dispatched safely',
            ),
          ),
        );
      }
    } on ApiError catch (e) {
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            backgroundColor: AppColors.statusError,
            content: Text(e.localizedMessage(l10n)),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            backgroundColor: AppColors.statusError,
            content: Text(e.toString()),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    final appState = ref.watch(appControllerProvider);
    final allSpaces = appState.spaces;
    final sys = appState.systemStatus;
    final user = appState.user;

    final availableCount =
        allSpaces.where((s) => s.status == SpaceStatus.available).length;
    final occupiedCount =
        allSpaces.where((s) => s.status == SpaceStatus.occupied).length;
    final hasActiveMove = appState.activeRequests.isNotEmpty;
    final isSafetyBlocked = !appState.canDispatchCommands;
    final canRequest = (user?.canRequestParking ?? false) &&
        appState.canDispatchCommands &&
        !_submitting;

    final levels = (appState.dashboard?.levels.isNotEmpty ?? false)
        ? appState.dashboard!.levels
        : allSpaces.map((s) => s.level).toSet().toList()
      ..sort();
    final zones = (appState.dashboard?.zones.isNotEmpty ?? false)
        ? appState.dashboard!.zones
        : allSpaces.map((s) => s.zone).toSet().toList()
      ..sort();

    final filtered = allSpaces.where((s) {
      if (_selectedLevel != null && s.level != _selectedLevel) return false;
      if (_selectedZone != null && s.zone != _selectedZone) return false;
      if (_selectedStatus != null && s.status != _selectedStatus) return false;
      return true;
    }).toList();

    ParkingSpace? selectedSpace;
    if (_selectedSpaceNumber != null) {
      for (final s in allSpaces) {
        if (s.spaceNumber == _selectedSpaceNumber) {
          selectedSpace = s;
          break;
        }
      }
    }

    // Resolve live Lift Status Card state from real backend/system telemetry
    final Color liftColor;
    final IconData liftIcon;
    final String liftTitle;
    final String liftSubtitle;
    final isSystemOnline = appState.networkOnline && appState.backendReachable;
    if (!isSystemOnline || !(sys?.controllerConnected ?? false)) {
      liftColor = AppColors.statusError;
      liftIcon = Icons.cloud_off_rounded;
      liftTitle = isAr ? 'غير متصل بالمصعد' : 'Controller Offline';
      liftSubtitle = isAr
          ? 'لا يمكن تنفيذ حركة حتى استعادة الاتصال'
          : 'Operations paused until PLC connection recovers';
    } else if (isSafetyBlocked) {
      liftColor = AppColors.statusError;
      liftIcon = Icons.gpp_bad_rounded;
      liftTitle = isAr ? 'توقف أمان / إنذار نشط' : 'Safety Interlock Active';
      liftSubtitle = isAr
          ? 'الحركة متوقفة لحين زوال حالة الأمان أو الطوارئ'
          : 'Motion blocked until Emergency Stop / Alarm is cleared';
    } else if (hasActiveMove) {
      final activeReq = appState.activeRequests.first;
      liftColor = const Color(0xFFD97706);
      liftIcon = Icons.elevator_rounded;
      liftTitle = isAr ? 'المصعد يتحرك الآن...' : 'Lift In Motion...';
      liftSubtitle = isAr
          ? 'عملية نشطة: ${activeReq.requestType == 'PARK' ? 'إيداع' : 'استرجاع'} (${activeReq.spaceNumber ?? '—'}) • ${activeReq.status}'
          : 'Active: ${activeReq.requestType} (${activeReq.spaceNumber ?? '—'}) • ${activeReq.status}';
    } else {
      liftColor = const Color(0xFF16A34A);
      liftIcon = Icons.check_circle_rounded;
      liftTitle = isAr ? 'المصعد في وضع الانتظار — جاهز' : 'Lift Standby — Ready';
      liftSubtitle = isAr
          ? 'الموقع الحالي: موضع الانتظار المعتمد • P3 سطح الأرض (دخول/خروج)'
          : 'Current Position: Engineered Home • P3 Ground Entry/Exit';
    }

    return RefreshIndicator(
      onRefresh: () =>
          ref.read(appControllerProvider.notifier).refreshAllData(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
        children: [
          // 1. Live System & Capacity KPI Strip
          Row(
            children: [
              Expanded(
                child: _KpiMiniCard(
                  value: '$availableCount',
                  label: isAr ? 'مواقف فارغة' : 'Available',
                  color: const Color(0xFF16A34A),
                  icon: Icons.check_circle_outline_rounded,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _KpiMiniCard(
                  value: '$occupiedCount',
                  label: isAr ? 'مواقف مشغولة' : 'Occupied',
                  color: AppColors.primaryCyan,
                  icon: Icons.directions_car_filled_rounded,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _KpiMiniCard(
                  value: (isSystemOnline && (sys?.controllerConnected ?? false))
                      ? (isAr ? 'متصل' : 'Online')
                      : (isAr ? 'مفصول' : 'Offline'),
                  label: isAr ? 'حالة النظام' : 'System',
                  color: (isSystemOnline && (sys?.controllerConnected ?? false))
                      ? const Color(0xFF16A34A)
                      : AppColors.statusError,
                  icon: Icons.wifi_tethering_rounded,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // 2. Live Lift Status Card
          Card(
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(color: liftColor.withOpacity(0.6), width: 1.4),
            ),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: liftColor.withOpacity(0.16),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(liftIcon, color: liftColor, size: 26),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isAr ? 'حالة المصعد' : 'Lift Status',
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.4,
                              ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          liftTitle,
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                            color: liftColor,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          liftSubtitle,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Filters & 4-Color Legend
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ChoiceChip(
                  label: Text(l10n.allLevels),
                  selected: _selectedLevel == null,
                  onSelected: (_) => setState(() => _selectedLevel = null),
                ),
                const SizedBox(width: 6),
                for (final lvl in levels.reversed) ...[
                  ChoiceChip(
                    label: Text(
                      lvl == 3
                          ? (isAr ? 'P3 سطح الأرض' : 'P3 Ground')
                          : (lvl == 2
                              ? (isAr ? 'P2 أوسط' : 'P2 Mid')
                              : (isAr ? 'P1 سفلي' : 'P1 Lower')),
                    ),
                    selected: _selectedLevel == lvl,
                    onSelected: (_) => setState(() => _selectedLevel = lvl),
                  ),
                  const SizedBox(width: 6),
                ],
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String?>(
                  value: _selectedZone,
                  decoration: InputDecoration(
                    labelText: l10n.allZones,
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  ),
                  items: [
                    DropdownMenuItem(value: null, child: Text(l10n.allZones)),
                    for (final z in zones)
                      DropdownMenuItem(value: z, child: Text(l10n.zoneLabel(z))),
                  ],
                  onChanged: (v) => setState(() => _selectedZone = v),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<SpaceStatus?>(
                  value: _selectedStatus,
                  decoration: InputDecoration(
                    labelText: l10n.allStatuses,
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  ),
                  items: [
                    DropdownMenuItem(value: null, child: Text(l10n.allStatuses)),
                    for (final st in SpaceStatus.values)
                      DropdownMenuItem(
                        value: st,
                        child: Text(SpaceStatusBadge.labelFor(l10n, st)),
                      ),
                  ],
                  onChanged: (v) => setState(() => _selectedStatus = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              _ColorLegendPill(
                color: const Color(0xFF16A34A),
                label: isAr ? 'فارغ' : 'Empty',
              ),
              _ColorLegendPill(
                color: const Color(0xFFEAB308),
                label: isAr ? 'سيارتك' : 'Your Car',
              ),
              _ColorLegendPill(
                color: const Color(0xFF8B5CF6),
                label: isAr ? 'سيارة أخرى (بواسطتك)' : 'Other Car (You)',
              ),
              _ColorLegendPill(
                color: const Color(0xFFDC2626),
                label: isAr ? 'زملاء' : 'Colleagues',
              ),
            ],
          ),
          const SizedBox(height: 10),

          // 3. Interactive 12-Bay Parking Map (Tap ONLY selects — zero automatic motion)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (int col = 0; col < 4; col++) ...[
                if (col > 0) const SizedBox(width: 6),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: Theme.of(context).cardColor.withOpacity(0.45),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: Theme.of(context).dividerColor.withOpacity(0.35),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Text(
                            'Lane ${col + 1}',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 11,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                        ),
                        for (final sp in (filtered
                            .where((s) =>
                                s.zone == 'Lane ${col + 1}' ||
                                (!s.zone.startsWith('Lane') &&
                                    filtered.indexOf(s) ~/ 3 == col))
                            .toList()
                          ..sort((a, b) => a.level.compareTo(b.level)))) ...[
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: _buildSpaceCard(
                              context,
                              sp,
                              user,
                              isSelected: sp.spaceNumber == _selectedSpaceNumber,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),

          // 4. Inline Selected Bay Action Panel (Unified Single-Screen Control)
          Card(
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(
                color: selectedSpace != null
                    ? Theme.of(context).colorScheme.primary.withOpacity(0.65)
                    : Theme.of(context).dividerColor.withOpacity(0.4),
                width: 1.5,
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        isAr ? 'إجراءات الموقف المحدد' : 'Selected Bay Actions',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                      ),
                      if (selectedSpace != null)
                        SpaceStatusBadge(status: selectedSpace.status),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (selectedSpace == null)
                    Text(
                      isAr
                          ? 'اضغط على أي موقف من الخريطة أعلاه لتحديده (التحديد لا يحرّك المصعد تلقائياً).'
                          : 'Tap any bay on the map above to select it (selecting a bay never moves the lift automatically).',
                      style: Theme.of(context).textTheme.bodySmall,
                    )
                  else ...[
                    Text(
                      isAr
                          ? 'الموقف المحدد: ${selectedSpace.spaceNumber} — ${selectedSpace.zone}'
                          : 'Selected Bay: ${selectedSpace.spaceNumber} — ${selectedSpace.zone}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _floorDescription(selectedSpace.level, isAr),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 12),
                    if (selectedSpace.status == SpaceStatus.available) ...[
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF16A34A),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                        ),
                        onPressed: (canRequest && !hasActiveMove)
                            ? () => _confirmAndCallLift(
                                  space: selectedSpace!,
                                  isPark: true,
                                )
                            : null,
                        icon: _submitting
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.elevator_rounded),
                        label: Text(
                          isAr
                              ? 'استدعاء المصعد (${selectedSpace.spaceNumber}) — CALL LIFT'
                              : 'CALL LIFT (${selectedSpace.spaceNumber})',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ] else if (selectedSpace.status == SpaceStatus.occupied) ...[
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primaryCyan,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                        ),
                        onPressed: (canRequest && !hasActiveMove)
                            ? () => _confirmAndCallLift(
                                  space: selectedSpace!,
                                  isPark: false,
                                )
                            : null,
                        icon: _submitting
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.directions_car_rounded),
                        label: Text(
                          isAr
                              ? 'استدعاء السيارة (${selectedSpace.spaceNumber}) — RETRIEVE'
                              : 'RETRIEVE VEHICLE (${selectedSpace.spaceNumber})',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                  ],
                  const SizedBox(height: 10),
                  // Independent Return Lift to Home Button (Step 2)
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFFD97706),
                      side: const BorderSide(
                        color: Color(0xFFD97706),
                        width: 1.5,
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: canRequest ? _confirmAndReturnLiftToHome : null,
                    icon: const Icon(Icons.home_work_rounded, size: 19),
                    label: Text(
                      isAr
                          ? 'إرجاع المصعد إلى الوضع الطبيعي — RETURN LIFT TO HOME'
                          : 'RETURN LIFT TO HOME',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Color _colorForCategory(String cat) {
    switch (cat) {
      case 'YELLOW_MY_CAR':
        return const Color(0xFFEAB308);
      case 'PURPLE_PARKED_OTHER':
        return const Color(0xFF8B5CF6);
      case 'RED_COLLEAGUE':
        return const Color(0xFFDC2626);
      default:
        return const Color(0xFF16A34A);
    }
  }

  String _labelForCategory(String cat, bool isAr) {
    switch (cat) {
      case 'YELLOW_MY_CAR':
        return isAr ? 'سيارتك' : 'Your Car';
      case 'PURPLE_PARKED_OTHER':
        return isAr ? 'أخرى' : 'Other';
      case 'RED_COLLEAGUE':
        return isAr ? 'مشغول' : 'Occupied';
      default:
        return isAr ? 'فارغ' : 'Empty';
    }
  }

  IconData _iconForCategory(String cat) {
    switch (cat) {
      case 'YELLOW_MY_CAR':
        return Icons.directions_car_filled_rounded;
      case 'PURPLE_PARKED_OTHER':
        return Icons.swap_vert_circle_rounded;
      case 'RED_COLLEAGUE':
        return Icons.lock_rounded;
      default:
        return Icons.check_circle_outline_rounded;
    }
  }

  Widget _buildSpaceCard(
    BuildContext context,
    ParkingSpace space,
    User? viewer, {
    required bool isSelected,
  }) {
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    final cat = space.resolveColorCategory(viewer);
    final color = _colorForCategory(cat);
    final icon = _iconForCategory(cat);
    final label = _labelForCategory(cat, isAr);

    return Card(
      margin: EdgeInsets.zero,
      elevation: isSelected ? 4 : 0,
      color: isSelected ? color.withOpacity(0.28) : color.withOpacity(0.13),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(
          color: isSelected
              ? Theme.of(context).colorScheme.primary
              : color.withOpacity(0.8),
          width: isSelected ? 2.4 : 1.3,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => setState(() => _selectedSpaceNumber = space.spaceNumber),
        child: Padding(
          padding: const EdgeInsets.all(7),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    space.spaceNumber,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12.5,
                    ),
                  ),
                  Icon(
                    isSelected ? Icons.radio_button_checked_rounded : icon,
                    color: isSelected
                        ? Theme.of(context).colorScheme.primary
                        : color,
                    size: 16,
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _KpiMiniCard extends StatelessWidget {
  const _KpiMiniCard({
    required this.value,
    required this.label,
    required this.color,
    required this.icon,
  });

  final String value;
  final String label;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: color.withOpacity(0.45)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        child: Column(
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 16,
                color: color,
              ),
            ),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelSmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _ColorLegendPill extends StatelessWidget {
  const _ColorLegendPill({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.16),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.65)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

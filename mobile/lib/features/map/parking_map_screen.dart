import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/network/api_error.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/alarm_severity_badge.dart';
import '../../l10n/generated/app_localizations.dart';

class ParkingMapScreen extends ConsumerStatefulWidget {
  const ParkingMapScreen({super.key});

  @override
  ConsumerState<ParkingMapScreen> createState() => _ParkingMapScreenState();
}

class _ParkingMapScreenState extends ConsumerState<ParkingMapScreen> {
  int? _selectedLevel;
  String? _selectedZone;
  SpaceStatus? _selectedStatus;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final appState = ref.watch(appControllerProvider);
    final allSpaces = appState.spaces;

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

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
          color: Theme.of(context).appBarTheme.backgroundColor,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    ChoiceChip(
                      label: Text(l10n.allLevels),
                      selected: _selectedLevel == null,
                      onSelected: (_) => setState(() => _selectedLevel = null),
                    ),
                    const SizedBox(width: 8),
                    for (final lvl in levels) ...[
                      ChoiceChip(
                        label: Text(l10n.levelLabel(lvl)),
                        selected: _selectedLevel == lvl,
                        onSelected: (_) => setState(() => _selectedLevel = lvl),
                      ),
                      const SizedBox(width: 8),
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
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                      ),
                      items: [
                        DropdownMenuItem(
                          value: null,
                          child: Text(l10n.allZones),
                        ),
                        for (final z in zones)
                          DropdownMenuItem(
                            value: z,
                            child: Text(l10n.zoneLabel(z)),
                          ),
                      ],
                      onChanged: (v) => setState(() => _selectedZone = v),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<SpaceStatus?>(
                      value: _selectedStatus,
                      decoration: InputDecoration(
                        labelText: l10n.allStatuses,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                      ),
                      items: [
                        DropdownMenuItem(
                          value: null,
                          child: Text(l10n.allStatuses),
                        ),
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
              // 4-Color Legend Bar matching employee parking rules (fully bilingual)
              Builder(
                builder: (ctx) {
                  final isAr = Localizations.localeOf(ctx).languageCode == 'ar';
                  return Wrap(
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
                        label: isAr ? 'حرّكته لسيارة أخرى' : 'Other Car (By You)',
                      ),
                      _ColorLegendPill(
                        color: const Color(0xFFDC2626),
                        label: isAr ? 'سيارات الزملاء' : 'Colleagues',
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () =>
                ref.read(appControllerProvider.notifier).refreshSpacesSilent(),
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (int col = 0; col < 4; col++) ...[
                      if (col > 0) const SizedBox(width: 8),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: Theme.of(context).cardColor.withOpacity(0.45),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: Theme.of(context).dividerColor.withOpacity(0.35),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Text(
                                  'Lane ${col + 1}',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 11.5,
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
                                ..sort((a, b) => b.level.compareTo(a.level)))) ...[
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: _buildSpaceCard(context, sp, appState.user),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Color _colorForCategory(String cat) {
    switch (cat) {
      case 'YELLOW_MY_CAR':
        return const Color(0xFFEAB308); // أصفر: سيارة الموظف نفسه
      case 'PURPLE_PARKED_OTHER':
        return const Color(0xFF8B5CF6); // نهدي: حرّكه الموظف لسيارة أخرى
      case 'RED_COLLEAGUE':
        return const Color(0xFFDC2626); // أحمر: سيارة زميل محجوزة
      default:
        return const Color(0xFF16A34A); // أخضر: مصف فارغ
    }
  }

  String _labelForCategory(String cat, bool isAr) {
    switch (cat) {
      case 'YELLOW_MY_CAR':
        return isAr ? 'سيارتك' : 'Your Car';
      case 'PURPLE_PARKED_OTHER':
        return isAr ? 'سيارة أخرى (بواسطتك)' : 'Other Car (You)';
      case 'RED_COLLEAGUE':
        return isAr ? 'زميل (محجوز)' : 'Colleague';
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

  Widget _buildSpaceCard(BuildContext context, ParkingSpace space, User? viewer) {
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    final cat = space.resolveColorCategory(viewer);
    final color = _colorForCategory(cat);
    final icon = _iconForCategory(cat);
    final label = _labelForCategory(cat, isAr);
    return Card(
      margin: EdgeInsets.zero,
      color: color.withOpacity(0.14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: color.withOpacity(0.85),
          width: 1.6,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showSpaceDetails(context, space, viewer),
        child: Padding(
          padding: const EdgeInsets.all(9),
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
                      fontSize: 13,
                    ),
                  ),
                  Icon(icon, color: color, size: 17),
                ],
              ),
              const SizedBox(height: 6),
              if (space.vehiclePlate != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.22),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      space.vehiclePlate!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: color,
                      ),
                    ),
                  ),
                ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSpaceDetails(BuildContext context, ParkingSpace space, User? viewer) {
    final l10n = AppLocalizations.of(context);
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    final cat = space.resolveColorCategory(viewer);
    final catColor = _colorForCategory(cat);
    final catLabel = _labelForCategory(cat, isAr);
    final appState = ref.read(appControllerProvider);
    final vehicles = appState.vehicles;

    String? selectedVehicleId = vehicles.isNotEmpty ? vehicles.first.id : null;
    final plateCtrl = TextEditingController();
    bool submitting = false;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          final isAvailable = space.status == SpaceStatus.available;
          final isOccupied = space.status == SpaceStatus.occupied;

          Future<void> dispatchMove({required bool isPark}) async {
            final manualPlate = plateCtrl.text.trim().toUpperCase();
            final useManual = manualPlate.isNotEmpty;
            if (isPark && !useManual && (selectedVehicleId == null || selectedVehicleId!.isEmpty)) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    isAr
                        ? 'اختر مركبة أو أدخل رقم اللوحة أولاً'
                        : 'Select a vehicle or enter a plate number first',
                  ),
                ),
              );
              return;
            }
            setSheetState(() => submitting = true);
            try {
              final api = ref.read(appControllerProvider.notifier).api;
              final req = isPark
                  ? await api.requestPark(
                      vehicleId: useManual ? null : selectedVehicleId,
                      plateNumber: useManual ? manualPlate : null,
                      targetSpaceNumber: space.spaceNumber,
                    )
                  : await api.requestRetrieve(
                      plateNumber: space.vehiclePlate,
                      targetSpaceNumber: space.spaceNumber,
                    );
              ref.read(appControllerProvider.notifier).upsertRequest(req);
              await ref.read(appControllerProvider.notifier).refreshAllData();
              if (ctx.mounted) Navigator.of(ctx).pop();
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    backgroundColor: const Color(0xFF16A34A),
                    content: Text(
                      isPark
                          ? (isAr
                              ? '✅ تم إرسال أمر الإيداع وتحريك المصعد إلى ${space.spaceNumber}'
                              : '✅ Park & lift move dispatched to ${space.spaceNumber}')
                          : (isAr
                              ? '✅ تم إرسال أمر الاسترجاع وتحريك المصعد من ${space.spaceNumber}'
                              : '✅ Retrieve & lift move dispatched from ${space.spaceNumber}'),
                    ),
                  ),
                );
              }
            } on ApiError catch (e) {
              setSheetState(() => submitting = false);
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    backgroundColor: AppColors.statusError,
                    content: Text(e.localizedMessage(l10n)),
                  ),
                );
              }
            } catch (e) {
              setSheetState(() => submitting = false);
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    backgroundColor: AppColors.statusError,
                    content: Text(e.toString()),
                  ),
                );
              }
            }
          }

          return SafeArea(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                20,
                20,
                20 + MediaQuery.of(ctx).viewInsets.bottom,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          l10n.spaceDetailsTitle(space.spaceNumber),
                          style: Theme.of(ctx).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                        ),
                        SpaceStatusBadge(status: space.status),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: catColor.withOpacity(0.18),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: catColor.withOpacity(0.7)),
                        ),
                        child: Text(
                          catLabel,
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: catColor,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      '${l10n.levelLabel(space.level)} • ${l10n.zoneLabel(space.zone)}',
                    ),
                    if (space.vehiclePlate != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        '${l10n.plateNumber}: ${space.vehiclePlate}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppColors.primaryCyan,
                        ),
                      ),
                    ],
                    if (space.parkedByUsername != null &&
                        space.parkedByUsername!.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        isAr
                            ? 'تم التحريك بواسطة: ${space.parkedByUsername}'
                            : 'Moved by: ${space.parkedByUsername}',
                        style: const TextStyle(fontSize: 12.5),
                      ),
                    ],
                    if (isAvailable) ...[
                      const SizedBox(height: 16),
                      const Divider(),
                      const SizedBox(height: 8),
                      if (vehicles.isNotEmpty) ...[
                        DropdownButtonFormField<String>(
                          value: selectedVehicleId,
                          decoration: InputDecoration(
                            labelText: isAr
                                ? 'اختر مركبة مسجلة'
                                : 'Select Registered Vehicle',
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                          ),
                          items: [
                            for (final v in vehicles)
                              DropdownMenuItem(
                                value: v.id,
                                child: Text(v.displayName),
                              ),
                          ],
                          onChanged: submitting
                              ? null
                              : (val) =>
                                  setSheetState(() => selectedVehicleId = val),
                        ),
                        const SizedBox(height: 10),
                      ],
                      TextField(
                        controller: plateCtrl,
                        enabled: !submitting,
                        textCapitalization: TextCapitalization.characters,
                        decoration: InputDecoration(
                          labelText: isAr
                              ? 'أو أدخل رقم اللوحة يدوياً (اختياري)'
                              : 'Or enter plate number manually (optional)',
                          hintText: '10-45821',
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF16A34A),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                        ),
                        onPressed: submitting
                            ? null
                            : () => dispatchMove(isPark: true),
                        icon: submitting
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.local_parking_rounded),
                        label: Text(
                          isAr
                              ? 'إيداع وتحريك المصعد إلى ${space.spaceNumber}'
                              : 'Park & Move Lift to ${space.spaceNumber}',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                    if (isOccupied) ...[
                      const SizedBox(height: 16),
                      const Divider(),
                      const SizedBox(height: 10),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primaryCyan,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                        ),
                        onPressed: submitting
                            ? null
                            : () => dispatchMove(isPark: false),
                        icon: submitting
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
                              ? 'استرجاع وتحريك المصعد من ${space.spaceNumber}'
                              : 'Retrieve & Move Lift from ${space.spaceNumber}',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
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

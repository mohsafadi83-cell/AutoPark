import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/models/models.dart';
import '../../core/network/api_error.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';

class VehiclesScreen extends ConsumerWidget {
  const VehiclesScreen({super.key});

  Future<void> _openEditor(
    BuildContext context,
    WidgetRef ref, {
    Vehicle? existing,
  }) async {
    final l10n = AppLocalizations.of(context);
    final plateCtrl = TextEditingController(text: existing?.plateNumber ?? '');
    final brandCtrl = TextEditingController(text: existing?.brand ?? '');
    final modelCtrl = TextEditingController(text: existing?.model ?? '');
    final colorCtrl = TextEditingController(text: existing?.color ?? '');
    final typeCtrl = TextEditingController(text: existing?.vehicleType ?? '');

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(existing == null ? l10n.addVehicle : l10n.editVehicle),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: plateCtrl,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(labelText: l10n.plateNumber),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: brandCtrl,
                decoration: InputDecoration(labelText: l10n.vehicleBrand),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: modelCtrl,
                decoration: InputDecoration(labelText: l10n.vehicleModel),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: colorCtrl,
                decoration: InputDecoration(labelText: l10n.vehicleColor),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: typeCtrl,
                decoration: InputDecoration(labelText: l10n.vehicleType),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.save),
          ),
        ],
      ),
    );
    if (saved != true || !context.mounted) return;
    final plate = plateCtrl.text.trim();
    if (plate.isEmpty) return;

    try {
      final api = ref.read(appControllerProvider.notifier).api;
      if (existing == null) {
        await api.createVehicle(
          plateNumber: plate,
          brand: brandCtrl.text.trim(),
          model: modelCtrl.text.trim(),
          color: colorCtrl.text.trim(),
          vehicleType: typeCtrl.text.trim(),
        );
      } else {
        await api.updateVehicle(
          existing.id,
          plateNumber: plate,
          brand: brandCtrl.text.trim(),
          model: modelCtrl.text.trim(),
          color: colorCtrl.text.trim(),
          vehicleType: typeCtrl.text.trim(),
        );
      }
      await ref.read(appControllerProvider.notifier).refreshVehiclesSilent();
    } on ApiError catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.statusError,
          content: Text(e.localizedMessage(l10n)),
        ),
      );
    }
  }

  Future<void> _deleteVehicle(
    BuildContext context,
    WidgetRef ref,
    Vehicle vehicle,
  ) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.deleteVehicle),
        content: Text(l10n.deleteVehicleConfirm(vehicle.plateNumber)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.statusError,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.confirm),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await ref
          .read(appControllerProvider.notifier)
          .api
          .deleteVehicle(vehicle.id);
      await ref.read(appControllerProvider.notifier).refreshVehiclesSilent();
    } on ApiError catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.statusError,
          content: Text(e.localizedMessage(l10n)),
        ),
      );
    }
  }

  Future<void> _showHistory(
    BuildContext context,
    WidgetRef ref,
    Vehicle vehicle,
  ) async {
    final l10n = AppLocalizations.of(context);
    final fmt = DateFormat('yyyy-MM-dd HH:mm');
    List<ParkingRequest> history = const [];
    try {
      history = await ref
          .read(appControllerProvider.notifier)
          .api
          .getVehicleHistory(vehicle.id);
    } catch (_) {}
    if (!context.mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.vehicleHistoryTitle(vehicle.plateNumber),
                style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: history.isEmpty
                    ? Center(child: Text(l10n.noActiveRequests))
                    : ListView.builder(
                        itemCount: history.length,
                        itemBuilder: (_, i) {
                          final r = history[i];
                          return ListTile(
                            leading: Icon(
                              r.requestType == 'PARK'
                                  ? Icons.south_east_rounded
                                  : Icons.north_east_rounded,
                              color: AppColors.primaryCyan,
                            ),
                            title: Text('${r.requestType} • ${r.requestNumber}'),
                            subtitle: Text(
                              '${r.status} • ${fmt.format(r.createdAt.toLocal())}',
                            ),
                            trailing: r.spaceNumber != null
                                ? Text(
                                    r.spaceNumber!,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  )
                                : null,
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final appState = ref.watch(appControllerProvider);
    final canManage = appState.user?.canManageVehicles ?? false;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.vehiclesScreenTitle),
      ),
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              onPressed: () => _openEditor(context, ref),
              icon: const Icon(Icons.add_rounded),
              label: Text(l10n.addVehicle),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(appControllerProvider.notifier).refreshVehiclesSilent(),
        child: ListView.builder(
          padding: const EdgeInsets.all(14),
          itemCount: appState.vehicles.length,
          itemBuilder: (context, index) {
            final v = appState.vehicles[index];
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Card(
                margin: EdgeInsets.zero,
                child: ListTile(
                  leading: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: (v.parked
                              ? AppColors.statusOnline
                              : AppColors.statusOffline)
                          .withOpacity(0.16),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.directions_car_filled_rounded,
                      color: v.parked
                          ? AppColors.statusOnline
                          : AppColors.statusOffline,
                    ),
                  ),
                  title: Text(
                    v.displayName,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(
                    v.parked && v.parkingSpaceNumber != null
                        ? l10n.vehicleParkedBadge(v.parkingSpaceNumber!)
                        : l10n.vehicleNotParkedBadge,
                  ),
                  onTap: () => _showHistory(context, ref, v),
                  trailing: canManage
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              onPressed: () =>
                                  _openEditor(context, ref, existing: v),
                              icon: const Icon(Icons.edit_outlined),
                            ),
                            IconButton(
                              onPressed: () =>
                                  _deleteVehicle(context, ref, v),
                              icon: const Icon(
                                Icons.delete_outline_rounded,
                                color: AppColors.statusError,
                              ),
                            ),
                          ],
                        )
                      : null,
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

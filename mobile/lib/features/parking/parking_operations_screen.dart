import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/network/api_error.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/request_step_timeline.dart';
import '../../l10n/generated/app_localizations.dart';

class ParkingOperationsScreen extends ConsumerStatefulWidget {
  const ParkingOperationsScreen({
    super.key,
    this.initialSubTab = 0,
  });

  final int initialSubTab;

  @override
  ConsumerState<ParkingOperationsScreen> createState() =>
      _ParkingOperationsScreenState();
}

class _ParkingOperationsScreenState
    extends ConsumerState<ParkingOperationsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  String? _selectedParkVehicleId;
  String? _selectedRetrieveVehicleId;
  final _manualParkPlateCtrl = TextEditingController();
  final _manualRetrievePlateCtrl = TextEditingController();
  bool _parkIsOtherVehicle = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialSubTab.clamp(0, 1),
    );
  }

  @override
  void didUpdateWidget(covariant ParkingOperationsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialSubTab != widget.initialSubTab) {
      _tabController.animateTo(widget.initialSubTab.clamp(0, 1));
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    _manualParkPlateCtrl.dispose();
    _manualRetrievePlateCtrl.dispose();
    super.dispose();
  }

  Future<void> _confirmAndDispatch({
    required bool isPark,
    Vehicle? vehicle,
    String? manualPlate,
  }) async {
    final l10n = AppLocalizations.of(context);
    final plate = vehicle?.plateNumber ?? manualPlate?.trim().toUpperCase() ?? '';
    if (plate.isEmpty && vehicle == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.plateNumberRequired)),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            Icon(
              isPark ? Icons.south_east_rounded : Icons.north_east_rounded,
              color: AppColors.primaryCyan,
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(l10n.confirmOperationTitle)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _ConfirmRow(
              label: l10n.operationType,
              value: isPark ? l10n.operationPark : l10n.operationRetrieve,
            ),
            const SizedBox(height: 8),
            _ConfirmRow(
              label: l10n.plateNumber,
              value: vehicle?.displayName ?? plate,
            ),
            if (!isPark && vehicle?.parkingSpaceNumber != null) ...[
              const SizedBox(height: 8),
              _ConfirmRow(
                label: l10n.assignedSpace,
                value: vehicle!.parkingSpaceNumber!,
              ),
            ],
            const SizedBox(height: 8),
            _ConfirmRow(
              label: l10n.estimatedStatus,
              value: l10n.readyForDispatch,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.of(ctx).pop(true),
            icon: const Icon(Icons.send_rounded, size: 18),
            label: Text(l10n.submitRequest),
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
              vehicleId: vehicle?.id,
              plateNumber: vehicle == null ? plate : null,
              isOtherVehicle: _parkIsOtherVehicle,
            )
          : await api.requestRetrieve(
              vehicleId: vehicle?.id,
              plateNumber: vehicle == null ? plate : null,
            );
      ref.read(appControllerProvider.notifier).upsertRequest(req);
      await ref.read(appControllerProvider.notifier).refreshAllData();
      _manualParkPlateCtrl.clear();
      _manualRetrievePlateCtrl.clear();
    } on ApiError catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.statusError,
          content: Text(e.localizedMessage(l10n)),
        ),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _cancelRequest(ParkingRequest req) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.cancelRequest),
        content: Text(l10n.cancelRequestConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.close),
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
    if (ok != true || !mounted) return;
    try {
      final updated = await ref
          .read(appControllerProvider.notifier)
          .api
          .cancelRequest(req.id);
      ref.read(appControllerProvider.notifier).upsertRequest(updated);
      await ref.read(appControllerProvider.notifier).refreshAllData();
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
    final user = appState.user;
    final canDispatch = appState.canDispatchCommands &&
        (user?.canRequestParking ?? false) &&
        !_submitting;
    final canManualPlate = user?.canRequestAnyVehicle ?? false;

    final unparkedVehicles =
        appState.vehicles.where((v) => !v.parked).toList();
    final parkedVehicles = appState.vehicles.where((v) => v.parked).toList();

    return Column(
      children: [
        Material(
          color: Theme.of(context).appBarTheme.backgroundColor,
          child: TabBar(
            controller: _tabController,
            tabs: [
              Tab(
                icon: const Icon(Icons.south_east_rounded),
                text: l10n.parkScreenTitle,
              ),
              Tab(
                icon: const Icon(Icons.north_east_rounded),
                text: l10n.retrieveScreenTitle,
              ),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildOperationTab(
                context: context,
                l10n: l10n,
                isPark: true,
                vehicles: unparkedVehicles,
                selectedVehicleId: _selectedParkVehicleId,
                onSelectVehicle: (id) =>
                    setState(() => _selectedParkVehicleId = id),
                manualPlateCtrl: _manualParkPlateCtrl,
                canManualPlate: canManualPlate,
                canDispatch: canDispatch,
                requests: appState.activeRequests
                    .where((r) => r.requestType == 'PARK')
                    .toList(),
              ),
              _buildOperationTab(
                context: context,
                l10n: l10n,
                isPark: false,
                vehicles: parkedVehicles,
                selectedVehicleId: _selectedRetrieveVehicleId,
                onSelectVehicle: (id) =>
                    setState(() => _selectedRetrieveVehicleId = id),
                manualPlateCtrl: _manualRetrievePlateCtrl,
                canManualPlate: canManualPlate,
                canDispatch: canDispatch,
                requests: appState.activeRequests
                    .where((r) => r.requestType == 'RETRIEVE')
                    .toList(),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildOperationTab({
    required BuildContext context,
    required AppLocalizations l10n,
    required bool isPark,
    required List<Vehicle> vehicles,
    required String? selectedVehicleId,
    required ValueChanged<String?> onSelectVehicle,
    required TextEditingController manualPlateCtrl,
    required bool canManualPlate,
    required bool canDispatch,
    required List<ParkingRequest> requests,
  }) {
    final effectiveSelected = vehicles.any((v) => v.id == selectedVehicleId)
        ? selectedVehicleId
        : (vehicles.isNotEmpty ? vehicles.first.id : null);
    final chosenVehicle =
        vehicles.where((v) => v.id == effectiveSelected).firstOrNull;

    return RefreshIndicator(
      onRefresh: () => ref.read(appControllerProvider.notifier).refreshAllData(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    isPark ? l10n.parkScreenTitle : l10n.retrieveScreenTitle,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  if (isPark) ...[
                    const SizedBox(height: 10),
                    Builder(
                      builder: (ctx) {
                        final isAr =
                            Localizations.localeOf(ctx).languageCode == 'ar';
                        return Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: [
                            ChoiceChip(
                              selectedColor:
                                  const Color(0xFFEAB308).withOpacity(0.28),
                              label: Text(
                                isAr
                                    ? '🟡 سيارتي الشخصية (أصفر)'
                                    : '🟡 My Personal Car (Yellow)',
                              ),
                              selected: !_parkIsOtherVehicle,
                              onSelected: (_) =>
                                  setState(() => _parkIsOtherVehicle = false),
                            ),
                            ChoiceChip(
                              selectedColor:
                                  const Color(0xFF8B5CF6).withOpacity(0.28),
                              label: Text(
                                isAr
                                    ? '🟣 سيارة أخرى / زائر (نهدي)'
                                    : '🟣 Other / Guest Car (Purple)',
                              ),
                              selected: _parkIsOtherVehicle,
                              onSelected: (_) =>
                                  setState(() => _parkIsOtherVehicle = true),
                            ),
                          ],
                        );
                      },
                    ),
                  ],
                  const SizedBox(height: 14),
                  if (vehicles.isEmpty && !canManualPlate)
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.statusWarning.withOpacity(0.14),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        isPark
                            ? l10n.noAvailableVehiclesToPark
                            : l10n.noParkedVehiclesToRetrieve,
                      ),
                    )
                  else if (vehicles.isNotEmpty) ...[
                    DropdownButtonFormField<String>(
                      value: effectiveSelected,
                      decoration: InputDecoration(
                        labelText: l10n.selectVehicle,
                        prefixIcon:
                            const Icon(Icons.directions_car_filled_rounded),
                      ),
                      items: [
                        for (final v in vehicles)
                          DropdownMenuItem(
                            value: v.id,
                            child: Text(
                              v.parkingSpaceNumber != null
                                  ? '${v.displayName} (${v.parkingSpaceNumber})'
                                  : v.displayName,
                            ),
                          ),
                      ],
                      onChanged: onSelectVehicle,
                    ),
                  ],
                  if (canManualPlate) ...[
                    const SizedBox(height: 14),
                    TextField(
                      controller: manualPlateCtrl,
                      textCapitalization: TextCapitalization.characters,
                      decoration: InputDecoration(
                        labelText: l10n.enterPlateManual,
                        hintText: 'ABC-1234',
                        prefixIcon: const Icon(Icons.pin_rounded),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    key: Key(
                      isPark
                          ? 'submit_park_request_btn'
                          : 'submit_retrieve_request_btn',
                    ),
                    onPressed: canDispatch
                        ? () {
                            final manual = manualPlateCtrl.text.trim();
                            _confirmAndDispatch(
                              isPark: isPark,
                              vehicle: manual.isNotEmpty ? null : chosenVehicle,
                              manualPlate: manual.isNotEmpty ? manual : null,
                            );
                          }
                        : null,
                    icon: Icon(
                      isPark
                          ? Icons.south_east_rounded
                          : Icons.north_east_rounded,
                    ),
                    label: Text(l10n.submitRequest),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            l10n.liveProgressTitle,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 10),
          if (requests.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Text(l10n.noActiveRequests),
              ),
            )
          else
            for (final req in requests)
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
                            Expanded(
                              child: Text(
                                '${req.plateNumber} • ${req.requestNumber}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                ),
                              ),
                            ),
                            if (req.spaceNumber != null)
                              Chip(
                                label: Text(
                                  '${l10n.assignedSpace}: ${req.spaceNumber}',
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        RequestStepTimeline(request: req),
                        const SizedBox(height: 8),
                        if (req.canBeCancelled)
                          Align(
                            alignment: AlignmentDirectional.centerEnd,
                            child: OutlinedButton.icon(
                              onPressed: () => _cancelRequest(req),
                              icon: const Icon(
                                Icons.cancel_outlined,
                                color: AppColors.statusError,
                              ),
                              label: Text(l10n.cancelRequest),
                            ),
                          )
                        else if (req.isActive)
                          Text(
                            l10n.commandAlreadySentNote,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.statusWarning,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

class _ConfirmRow extends StatelessWidget {
  const _ConfirmRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 2,
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
        Expanded(
          flex: 3,
          child: Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              color: AppColors.primaryCyan,
            ),
          ),
        ),
      ],
    );
  }
}

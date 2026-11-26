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
  String? _selectedParkSpaceNumber;
  String? _selectedRetrieveSpaceNumber;
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
    super.dispose();
  }

  String _bayLabel(ParkingSpace space, bool isAr) {
    final floorTxt = space.level == 1
        ? (isAr ? 'P1 (علوي)' : 'P1 (Top)')
        : (space.level == 2
            ? (isAr ? 'P2 (أوسط)' : 'P2 (Mid)')
            : (isAr ? 'P3 (سفلي)' : 'P3 (Bottom)'));
    return '${space.spaceNumber} — ${space.zone} • $floorTxt';
  }

  Future<void> _confirmAndDispatch({
    required bool isPark,
    required ParkingSpace? space,
  }) async {
    final l10n = AppLocalizations.of(context);
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    if (space == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isPark
                ? (isAr ? 'لا توجد مواقف فارغة متاحة حالياً' : 'No empty bays available right now')
                : (isAr ? 'لا توجد مواقف مشغولة للاسترجاع حالياً' : 'No occupied bays available for retrieval'),
          ),
        ),
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
              label: l10n.assignedSpace,
              value: _bayLabel(space, isAr),
            ),
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
      final notifier = ref.read(appControllerProvider.notifier);
      final api = notifier.api;
      final req = isPark
          ? await api.requestPark(
              targetSpaceNumber: space.spaceNumber,
            )
          : await api.requestRetrieve(
              plateNumber: space.vehiclePlate,
              targetSpaceNumber: space.spaceNumber,
            );
      await notifier.dispatchExeAutoHandshake(
        spaceNumber: space.spaceNumber,
        isPark: isPark,
      );
      notifier.upsertRequest(req);
      await notifier.refreshAllData();
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

    int compareBays(ParkingSpace a, ParkingSpace b) {
      final zoneCmp = a.zone.compareTo(b.zone);
      if (zoneCmp != 0) return zoneCmp;
      final lvlCmp = a.level.compareTo(b.level);
      if (lvlCmp != 0) return lvlCmp;
      return a.spaceNumber.compareTo(b.spaceNumber);
    }

    final availableSpaces = appState.spaces
        .where((s) => s.status == SpaceStatus.available)
        .toList()
      ..sort(compareBays);
    final occupiedSpaces = appState.spaces
        .where((s) => s.status == SpaceStatus.occupied)
        .toList()
      ..sort(compareBays);

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
                spaces: availableSpaces,
                selectedSpaceNumber: _selectedParkSpaceNumber,
                onSelectSpace: (spaceNum) =>
                    setState(() => _selectedParkSpaceNumber = spaceNum),
                canDispatch: canDispatch,
                requests: appState.activeRequests
                    .where((r) => r.requestType == 'PARK')
                    .toList(),
              ),
              _buildOperationTab(
                context: context,
                l10n: l10n,
                isPark: false,
                spaces: occupiedSpaces,
                selectedSpaceNumber: _selectedRetrieveSpaceNumber,
                onSelectSpace: (spaceNum) =>
                    setState(() => _selectedRetrieveSpaceNumber = spaceNum),
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
    required List<ParkingSpace> spaces,
    required String? selectedSpaceNumber,
    required ValueChanged<String?> onSelectSpace,
    required bool canDispatch,
    required List<ParkingRequest> requests,
  }) {
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    final effectiveSelected =
        spaces.any((s) => s.spaceNumber == selectedSpaceNumber)
            ? selectedSpaceNumber
            : (spaces.isNotEmpty ? spaces.first.spaceNumber : null);
    final chosenSpace =
        spaces.where((s) => s.spaceNumber == effectiveSelected).firstOrNull;

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
                  const SizedBox(height: 14),
                  if (spaces.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.statusWarning.withOpacity(0.14),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        isPark
                            ? (isAr
                                ? 'لا توجد مواقف فارغة متاحة حالياً (جميع المواقف الـ 12 مشغولة).'
                                : 'No available empty bays right now (all 12 bays are occupied).')
                            : (isAr
                                ? 'لا توجد مواقف مشغولة جاهزة للاسترجاع حالياً.'
                                : 'No occupied bays found ready for retrieval.'),
                      ),
                    )
                  else
                    DropdownButtonFormField<String>(
                      value: effectiveSelected,
                      decoration: InputDecoration(
                        labelText: isPark
                            ? (isAr
                                ? 'اختر الموقف الفارغ (L11 – L43)'
                                : 'Select Empty Bay (L11 – L43)')
                            : (isAr
                                ? 'اختر الموقف المشغول للاسترجاع (L11 – L43)'
                                : 'Select Occupied Bay to Retrieve (L11 – L43)'),
                        prefixIcon: const Icon(Icons.grid_view_rounded),
                      ),
                      items: [
                        for (final s in spaces)
                          DropdownMenuItem(
                            value: s.spaceNumber,
                            child: Text(_bayLabel(s, isAr)),
                          ),
                      ],
                      onChanged: onSelectSpace,
                    ),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    key: Key(
                      isPark
                          ? 'submit_park_request_btn'
                          : 'submit_retrieve_request_btn',
                    ),
                    onPressed: (canDispatch && chosenSpace != null)
                        ? () => _confirmAndDispatch(
                              isPark: isPark,
                              space: chosenSpace,
                            )
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
                                '${req.spaceNumber ?? (isAr ? 'موقف' : 'Bay')} • ${req.requestNumber}',
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

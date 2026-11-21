import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/models/models.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  String? _selectedKind;
  final _searchCtrl = TextEditingController();
  DateTimeRange? _dateRange;
  bool _loading = true;
  List<HistoryItem> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ref
          .read(appControllerProvider.notifier)
          .api
          .getHistory(
            kind: _selectedKind,
            q: _searchCtrl.text.trim(),
            from: _dateRange?.start,
            to: _dateRange?.end,
          );
      if (mounted) {
        setState(() => _items = res.items);
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _exportCsv() async {
    try {
      final csv = await ref
          .read(appControllerProvider.notifier)
          .api
          .exportHistoryCsv(
            kind: _selectedKind,
            q: _searchCtrl.text.trim(),
            from: _dateRange?.start,
            to: _dateRange?.end,
          );
      if (csv.isEmpty) return;
      await Share.share(csv, subject: 'auto_park_history.csv');
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final user = ref.watch(appControllerProvider).user;
    final canViewAll = user?.canViewAllHistory ?? false;
    final canViewAudit = user?.canViewAudit ?? false;
    final fmt = DateFormat('yyyy-MM-dd HH:mm:ss');

    final kinds = <MapEntry<String?, String>>[
      MapEntry(null, l10n.filterAll),
      MapEntry('PARK', l10n.filterPark),
      MapEntry('RETRIEVE', l10n.filterRetrieve),
      if (canViewAll) MapEntry('EVENT', l10n.filterEvent),
      if (canViewAudit) MapEntry('AUDIT', l10n.filterAudit),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.historyScreenTitle),
        actions: [
          IconButton(
            tooltip: l10n.exportCsv,
            onPressed: _exportCsv,
            icon: const Icon(Icons.download_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchCtrl,
                        onSubmitted: (_) => _load(),
                        decoration: InputDecoration(
                          hintText: l10n.searchPlaceholder,
                          prefixIcon: const Icon(Icons.search_rounded),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.outlined(
                      tooltip: l10n.dateRange,
                      onPressed: () async {
                        final picked = await showDateRangePicker(
                          context: context,
                          firstDate: DateTime(2024),
                          lastDate: DateTime.now().add(const Duration(days: 1)),
                          initialDateRange: _dateRange,
                        );
                        if (picked != null) {
                          setState(() => _dateRange = picked);
                          _load();
                        }
                      },
                      icon: const Icon(Icons.date_range_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final entry in kinds) ...[
                        ChoiceChip(
                          label: Text(entry.value),
                          selected: _selectedKind == entry.key,
                          onSelected: (_) {
                            setState(() => _selectedKind = entry.key);
                            _load();
                          },
                        ),
                        const SizedBox(width: 8),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      padding: const EdgeInsets.all(14),
                      itemCount: _items.length,
                      itemBuilder: (context, index) {
                        final item = _items[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Card(
                            margin: EdgeInsets.zero,
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: AppColors.primaryCyan
                                    .withOpacity(0.16),
                                child: Text(
                                  item.kind.substring(0, 1),
                                  style: const TextStyle(
                                    color: AppColors.primaryCyan,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              title: Text(
                                item.title,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (item.description != null)
                                    Text(item.description!),
                                  Text(
                                    [
                                      if (item.plateNumber != null)
                                        item.plateNumber,
                                      if (item.actor != null) item.actor,
                                      fmt.format(item.createdAt.toLocal()),
                                    ].join(' • '),
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final appState = ref.watch(appControllerProvider);
    final items = appState.notifications;
    final fmt = DateFormat('yyyy-MM-dd HH:mm');

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.notificationsTitle),
        actions: [
          if (appState.unreadNotificationsCount > 0)
            TextButton.icon(
              onPressed: () async {
                await ref
                    .read(appControllerProvider.notifier)
                    .api
                    .markAllNotificationsRead();
                await ref
                    .read(appControllerProvider.notifier)
                    .refreshNotificationsSilent();
              },
              icon: const Icon(Icons.done_all_rounded, size: 18),
              label: Text(l10n.markAllRead),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref
            .read(appControllerProvider.notifier)
            .refreshNotificationsSilent(),
        child: items.isEmpty
            ? ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(child: Text(l10n.noNotifications)),
                ],
              )
            : ListView.builder(
                padding: const EdgeInsets.all(14),
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final n = items[index];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Card(
                      margin: EdgeInsets.zero,
                      child: ListTile(
                        leading: Icon(
                          n.read
                              ? Icons.notifications_none_rounded
                              : Icons.notifications_active_rounded,
                          color: n.read
                              ? AppColors.statusOffline
                              : AppColors.primaryCyan,
                        ),
                        title: Text(
                          n.title,
                          style: TextStyle(
                            fontWeight:
                                n.read ? FontWeight.w600 : FontWeight.w800,
                          ),
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 4),
                            Text(n.body),
                            const SizedBox(height: 4),
                            Text(
                              fmt.format(n.createdAt.toLocal()),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                        onTap: n.read
                            ? null
                            : () async {
                                await ref
                                    .read(appControllerProvider.notifier)
                                    .api
                                    .markNotificationRead(n.id);
                                await ref
                                    .read(appControllerProvider.notifier)
                                    .refreshNotificationsSilent();
                              },
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

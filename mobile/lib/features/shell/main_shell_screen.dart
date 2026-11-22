import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/connectivity/safety_connectivity_banner.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';
import '../alarms/alarms_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../map/parking_map_screen.dart';
import '../monitoring/monitoring_screen.dart';
import '../notifications/notifications_screen.dart';
import '../parking/parking_operations_screen.dart';
import '../profile/profile_and_more_screen.dart';

class MainShellScreen extends ConsumerStatefulWidget {
  const MainShellScreen({super.key});

  @override
  ConsumerState<MainShellScreen> createState() => _MainShellScreenState();
}

class _MainShellScreenState extends ConsumerState<MainShellScreen> {
  int _currentIndex = 0;
  int _operationsSubTab = 0;

  void _navigateToTab(int index, {int? subTab}) {
    setState(() {
      _currentIndex = index;
      if (subTab != null) _operationsSubTab = subTab;
    });
  }

  void _openMonitoring() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const MonitoringScreen()),
    );
  }

  void _openNotifications() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const NotificationsScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final appState = ref.watch(appControllerProvider);
    final canViewAlarms = appState.user?.canViewAlarms ?? false;

    final pages = <Widget>[
      DashboardScreen(
        onNavigateTab: _navigateToTab,
        onOpenMonitoring: _openMonitoring,
        onOpenNotifications: _openNotifications,
      ),
      const ParkingMapScreen(),
      ParkingOperationsScreen(initialSubTab: _operationsSubTab),
      if (canViewAlarms) const AlarmsScreen(),
      const ProfileAndMoreScreen(),
    ];

    final safeIndex = _currentIndex.clamp(0, pages.length - 1);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Image.asset(
                'assets/images/techno_logo.png',
                height: 28,
                fit: BoxFit.contain,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'TECHNO Electrical.Jo',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
                  ),
                  Text(
                    l10n.appTitle,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10.5,
                      color: AppColors.primaryCyan,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (appState.user?.canMonitorSystem ?? false)
            IconButton(
              tooltip: l10n.monitoringScreenTitle,
              onPressed: _openMonitoring,
              icon: const Icon(Icons.sensors_rounded),
            ),
          IconButton(
            tooltip: l10n.notificationsTitle,
            onPressed: _openNotifications,
            icon: Badge(
              isLabelVisible: appState.unreadNotificationsCount > 0,
              label: Text('${appState.unreadNotificationsCount}'),
              child: const Icon(Icons.notifications_outlined),
            ),
          ),
          TextButton(
            onPressed: () {
              final isAr = appState.locale.languageCode == 'ar';
              ref
                  .read(appControllerProvider.notifier)
                  .setLocale(isAr ? const Locale('en') : const Locale('ar'));
            },
            child: Text(
              appState.locale.languageCode == 'ar' ? 'EN' : 'عربي',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          SafetyConnectivityBanner(
            networkOnline: appState.networkOnline,
            backendReachable: appState.backendReachable,
            systemStatus:
                appState.systemStatus ?? appState.dashboard?.system,
          ),
          Expanded(child: pages[safeIndex]),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        onDestinationSelected: (idx) => setState(() => _currentIndex = idx),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.dashboard_outlined),
            selectedIcon: const Icon(Icons.dashboard_rounded),
            label: l10n.navDashboard,
          ),
          NavigationDestination(
            icon: const Icon(Icons.grid_view_outlined),
            selectedIcon: const Icon(Icons.grid_view_rounded),
            label: l10n.navMap,
          ),
          NavigationDestination(
            icon: const Icon(Icons.swap_vert_circle_outlined),
            selectedIcon: const Icon(Icons.swap_vert_circle_rounded),
            label: l10n.navOperations,
          ),
          if (canViewAlarms)
            NavigationDestination(
              icon: Badge(
                isLabelVisible: appState.activeAlarmsCount > 0,
                label: Text('${appState.activeAlarmsCount}'),
                child: const Icon(Icons.warning_amber_rounded),
              ),
              label: l10n.navAlarms,
            ),
          NavigationDestination(
            icon: const Icon(Icons.tune_rounded),
            label: l10n.navMore,
          ),
        ],
      ),
    );
  }
}

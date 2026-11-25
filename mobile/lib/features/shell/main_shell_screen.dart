import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/connectivity/safety_connectivity_banner.dart';
import '../../core/network/api_error.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';
import '../alarms/alarms_screen.dart';
import '../auth/server_url_dialog.dart';
import '../dashboard/dashboard_screen.dart';
import '../manual/manual_plc_control_screen.dart';
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
  bool _estopBusy = false;

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

  Future<void> _onEStopPressed() async {
    if (_estopBusy) return;
    final appState = ref.read(appControllerProvider);
    final isAr = appState.locale.languageCode == 'ar';
    final sys = appState.systemStatus ?? appState.dashboard?.system;
    final isEStopActive = sys?.emergencyStop ?? false;
    final canRelease = appState.user?.canAcknowledgeAlarms ?? false;

    if (isEStopActive) {
      final confirmRelease = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Row(
            children: [
              const Icon(Icons.emergency_rounded, color: AppColors.statusError),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  isAr ? 'إيقاف الطوارئ مفعّل (E-STOP)' : 'Emergency Stop ACTIVE',
                ),
              ),
            ],
          ),
          content: Text(
            canRelease
                ? (isAr
                    ? 'النظام متوقف حالياً في وضع الطوارئ.\nتأكد من خلو الموقف والمصاعد من أي عوائق قبل إلغاء إيقاف الطوارئ واستئناف العمل.'
                    : 'The system is currently halted in Emergency Stop.\nVerify all bays and lifts are clear before releasing E-Stop.')
                : (isAr
                    ? 'إيقاف الطوارئ مفعّل حالياً وجميع المصاعد متوقفة بأمان.\nيرجى التواصل مع مدير النظام أو مهندس الصيانة لإلغاء حالة الطوارئ بأمان.'
                    : 'Emergency Stop is currently active and all lifts are safely halted.\nPlease contact an Administrator or Maintenance Engineer to safely release E-Stop.'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(isAr ? 'إغلاق' : 'Close'),
            ),
            if (canRelease)
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.statusOnline,
                  foregroundColor: Colors.white,
                ),
                onPressed: () => Navigator.of(ctx).pop(true),
                icon: const Icon(Icons.play_arrow_rounded),
                label: Text(
                  isAr ? 'إلغاء إيقاف الطوارئ' : 'Release E-Stop',
                ),
              ),
          ],
        ),
      );
      if (confirmRelease != true || !mounted) return;
      await _dispatchEStopAction('ESTOP_OFF', isAr);
      return;
    }

    // Emergency Stop activation is IMMEDIATE (no blocking confirmation delay)
    // with tactile haptic feedback and unmistakable visual confirmation.
    HapticFeedback.heavyImpact();
    await _dispatchEStopAction('ESTOP_ON', isAr);
  }

  Future<void> _dispatchEStopAction(String action, bool isAr) async {
    setState(() => _estopBusy = true);
    try {
      await ref.read(appControllerProvider.notifier).executeEmergencyRecovery(action);
      await ref.read(appControllerProvider.notifier).refreshAllData();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor:
              action == 'ESTOP_ON' ? AppColors.statusError : AppColors.statusOnline,
          content: Text(
            action == 'ESTOP_ON'
                ? (isAr
                    ? '🛑 تم تفعيل إيقاف الطوارئ (E-STOP) بنجاح وإيقاف جميع العمليات فوراً!'
                    : '🛑 Emergency Stop (E-STOP) ACTIVATED — all operations halted!')
                : (isAr
                    ? '✅ تم إلغاء إيقاف الطوارئ واستئناف الوضع الآمن'
                    : '✅ Emergency Stop released safely'),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
      );
    } on ApiError catch (e) {
      if (!mounted) return;
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.statusError,
          content: Text(e.localizedMessage(l10n)),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.statusError,
          content: Text(
            isAr
                ? 'تعذر إرسال أمر إيقاف الطوارئ — تحقق من الاتصال بالسيرفر'
                : 'Failed to send E-Stop command — check server connection',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _estopBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final appState = ref.watch(appControllerProvider);
    final canViewAlarms = appState.user?.canViewAlarms ?? false;
    final canManualControl = appState.user?.canManualControl ?? false;
    final sys = appState.systemStatus ?? appState.dashboard?.system;
    final isEStopActive = sys?.emergencyStop ?? false;
    final isAr = appState.locale.languageCode == 'ar';
    final connPhase = appState.connectionPhase;

    final pages = <Widget>[
      DashboardScreen(
        onNavigateTab: _navigateToTab,
        onOpenMonitoring: _openMonitoring,
        onOpenNotifications: _openNotifications,
      ),
      const ParkingMapScreen(),
      if (canManualControl)
        const ManualPlcControlScreen()
      else
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
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
            child: ElevatedButton.icon(
              onPressed: _estopBusy ? null : _onEStopPressed,
              style: ElevatedButton.styleFrom(
                backgroundColor: isEStopActive
                    ? const Color(0xFF991B1B)
                    : AppColors.statusError,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                minimumSize: const Size(0, 34),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                  side: BorderSide(
                    color: isEStopActive ? Colors.amberAccent : Colors.white38,
                    width: isEStopActive ? 1.8 : 1,
                  ),
                ),
              ),
              icon: _estopBusy
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.emergency_rounded, size: 17),
              label: Text(
                isEStopActive
                    ? (isAr ? 'طوارئ!' : 'STOPPED')
                    : 'E-STOP',
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.4,
                ),
              ),
            ),
          ),
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
              ref
                  .read(appControllerProvider.notifier)
                  .setLocale(isAr ? const Locale('en') : const Locale('ar'));
            },
            child: Text(
              isAr ? 'EN' : 'عربي',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (isEStopActive)
            Material(
              color: const Color(0xFFB91C1C),
              child: InkWell(
                onTap: _estopBusy ? null : _onEStopPressed,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.emergency_rounded,
                        color: Colors.amberAccent,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          isAr
                              ? 'إيقاف الطوارئ مفعّل (E-STOP) — جميع المصاعد متوقفة'
                              : 'EMERGENCY STOP ACTIVE — All lifts halted',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 12.5,
                          ),
                        ),
                      ),
                      if (appState.user?.canAcknowledgeAlarms ?? false)
                        Text(
                          isAr ? 'استئناف' : 'Release',
                          style: const TextStyle(
                            color: Colors.amberAccent,
                            fontWeight: FontWeight.w900,
                            fontSize: 12,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          _buildConnectionStatusBar(appState, connPhase, isAr),
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
            icon: Icon(
              canManualControl
                  ? Icons.handyman_outlined
                  : Icons.swap_vert_circle_outlined,
            ),
            selectedIcon: Icon(
              canManualControl
                  ? Icons.handyman_rounded
                  : Icons.swap_vert_circle_rounded,
            ),
            label: canManualControl
                ? (isAr ? 'وضع التموضع' : 'Home Mode')
                : l10n.navOperations,
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

  Widget _buildConnectionStatusBar(
    AppState appState,
    ConnectionPhase phase,
    bool isAr,
  ) {
    final Color dotColor;
    final String label;
    final IconData icon;
    switch (phase) {
      case ConnectionPhase.connected:
        dotColor = AppColors.statusOnline;
        label = isAr ? 'متصل مباشر' : 'Connected';
        icon = Icons.cloud_done_rounded;
        break;
      case ConnectionPhase.reconnecting:
        dotColor = AppColors.statusWarning;
        label = isAr ? 'جاري إعادة الاتصال...' : 'Reconnecting...';
        icon = Icons.sync_rounded;
        break;
      case ConnectionPhase.offline:
        dotColor = AppColors.statusError;
        label = isAr ? 'غير متصل' : 'Offline';
        icon = Icons.cloud_off_rounded;
        break;
    }

    final shortHost = appState.serverHost
        .replaceFirst('https://', '')
        .replaceFirst('http://', '');

    return Material(
      color: AppColors.surfaceDark.withOpacity(0.75),
      child: InkWell(
        onTap: () => ServerUrlDialog.show(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: dotColor,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              Icon(icon, size: 14, color: dotColor),
              const SizedBox(width: 5),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                  color: dotColor,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  shortHost,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                  style: const TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: AppColors.statusOffline,
                  ),
                ),
              ),
              const SizedBox(width: 4),
              const Icon(
                Icons.settings_ethernet_rounded,
                size: 14,
                color: AppColors.statusOffline,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

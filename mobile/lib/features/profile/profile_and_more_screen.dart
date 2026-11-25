import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/network/api_error.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';
import '../history/history_screen.dart';
import '../monitoring/monitoring_screen.dart';
import '../notifications/notifications_screen.dart';
import '../settings/industrial_config_screen.dart';

class ProfileAndMoreScreen extends ConsumerStatefulWidget {
  const ProfileAndMoreScreen({super.key});

  @override
  ConsumerState<ProfileAndMoreScreen> createState() =>
      _ProfileAndMoreScreenState();
}

class _ProfileAndMoreScreenState extends ConsumerState<ProfileAndMoreScreen> {
  bool _notifyParking = true;
  bool _notifyAlarms = true;
  bool _notifyMaintenance = true;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    try {
      final data = await ref
          .read(appControllerProvider.notifier)
          .api
          .getPreferences();
      if (!mounted) return;
      setState(() {
        _notifyParking = data['notifyParking'] as bool? ?? true;
        _notifyAlarms = data['notifyAlarms'] as bool? ?? true;
        _notifyMaintenance = data['notifyMaintenance'] as bool? ?? true;
      });
    } catch (_) {}
  }

  Future<void> _updatePref(String key, bool value) async {
    setState(() {
      if (key == 'notifyParking') _notifyParking = value;
      if (key == 'notifyAlarms') _notifyAlarms = value;
      if (key == 'notifyMaintenance') _notifyMaintenance = value;
    });
    try {
      await ref
          .read(appControllerProvider.notifier)
          .api
          .updatePreferences({key: value});
    } catch (_) {}
  }

  Future<void> _editProfile() async {
    final user = ref.read(appControllerProvider).user;
    if (user == null) return;
    final l10n = AppLocalizations.of(context);
    final nameCtrl = TextEditingController(text: user.fullName);
    final emailCtrl = TextEditingController(text: user.email);
    final phoneCtrl = TextEditingController(text: user.phone ?? '');

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.updateProfile),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                decoration: InputDecoration(labelText: l10n.fullName),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: emailCtrl,
                decoration: InputDecoration(labelText: l10n.email),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: phoneCtrl,
                decoration: InputDecoration(labelText: l10n.phone),
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
    if (saved != true || !mounted) return;
    try {
      final updated = await ref
          .read(appControllerProvider.notifier)
          .api
          .updateMe(
            fullName: nameCtrl.text.trim(),
            email: emailCtrl.text.trim(),
            phone: phoneCtrl.text.trim(),
          );
      ref.read(appControllerProvider.notifier).updateUser(updated);
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

  Future<void> _changePassword() async {
    final l10n = AppLocalizations.of(context);
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.changePassword),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: currentCtrl,
              obscureText: true,
              decoration: InputDecoration(labelText: l10n.currentPassword),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: newCtrl,
              obscureText: true,
              decoration: InputDecoration(
                labelText: l10n.newPassword,
                helperText: l10n.passwordPolicyHint,
                helperMaxLines: 2,
              ),
            ),
          ],
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
    if (saved != true || !mounted) return;
    try {
      await ref.read(appControllerProvider.notifier).api.changePassword(
            currentPassword: currentCtrl.text,
            newPassword: newCtrl.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.save)),
      );
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

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (user != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 26,
                        backgroundColor:
                            AppColors.primaryCyan.withOpacity(0.2),
                        child: const Icon(
                          Icons.person_rounded,
                          color: AppColors.primaryCyan,
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user.fullName,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            Text(
                              '${user.username} • ${user.email}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.primaryCyan
                                    .withOpacity(0.16),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                user.role,
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.primaryCyan,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _editProfile,
                          icon: const Icon(Icons.edit_outlined, size: 18),
                          label: Text(l10n.updateProfile),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _changePassword,
                          icon: const Icon(Icons.password_rounded, size: 18),
                          label: Text(l10n.changePassword),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 12),
        Card(
          child: Column(
            children: [
              if ((user?.hasPermission(Permission.historyViewOwn) ?? false) ||
                  (user?.canViewAllHistory ?? false)) ...[
                ListTile(
                  leading: const Icon(
                    Icons.history_rounded,
                    color: AppColors.primaryCyan,
                  ),
                  title: Text(l10n.historyScreenTitle),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const HistoryScreen(),
                    ),
                  ),
                ),
                const Divider(height: 1),
              ],
              if (user?.canMonitorSystem ?? false) ...[
                ListTile(
                  leading: const Icon(
                    Icons.sensors_rounded,
                    color: AppColors.primaryCyan,
                  ),
                  title: Text(l10n.monitoringScreenTitle),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const MonitoringScreen(),
                    ),
                  ),
                ),
                const Divider(height: 1),
              ],
              ListTile(
                leading: const Icon(
                  Icons.notifications_active_outlined,
                  color: AppColors.primaryCyan,
                ),
                title: Text(l10n.notificationsTitle),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const NotificationsScreen(),
                  ),
                ),
              ),
              if (user?.canManageConfig ?? false) ...[
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(
                    Icons.settings_input_component_rounded,
                    color: AppColors.primaryCyan,
                  ),
                  title: Text(l10n.industrialConfigTitle),
                  subtitle: Text(l10n.industrialConfigSubtitle),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const IndustrialConfigScreen(),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.language_rounded),
                  title: Text(l10n.language),
                  trailing: SegmentedButton<String>(
                    segments: [
                      ButtonSegment(value: 'ar', label: Text(l10n.arabic)),
                      ButtonSegment(value: 'en', label: Text(l10n.english)),
                    ],
                    selected: {appState.locale.languageCode},
                    onSelectionChanged: (s) {
                      ref
                          .read(appControllerProvider.notifier)
                          .setLocale(Locale(s.first));
                    },
                  ),
                ),
                const Divider(),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.dark_mode_outlined),
                  title: Text(l10n.theme),
                  trailing: DropdownButton<ThemeMode>(
                    value: appState.themeMode,
                    underline: const SizedBox.shrink(),
                    items: [
                      DropdownMenuItem(
                        value: ThemeMode.dark,
                        child: Text(l10n.darkMode),
                      ),
                      DropdownMenuItem(
                        value: ThemeMode.light,
                        child: Text(l10n.lightMode),
                      ),
                      DropdownMenuItem(
                        value: ThemeMode.system,
                        child: Text(l10n.systemTheme),
                      ),
                    ],
                    onChanged: (mode) {
                      if (mode != null) {
                        ref
                            .read(appControllerProvider.notifier)
                            .setThemeMode(mode);
                      }
                    },
                  ),
                ),
                const Divider(),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l10n.enableBiometric),
                  value: appState.biometricEnabled,
                  onChanged: (v) => ref
                      .read(appControllerProvider.notifier)
                      .setBiometricEnabled(v),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.notificationsSection,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l10n.notifyParking),
                  value: _notifyParking,
                  onChanged: (v) => _updatePref('notifyParking', v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l10n.notifyAlarms),
                  value: _notifyAlarms,
                  onChanged: (v) => _updatePref('notifyAlarms', v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l10n.notifyMaintenance),
                  value: _notifyMaintenance,
                  onChanged: (v) => _updatePref('notifyMaintenance', v),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.statusError,
            foregroundColor: Colors.white,
          ),
          onPressed: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: Text(l10n.logout),
                content: Text(l10n.logoutConfirm),
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
                    child: Text(l10n.logout),
                  ),
                ],
              ),
            );
            if (ok == true) {
              await ref.read(appControllerProvider.notifier).logout();
            }
          },
          icon: const Icon(Icons.logout_rounded),
          label: Text(l10n.logout),
        ),
      ],
    );
  }
}

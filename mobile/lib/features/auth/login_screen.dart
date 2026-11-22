import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_error.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';
import 'server_url_dialog.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _rememberMe = true;
  bool _submitting = false;
  String? _errorBanner;

  @override
  void initState() {
    super.initState();
    final st = ref.read(appControllerProvider);
    _rememberMe = st.rememberMe;
  }

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _errorBanner = null;
    });
    final l10n = AppLocalizations.of(context);
    try {
      await ref.read(appControllerProvider.notifier).login(
            username: _usernameCtrl.text.trim(),
            password: _passwordCtrl.text,
            rememberMe: _rememberMe,
          );
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() => _errorBanner = e.localizedMessage(l10n));
    } catch (_) {
      if (!mounted) return;
      setState(() => _errorBanner = l10n.errGeneric);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _unlockBiometric() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _submitting = true;
      _errorBanner = null;
    });
    try {
      final ok = await ref
          .read(appControllerProvider.notifier)
          .loginWithBiometrics(localizedReason: l10n.biometricReason);
      if (!ok && mounted) {
        setState(() => _errorBanner = l10n.errGeneric);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _fillDemo(String user, String pass) {
    setState(() {
      _usernameCtrl.text = user;
      _passwordCtrl.text = pass;
      _errorBanner = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final appState = ref.watch(appControllerProvider);
    final isArabic = appState.locale.languageCode == 'ar';

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Icon(
              Icons.precision_manufacturing_rounded,
              color: AppColors.primaryCyan,
            ),
            const SizedBox(width: 8),
            Text(
              l10n.appTitle,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ],
        ),
        actions: [
          TextButton.icon(
            onPressed: () {
              final next = isArabic ? const Locale('en') : const Locale('ar');
              ref.read(appControllerProvider.notifier).setLocale(next);
            },
            icon: const Icon(Icons.language_rounded, size: 18),
            label: Text(isArabic ? l10n.english : l10n.arabic),
          ),
          IconButton(
            tooltip: l10n.serverSettings,
            onPressed: () => ServerUrlDialog.show(context),
            icon: const Icon(Icons.dns_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(22),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppColors.primaryCyan
                                    .withOpacity(0.15),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.lock_person_rounded,
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
                                    l10n.loginTitle,
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineSmall
                                        ?.copyWith(fontWeight: FontWeight.w800),
                                  ),
                                  Text(
                                    l10n.loginSubtitle,
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        if (_errorBanner != null) ...[
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color:
                                  AppColors.statusError.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: AppColors.statusError
                                    .withOpacity(0.6),
                              ),
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.error_outline_rounded,
                                  color: AppColors.statusError,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    _errorBanner!,
                                    style: const TextStyle(
                                      color: AppColors.statusError,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                        TextFormField(
                          key: const Key('login_username_field'),
                          controller: _usernameCtrl,
                          textInputAction: TextInputAction.next,
                          decoration: InputDecoration(
                            labelText: l10n.usernameOrEmail,
                            prefixIcon:
                                const Icon(Icons.person_outline_rounded),
                          ),
                          validator: (v) => (v == null || v.trim().isEmpty)
                              ? l10n.usernameRequired
                              : null,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          key: const Key('login_password_field'),
                          controller: _passwordCtrl,
                          obscureText: _obscurePassword,
                          onFieldSubmitted: (_) => _submit(),
                          decoration: InputDecoration(
                            labelText: l10n.password,
                            prefixIcon: const Icon(Icons.key_rounded),
                            suffixIcon: IconButton(
                              onPressed: () => setState(
                                () => _obscurePassword = !_obscurePassword,
                              ),
                              icon: Icon(
                                _obscurePassword
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                              ),
                            ),
                          ),
                          validator: (v) => (v == null || v.isEmpty)
                              ? l10n.passwordRequired
                              : null,
                        ),
                        if (appState.deviceMac.isNotEmpty ||
                            appState.deviceId.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.primaryCyan.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: AppColors.primaryCyan.withOpacity(0.4),
                              ),
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.phonelink_lock_rounded,
                                  size: 20,
                                  color: AppColors.primaryCyan,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        isArabic
                                            ? 'عنوان MAC الجهاز (قراءة تلقائية)'
                                            : 'Device MAC Address (Auto-Detected)',
                                        style: TextStyle(
                                          fontSize: 10.5,
                                          color: Theme.of(context)
                                              .textTheme
                                              .bodySmall
                                              ?.color,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        appState.deviceMac.isNotEmpty
                                            ? appState.deviceMac
                                            : appState.deviceId,
                                        textDirection: TextDirection.ltr,
                                        style: const TextStyle(
                                          fontSize: 13.5,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 0.8,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  visualDensity: VisualDensity.compact,
                                  tooltip: isArabic
                                      ? 'نسخ عنوان MAC'
                                      : 'Copy MAC Address',
                                  icon:
                                      const Icon(Icons.copy_rounded, size: 18),
                                  onPressed: () {
                                    final valueToCopy =
                                        appState.deviceMac.isNotEmpty
                                            ? appState.deviceMac
                                            : appState.deviceId;
                                    Clipboard.setData(
                                      ClipboardData(text: valueToCopy),
                                    );
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          isArabic
                                              ? 'تم نسخ عنوان MAC ($valueToCopy) لإرساله لمدير النظام'
                                              : 'Device MAC ($valueToCopy) copied for admin registration',
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Checkbox(
                              value: _rememberMe,
                              onChanged: (v) =>
                                  setState(() => _rememberMe = v ?? true),
                            ),
                            Expanded(
                              child: GestureDetector(
                                onTap: () =>
                                    setState(() => _rememberMe = !_rememberMe),
                                child: Text(
                                  l10n.rememberMe,
                                  style: const TextStyle(fontSize: 13),
                                ),
                              ),
                            ),
                            TextButton(
                              onPressed: () {
                                showDialog<void>(
                                  context: context,
                                  builder: (ctx) => AlertDialog(
                                    title: Text(l10n.forgotPasswordTitle),
                                    content: Text(l10n.forgotPasswordBody),
                                    actions: [
                                      TextButton(
                                        onPressed: () =>
                                            Navigator.of(ctx).pop(),
                                        child: Text(l10n.close),
                                      ),
                                    ],
                                  ),
                                );
                              },
                              child: Text(
                                l10n.forgotPassword,
                                style: const TextStyle(fontSize: 12.5),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          key: const Key('login_submit_button'),
                          onPressed: _submitting ? null : _submit,
                          icon: _submitting
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.2,
                                  ),
                                )
                              : const Icon(Icons.login_rounded),
                          label: Text(l10n.signIn),
                        ),
                        if (appState.hasPersistedSession &&
                            appState.biometricEnabled) ...[
                          const SizedBox(height: 10),
                          OutlinedButton.icon(
                            onPressed: _submitting ? null : _unlockBiometric,
                            icon: const Icon(Icons.fingerprint_rounded),
                            label: Text(l10n.biometricSignIn),
                          ),
                        ],
                        const SizedBox(height: 18),
                        const Divider(),
                        const SizedBox(height: 8),
                        Text(
                          l10n.demoAccounts,
                          style:
                              Theme.of(context).textTheme.labelMedium?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            ActionChip(
                              label: const Text('superadmin'),
                              onPressed: () =>
                                  _fillDemo('superadmin', 'Admin@12345'),
                            ),
                            ActionChip(
                              label: const Text('operator'),
                              onPressed: () =>
                                  _fillDemo('operator', 'Operator@123'),
                            ),
                            ActionChip(
                              label: const Text('engineer'),
                              onPressed: () =>
                                  _fillDemo('engineer', 'Engineer@123'),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          isArabic
                              ? '🔒 الدخول عبر التطبيق مخصص للموظفين المعرّفين بأجهزتهم المسجّلة فقط.'
                              : '🔒 App sign-in is restricted to registered company employees with authorized devices only.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 10),
                        InkWell(
                          onTap: () => ServerUrlDialog.show(context),
                          borderRadius: BorderRadius.circular(8),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.lan_outlined,
                                  size: 16,
                                  color: AppColors.primaryCyan,
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    '${l10n.serverUrl}: ${appState.serverHost}',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.primaryCyan,
                                    ),
                                  ),
                                ),
                                const Icon(Icons.edit_outlined, size: 15),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

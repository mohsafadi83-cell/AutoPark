import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';

class ServerUrlDialog extends ConsumerStatefulWidget {
  const ServerUrlDialog({super.key});

  static Future<void> show(BuildContext context) {
    return showDialog<void>(
      context: context,
      builder: (_) => const ServerUrlDialog(),
    );
  }

  @override
  ConsumerState<ServerUrlDialog> createState() => _ServerUrlDialogState();
}

class _ServerUrlDialogState extends ConsumerState<ServerUrlDialog> {
  late final TextEditingController _ctrl;
  bool _testing = false;
  String? _statusMsg;
  bool? _statusOk;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(
      text: ref.read(appControllerProvider).serverHost,
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _testConnection(AppLocalizations l10n) async {
    final host = _ctrl.text.trim();
    if (!AppConfig.isValidHost(host)) {
      setState(() {
        _statusOk = false;
        _statusMsg = l10n.invalidServerUrl;
      });
      return;
    }
    setState(() {
      _testing = true;
      _statusMsg = null;
    });
    try {
      final res =
          await ref.read(appControllerProvider.notifier).api.checkHealth(host);
      if (!mounted) return;
      setState(() {
        _statusOk = true;
        _statusMsg = l10n.connectionSuccess(
          res['mode']?.toString() ?? 'OK',
          res['adapter']?.toString() ?? 'OK',
        );
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _statusOk = false;
        _statusMsg = l10n.connectionFailed;
      });
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.dns_rounded, color: AppColors.primaryCyan),
          const SizedBox(width: 10),
          Expanded(child: Text(l10n.serverSettings)),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _ctrl,
              keyboardType: TextInputType.url,
              decoration: InputDecoration(
                labelText: l10n.serverUrl,
                hintText: l10n.serverUrlHint,
                helperText: l10n.serverUrlHelper,
                helperMaxLines: 2,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: _testing ? null : () => _testConnection(l10n),
                  icon: _testing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.network_check_rounded, size: 18),
                  label: Text(l10n.testConnection),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: () {
                    _ctrl.text = AppConfig.defaultHost;
                  },
                  child: Text(l10n.resetDefault),
                ),
              ],
            ),
            if (_statusMsg != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: (_statusOk == true
                          ? AppColors.statusOnline
                          : AppColors.statusError)
                      .withOpacity(0.14),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      _statusOk == true
                          ? Icons.check_circle_rounded
                          : Icons.error_rounded,
                      color: _statusOk == true
                          ? AppColors.statusOnline
                          : AppColors.statusError,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _statusMsg!,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: _statusOk == true
                              ? AppColors.statusOnline
                              : AppColors.statusError,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.cancel),
        ),
        ElevatedButton(
          onPressed: () async {
            final host = _ctrl.text.trim();
            if (!AppConfig.isValidHost(host)) {
              setState(() {
                _statusOk = false;
                _statusMsg = l10n.invalidServerUrl;
              });
              return;
            }
            await ref
                .read(appControllerProvider.notifier)
                .setServerHost(host);
            if (context.mounted) Navigator.of(context).pop();
          },
          child: Text(l10n.save),
        ),
      ],
    );
  }
}

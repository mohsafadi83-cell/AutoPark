import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/network/api_error.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';
import '../auth/server_url_dialog.dart';

class IndustrialConfigScreen extends ConsumerStatefulWidget {
  const IndustrialConfigScreen({super.key});

  @override
  ConsumerState<IndustrialConfigScreen> createState() =>
      _IndustrialConfigScreenState();
}

class _IndustrialConfigScreenState
    extends ConsumerState<IndustrialConfigScreen> {
  bool _loading = true;
  bool _saving = false;
  bool _testing = false;
  String? _feedbackMsg;
  bool? _feedbackOk;

  String _protocol = 'MOCK';
  final _plcModelCtrl = TextEditingController();
  final _hostCtrl = TextEditingController();
  final _portCtrl = TextEditingController();
  final _rackCtrl = TextEditingController();
  final _slotCtrl = TextEditingController();
  final _opcuaEndpointCtrl = TextEditingController();
  final _modbusUnitIdCtrl = TextEditingController();
  final _mqttUrlCtrl = TextEditingController();
  final _mqttPrefixCtrl = TextEditingController();
  final _restBaseUrlCtrl = TextEditingController();
  final _pollCtrl = TextEditingController(text: '1000');
  final _ackTimeoutCtrl = TextEditingController(text: '5000');
  final _completionTimeoutCtrl = TextEditingController(text: '60000');
  final _heartbeatTimeoutCtrl = TextEditingController(text: '10000');
  bool _readOnly = false;
  bool _idempotent = true;
  final Map<String, TextEditingController> _tagAddrCtrls = {};
  Map<String, IndustrialTagEntry> _tagMap = {};

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  @override
  void dispose() {
    _plcModelCtrl.dispose();
    _hostCtrl.dispose();
    _portCtrl.dispose();
    _rackCtrl.dispose();
    _slotCtrl.dispose();
    _opcuaEndpointCtrl.dispose();
    _modbusUnitIdCtrl.dispose();
    _mqttUrlCtrl.dispose();
    _mqttPrefixCtrl.dispose();
    _restBaseUrlCtrl.dispose();
    _pollCtrl.dispose();
    _ackTimeoutCtrl.dispose();
    _completionTimeoutCtrl.dispose();
    _heartbeatTimeoutCtrl.dispose();
    for (final c in _tagAddrCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadConfig() async {
    setState(() => _loading = true);
    try {
      final cfg = await ref
          .read(appControllerProvider.notifier)
          .api
          .getIndustrialConfig();
      if (!mounted) return;
      _protocol = cfg.protocol;
      _plcModelCtrl.text = cfg.plcModel ?? '';
      _hostCtrl.text = cfg.host ?? '';
      _portCtrl.text = cfg.port?.toString() ?? '';
      _rackCtrl.text = cfg.rack?.toString() ?? '';
      _slotCtrl.text = cfg.slot?.toString() ?? '';
      _opcuaEndpointCtrl.text = cfg.opcuaEndpoint ?? '';
      _modbusUnitIdCtrl.text = cfg.modbusUnitId?.toString() ?? '';
      _mqttUrlCtrl.text = cfg.mqttUrl ?? '';
      _mqttPrefixCtrl.text = cfg.mqttTopicPrefix ?? '';
      _restBaseUrlCtrl.text = cfg.restBaseUrl ?? '';
      _pollCtrl.text = cfg.pollIntervalMs.toString();
      _ackTimeoutCtrl.text = cfg.ackTimeoutMs.toString();
      _completionTimeoutCtrl.text = cfg.completionTimeoutMs.toString();
      _heartbeatTimeoutCtrl.text = cfg.heartbeatTimeoutMs.toString();
      _readOnly = cfg.readOnly;
      _idempotent = cfg.supportsIdempotentCommands;
      _tagMap = Map.of(cfg.tagMap);
      for (final entry in _tagMap.entries) {
        _tagAddrCtrls[entry.key] =
            TextEditingController(text: entry.value.address);
      }
      setState(() {});
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, dynamic> _buildPayload() {
    final updatedTags = <String, dynamic>{};
    for (final entry in _tagMap.entries) {
      final addr = _tagAddrCtrls[entry.key]?.text.trim() ?? entry.value.address;
      updatedTags[entry.key] = entry.value.copyWith(address: addr).toJson();
    }
    return {
      'protocol': _protocol,
      'plcModel': _plcModelCtrl.text.trim().isEmpty
          ? null
          : _plcModelCtrl.text.trim(),
      'host': _hostCtrl.text.trim().isEmpty ? null : _hostCtrl.text.trim(),
      'port': int.tryParse(_portCtrl.text.trim()),
      'rack': int.tryParse(_rackCtrl.text.trim()),
      'slot': int.tryParse(_slotCtrl.text.trim()),
      'opcuaEndpoint': _opcuaEndpointCtrl.text.trim().isEmpty
          ? null
          : _opcuaEndpointCtrl.text.trim(),
      'modbusUnitId': int.tryParse(_modbusUnitIdCtrl.text.trim()),
      'mqttUrl':
          _mqttUrlCtrl.text.trim().isEmpty ? null : _mqttUrlCtrl.text.trim(),
      'mqttTopicPrefix': _mqttPrefixCtrl.text.trim().isEmpty
          ? null
          : _mqttPrefixCtrl.text.trim(),
      'restBaseUrl': _restBaseUrlCtrl.text.trim().isEmpty
          ? null
          : _restBaseUrlCtrl.text.trim(),
      'pollIntervalMs': int.tryParse(_pollCtrl.text.trim()) ?? 1000,
      'ackTimeoutMs': int.tryParse(_ackTimeoutCtrl.text.trim()) ?? 5000,
      'completionTimeoutMs':
          int.tryParse(_completionTimeoutCtrl.text.trim()) ?? 60000,
      'heartbeatTimeoutMs':
          int.tryParse(_heartbeatTimeoutCtrl.text.trim()) ?? 10000,
      'readOnly': _readOnly,
      'supportsIdempotentCommands': _idempotent,
      if (updatedTags.isNotEmpty) 'tagMap': updatedTags,
    };
  }

  Future<void> _testLink() async {
    setState(() {
      _testing = true;
      _feedbackMsg = null;
    });
    try {
      final res = await ref
          .read(appControllerProvider.notifier)
          .api
          .testIndustrialConfig(_buildPayload());
      if (!mounted) return;
      final ok = res['ok'] == true;
      final latency = res['latencyMs'];
      setState(() {
        _feedbackOk = ok;
        _feedbackMsg =
            '${res['message'] ?? 'OK'}${latency != null ? ' ($latency ms)' : ''}';
      });
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackOk = false;
        _feedbackMsg = e.message;
      });
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  Future<void> _saveConfig() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _saving = true;
      _feedbackMsg = null;
    });
    try {
      await ref
          .read(appControllerProvider.notifier)
          .api
          .updateIndustrialConfig(_buildPayload());
      await ref.read(appControllerProvider.notifier).refreshAllData();
      if (!mounted) return;
      setState(() {
        _feedbackOk = true;
        _feedbackMsg = l10n.saveIndustrialConfig;
      });
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackOk = false;
        _feedbackMsg = e.localizedMessage(l10n);
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final appState = ref.watch(appControllerProvider);
    final canManageConfig = appState.user?.canManageConfig ?? false;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.industrialConfigTitle),
      ),
      body: _loading && canManageConfig
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: ListTile(
                    leading: const Icon(
                      Icons.dns_rounded,
                      color: AppColors.primaryCyan,
                    ),
                    title: Text(
                      l10n.serverUrl,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: Text(appState.serverHost),
                    trailing: OutlinedButton(
                      onPressed: () => ServerUrlDialog.show(context),
                      child: Text(l10n.serverSettings),
                    ),
                  ),
                ),
                if (canManageConfig) ...[
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            l10n.industrialConfigSubtitle,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          const SizedBox(height: 14),
                          DropdownButtonFormField<String>(
                            value: IndustrialConfig.protocols.contains(_protocol)
                                ? _protocol
                                : 'MOCK',
                            decoration: InputDecoration(
                              labelText: l10n.protocolLabel,
                              prefixIcon: const Icon(
                                Icons.settings_ethernet_rounded,
                              ),
                            ),
                            items: [
                              for (final p in IndustrialConfig.protocols)
                                DropdownMenuItem(value: p, child: Text(p)),
                            ],
                            onChanged: (v) {
                              if (v != null) setState(() => _protocol = v);
                            },
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _plcModelCtrl,
                            decoration: InputDecoration(
                              labelText: l10n.plcModelLabel,
                              hintText: 'S7-1500 / S7-1200 / ControlLogix',
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                flex: 2,
                                child: TextField(
                                  controller: _hostCtrl,
                                  decoration: InputDecoration(
                                    labelText: l10n.plcHostLabel,
                                    hintText: '192.168.10.50',
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: TextField(
                                  controller: _portCtrl,
                                  keyboardType: TextInputType.number,
                                  decoration: InputDecoration(
                                    labelText: l10n.plcPortLabel,
                                    hintText: '102 / 502',
                                  ),
                                ),
                              ),
                            ],
                          ),
                          if (_protocol == 'SIEMENS_S7') ...[
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: _rackCtrl,
                                    keyboardType: TextInputType.number,
                                    decoration: InputDecoration(
                                      labelText: l10n.rackLabel,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: TextField(
                                    controller: _slotCtrl,
                                    keyboardType: TextInputType.number,
                                    decoration: InputDecoration(
                                      labelText: l10n.slotLabel,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                          if (_protocol == 'OPC_UA') ...[
                            const SizedBox(height: 12),
                            TextField(
                              controller: _opcuaEndpointCtrl,
                              decoration: InputDecoration(
                                labelText: l10n.opcuaEndpointLabel,
                                hintText: 'opc.tcp://192.168.10.50:4840',
                              ),
                            ),
                          ],
                          if (_protocol == 'MODBUS_TCP') ...[
                            const SizedBox(height: 12),
                            TextField(
                              controller: _modbusUnitIdCtrl,
                              keyboardType: TextInputType.number,
                              decoration: InputDecoration(
                                labelText: l10n.modbusUnitIdLabel,
                              ),
                            ),
                          ],
                          if (_protocol == 'MQTT') ...[
                            const SizedBox(height: 12),
                            TextField(
                              controller: _mqttUrlCtrl,
                              decoration: InputDecoration(
                                labelText: l10n.mqttUrlLabel,
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _mqttPrefixCtrl,
                              decoration: InputDecoration(
                                labelText: l10n.mqttTopicPrefixLabel,
                              ),
                            ),
                          ],
                          if (_protocol == 'REST_GATEWAY') ...[
                            const SizedBox(height: 12),
                            TextField(
                              controller: _restBaseUrlCtrl,
                              decoration: InputDecoration(
                                labelText: l10n.restBaseUrlLabel,
                              ),
                            ),
                          ],
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _pollCtrl,
                                  keyboardType: TextInputType.number,
                                  decoration: InputDecoration(
                                    labelText: l10n.pollIntervalLabel,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: TextField(
                                  controller: _ackTimeoutCtrl,
                                  keyboardType: TextInputType.number,
                                  decoration: InputDecoration(
                                    labelText: l10n.ackTimeoutLabel,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _completionTimeoutCtrl,
                                  keyboardType: TextInputType.number,
                                  decoration: InputDecoration(
                                    labelText: l10n.completionTimeoutLabel,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: TextField(
                                  controller: _heartbeatTimeoutCtrl,
                                  keyboardType: TextInputType.number,
                                  decoration: InputDecoration(
                                    labelText: l10n.heartbeatTimeoutLabel,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(l10n.readOnlyModeToggle),
                            value: _readOnly,
                            onChanged: (v) => setState(() => _readOnly = v),
                          ),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(l10n.idempotentCommandsToggle),
                            value: _idempotent,
                            onChanged: (v) => setState(() => _idempotent = v),
                          ),
                          if (_tagMap.isNotEmpty) ...[
                            const Divider(height: 24),
                            Text(
                              l10n.tagMappingSection,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 10),
                            for (final entry in _tagMap.entries) ...[
                              Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: TextField(
                                  controller: _tagAddrCtrls[entry.key],
                                  decoration: InputDecoration(
                                    labelText:
                                        '${entry.key} (${entry.value.dataType} • ${entry.value.access})',
                                  ),
                                ),
                              ),
                            ],
                          ],
                          if (_feedbackMsg != null) ...[
                            const SizedBox(height: 12),
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: (_feedbackOk == true
                                        ? AppColors.statusOnline
                                        : AppColors.statusError)
                                    .withOpacity(0.15),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                _feedbackMsg!,
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: _feedbackOk == true
                                      ? AppColors.statusOnline
                                      : AppColors.statusError,
                                ),
                              ),
                            ),
                          ],
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: _testing ? null : _testLink,
                                  icon: const Icon(Icons.network_check_rounded),
                                  label: Text(l10n.testIndustrialConnection),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: ElevatedButton.icon(
                                  onPressed: _saving ? null : _saveConfig,
                                  icon: const Icon(Icons.save_rounded),
                                  label: Text(l10n.saveIndustrialConfig),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

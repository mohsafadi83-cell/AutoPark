import {
  CheckCircle as CheckIcon,
  NetworkCheck as TestIcon,
  Save as SaveIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid2 as Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { industrialApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { useToast } from '../context/ToastContext';
import {
  PROTOCOLS,
  TAG_ACCESS,
  TAG_DATA_TYPES,
  TAG_KEYS,
  type ConfigTestResult,
  type IndustrialConfig,
  type OpcuaSecurityMode,
  type Protocol,
  type TagAccess,
  type TagDataType,
  type TagKey,
} from '../types/api';

export const MASKED_SECRET = '********';

/**
 * Strips masked secret placeholders ("********") so the backend keeps existing stored secrets
 * unless the admin explicitly enters a new secret value.
 */
export function sanitizeConfigPayload(cfg: IndustrialConfig): Partial<IndustrialConfig> {
  const payload: Partial<IndustrialConfig> = { ...cfg };
  if (payload.opcuaPassword === MASKED_SECRET) {
    delete payload.opcuaPassword;
  }
  if (payload.mqttPassword === MASKED_SECRET) {
    delete payload.mqttPassword;
  }
  if (payload.restApiKey === MASKED_SECRET) {
    delete payload.restApiKey;
  }
  delete payload.updatedAt;
  delete payload.updatedBy;
  return payload;
}

const CHECKLIST_KEYS = [
  'plcModel',
  'plcIp',
  'topology',
  'protocol',
  'rackSlot',
  'opcua',
  'tagList',
  'dbNumbers',
  'rwPermissions',
  'handshake',
  'parkingTags',
  'alarmTags',
  'emergency',
  'interlocks',
  'ack',
  'completion',
  'docs',
  'diagrams',
] as const;

export const IndustrialConfigPage: React.FC = () => {
  const { t } = useTranslation();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['industrialConfig'],
    queryFn: () => industrialApi.config(),
  });

  const [form, setForm] = useState<IndustrialConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [testResult, setTestResult] = useState<ConfigTestResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (configQuery.data && !dirty) {
      setForm(structuredClone(configQuery.data));
    }
  }, [configQuery.data, dirty]);

  const testMutation = useMutation({
    mutationFn: (cfg: IndustrialConfig) => industrialApi.testConfig(sanitizeConfigPayload(cfg)),
    onSuccess: (res) => {
      setTestResult(res);
      notify(res.ok ? t('config.testOk') : t('config.testFailed'), res.ok ? 'success' : 'error');
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const saveMutation = useMutation({
    mutationFn: (cfg: IndustrialConfig) => industrialApi.saveConfig(sanitizeConfigPayload(cfg)),
    onSuccess: (saved) => {
      setForm(structuredClone(saved));
      setDirty(false);
      setConfirmOpen(false);
      setConfirmText('');
      notify(t('common.saved'), 'success');
      void queryClient.invalidateQueries({ queryKey: ['industrialConfig'] });
      void queryClient.invalidateQueries({ queryKey: ['industrialStatus'] });
      void queryClient.invalidateQueries({ queryKey: ['systemStatus'] });
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  if (configQuery.isLoading || !form) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const updateField = <K extends keyof IndustrialConfig>(key: K, value: IndustrialConfig[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  const updateTag = (key: TagKey, field: 'address' | 'dataType' | 'access' | 'description', value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const existing = prev.tagMap[key] ?? { address: '', dataType: 'BOOL', access: 'R' };
      return {
        ...prev,
        tagMap: {
          ...prev.tagMap,
          [key]: {
            ...existing,
            [field]: value,
          },
        },
      };
    });
    setDirty(true);
  };

  const confirmWord = t('config.confirmWord');

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography variant="h5">{t('config.title')}</Typography>
          {dirty && <Chip size="small" color="warning" label={t('config.unsaved')} />}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<TestIcon />}
            disabled={testMutation.isPending}
            onClick={() => testMutation.mutate(form)}
          >
            {testMutation.isPending ? t('config.testing') : t('config.test')}
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            onClick={() => {
              setConfirmText('');
              setConfirmOpen(true);
            }}
          >
            {t('common.save')}
          </Button>
        </Stack>
      </Stack>

      <Alert severity="warning" icon={<WarningIcon />}>
        {t('config.warning')}
      </Alert>

      {form.updatedAt && (
        <Typography variant="caption" color="text.secondary">
          {t('config.lastUpdated', {
            at: new Date(form.updatedAt).toLocaleString(),
            by: form.updatedBy ?? t('common.unknown'),
          })}
        </Typography>
      )}

      {testResult && (
        <Alert
          severity={testResult.ok ? 'success' : 'error'}
          action={
            testResult.latencyMs !== null ? (
              <Chip size="small" label={`${t('config.latency')}: ${testResult.latencyMs} ms`} />
            ) : undefined
          }
        >
          <strong>{testResult.ok ? t('config.testOk') : t('config.testFailed')}:</strong> {testResult.message}
        </Alert>
      )}

      {/* Connection Settings */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          {t('config.connection')}
        </Typography>
        <Divider sx={{ mb: 2.5 }} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="protocol-label">{t('config.protocol')}</InputLabel>
              <Select
                labelId="protocol-label"
                label={t('config.protocol')}
                value={form.protocol}
                onChange={(e) => updateField('protocol', e.target.value as Protocol)}
              >
                {PROTOCOLS.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              label={t('config.plcModel')}
              value={form.plcModel ?? ''}
              onChange={(e) => updateField('plcModel', e.target.value || null)}
              fullWidth
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              label={t('config.host')}
              placeholder="192.168.0.30"
              value={form.host ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw.includes(':')) {
                  const idx = raw.lastIndexOf(':');
                  const h = raw.slice(0, idx).trim();
                  const p = Number(raw.slice(idx + 1).trim());
                  updateField('host', h || null);
                  if (Number.isFinite(p) && p > 0) updateField('port', p);
                } else {
                  updateField('host', raw || null);
                }
              }}
              fullWidth
            />
          </Grid>

          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <TextField
              size="small"
              type="number"
              label={t('config.port')}
              value={form.port ?? ''}
              onChange={(e) => updateField('port', e.target.value ? Number(e.target.value) : null)}
              fullWidth
            />
          </Grid>

          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <TextField
              size="small"
              type="number"
              label={t('config.rack')}
              value={form.rack ?? ''}
              onChange={(e) => updateField('rack', e.target.value !== '' ? Number(e.target.value) : null)}
              fullWidth
            />
          </Grid>

          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <TextField
              size="small"
              type="number"
              label={t('config.slot')}
              value={form.slot ?? ''}
              onChange={(e) => updateField('slot', e.target.value !== '' ? Number(e.target.value) : null)}
              fullWidth
            />
          </Grid>

          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <TextField
              size="small"
              type="number"
              label={t('config.modbusUnitId')}
              value={form.modbusUnitId ?? ''}
              onChange={(e) => updateField('modbusUnitId', e.target.value !== '' ? Number(e.target.value) : null)}
              fullWidth
            />
          </Grid>

          {/* OPC UA fields */}
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              label={t('config.opcuaEndpoint')}
              value={form.opcuaEndpoint ?? ''}
              onChange={(e) => updateField('opcuaEndpoint', e.target.value || null)}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('config.opcuaSecurityMode')}</InputLabel>
              <Select
                label={t('config.opcuaSecurityMode')}
                value={form.opcuaSecurityMode ?? 'None'}
                onChange={(e) => updateField('opcuaSecurityMode', e.target.value as OpcuaSecurityMode)}
              >
                <MenuItem value="None">None</MenuItem>
                <MenuItem value="Sign">Sign</MenuItem>
                <MenuItem value="SignAndEncrypt">SignAndEncrypt</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              label={t('config.opcuaUsername')}
              value={form.opcuaUsername ?? ''}
              onChange={(e) => updateField('opcuaUsername', e.target.value || null)}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              type="password"
              label={t('config.opcuaPassword')}
              helperText={t('config.secretHelp')}
              value={form.opcuaPassword ?? ''}
              onChange={(e) => updateField('opcuaPassword', e.target.value || null)}
              fullWidth
            />
          </Grid>

          {/* MQTT fields */}
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              label={t('config.mqttUrl')}
              value={form.mqttUrl ?? ''}
              onChange={(e) => updateField('mqttUrl', e.target.value || null)}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              label={t('config.mqttTopicPrefix')}
              value={form.mqttTopicPrefix ?? ''}
              onChange={(e) => updateField('mqttTopicPrefix', e.target.value || null)}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              label={t('config.mqttUsername')}
              value={form.mqttUsername ?? ''}
              onChange={(e) => updateField('mqttUsername', e.target.value || null)}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              type="password"
              label={t('config.mqttPassword')}
              helperText={t('config.secretHelp')}
              value={form.mqttPassword ?? ''}
              onChange={(e) => updateField('mqttPassword', e.target.value || null)}
              fullWidth
            />
          </Grid>

          {/* REST Gateway fields */}
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              label={t('config.restBaseUrl')}
              value={form.restBaseUrl ?? ''}
              onChange={(e) => updateField('restBaseUrl', e.target.value || null)}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              size="small"
              type="password"
              label={t('config.restApiKey')}
              helperText={t('config.secretHelp')}
              value={form.restApiKey ?? ''}
              onChange={(e) => updateField('restApiKey', e.target.value || null)}
              fullWidth
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Timing & Safety */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              {t('config.timing')}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  size="small"
                  type="number"
                  label={t('config.pollIntervalMs')}
                  value={form.pollIntervalMs}
                  onChange={(e) => updateField('pollIntervalMs', Number(e.target.value))}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  size="small"
                  type="number"
                  label={t('config.ackTimeoutMs')}
                  value={form.ackTimeoutMs}
                  onChange={(e) => updateField('ackTimeoutMs', Number(e.target.value))}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  size="small"
                  type="number"
                  label={t('config.completionTimeoutMs')}
                  value={form.completionTimeoutMs}
                  onChange={(e) => updateField('completionTimeoutMs', Number(e.target.value))}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  size="small"
                  type="number"
                  label={t('config.heartbeatTimeoutMs')}
                  value={form.heartbeatTimeoutMs}
                  onChange={(e) => updateField('heartbeatTimeoutMs', Number(e.target.value))}
                  fullWidth
                />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              {t('config.safety')}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={2}>
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.supportsIdempotentCommands}
                      onChange={(e) => updateField('supportsIdempotentCommands', e.target.checked)}
                    />
                  }
                  label={t('config.supportsIdempotentCommands')}
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  {t('config.supportsIdempotentHelp')}
                </Typography>
              </Box>
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.readOnly}
                      onChange={(e) => updateField('readOnly', e.target.checked)}
                    />
                  }
                  label={t('config.readOnly')}
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  {t('config.readOnlyHelp')}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Editable 15 PLC Tag Mapping Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          {t('config.tagMap')}
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('config.tagKey')}</TableCell>
                <TableCell>{t('config.address')}</TableCell>
                <TableCell>{t('config.dataType')}</TableCell>
                <TableCell>{t('config.access')}</TableCell>
                <TableCell>{t('config.description')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {TAG_KEYS.map((key) => {
                const def = form.tagMap[key] ?? { address: '', dataType: 'BOOL', access: 'R', description: '' };
                return (
                  <TableRow key={key} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {t(`tags.${key}`)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                        {key}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      <TextField
                        size="small"
                        value={def.address}
                        onChange={(e) => updateTag(key, 'address', e.target.value)}
                        fullWidth
                        inputProps={{ style: { fontFamily: 'monospace' } }}
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 130 }}>
                      <Select
                        size="small"
                        value={def.dataType}
                        onChange={(e) => updateTag(key, 'dataType', e.target.value as TagDataType)}
                        fullWidth
                      >
                        {TAG_DATA_TYPES.map((dt) => (
                          <MenuItem key={dt} value={dt}>
                            {dt}
                          </MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell sx={{ minWidth: 100 }}>
                      <Select
                        size="small"
                        value={def.access}
                        onChange={(e) => updateTag(key, 'access', e.target.value as TagAccess)}
                        fullWidth
                      >
                        {TAG_ACCESS.map((ac) => (
                          <MenuItem key={ac} value={ac}>
                            {ac}
                          </MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <TextField
                        size="small"
                        value={def.description ?? ''}
                        onChange={(e) => updateTag(key, 'description', e.target.value)}
                        fullWidth
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* 18-Item Supplier Hardware Checklist */}
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <CheckIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={700}>
            {t('config.checklist')}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('config.checklistIntro')}
        </Typography>
        <Grid container spacing={1}>
          {CHECKLIST_KEYS.map((itemKey) => (
            <Grid key={itemKey} size={{ xs: 12, sm: 6, md: 4 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={!!checkedItems[itemKey]}
                    onChange={(e) => setCheckedItems((p) => ({ ...p, [itemKey]: e.target.checked }))}
                  />
                }
                label={<Typography variant="body2">{t(`checklist.${itemKey}`)}</Typography>}
              />
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Safety Confirmation Modal */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('config.saveTitle')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="error">{t('config.saveBody')}</Alert>
            <TextField
              label={t('config.typeToConfirm', { word: confirmWord })}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            color="error"
            disabled={confirmText !== confirmWord || saveMutation.isPending}
            onClick={() => saveMutation.mutate(form)}
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

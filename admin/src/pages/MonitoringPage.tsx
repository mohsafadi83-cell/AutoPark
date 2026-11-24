import {
  Bolt as CacheIcon,
  DeleteSweep as ClearIcon,
  Pause as PauseIcon,
  PlayArrow as ResumeIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid2 as Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { industrialApi, systemApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { MachineStateBadge, SystemStateBadge } from '../components/StatusBadges';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { useToast } from '../context/ToastContext';

export const MonitoringPage: React.FC = () => {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { feed, paused, setPaused, clearFeed, movingVehicles, lastHeartbeat } = useRealtime();

  const statusQuery = useQuery({
    queryKey: ['industrialStatus'],
    queryFn: () => industrialApi.status(),
    refetchInterval: 5000,
  });

  const cacheQuery = useQuery({
    queryKey: ['cacheStats'],
    queryFn: () => systemApi.cacheStats(),
    refetchInterval: 5000,
  });

  const flushCacheMutation = useMutation({
    mutationFn: () => systemApi.flushCache(),
    onSuccess: (res) => {
      notify(`Cache flushed (${res.flushedEntries} entries cleared)`, 'info');
      void queryClient.invalidateQueries({ queryKey: ['cacheStats'] });
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  if (statusQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void statusQuery.refetch()}>
            {t('common.retry')}
          </Button>
        }
      >
        {errorMessage(statusQuery.error, t)}
      </Alert>
    );
  }

  const s = statusQuery.data;
  const movingList = Object.values(movingVehicles);

  const cards = [
    {
      label: t('monitoring.controllerLink'),
      value: s.controllerConnected ? t('monitoring.connected') : t('monitoring.disconnected'),
      color: s.controllerConnected ? 'success.main' : 'error.main',
    },
    {
      label: t('monitoring.plcLink'),
      value: s.plcConnected ? t('monitoring.connected') : t('monitoring.disconnected'),
      color: s.plcConnected ? 'success.main' : 'error.main',
    },
    {
      label: t('monitoring.safety'),
      value: s.safetyOk ? t('monitoring.ok') : t('monitoring.notOk'),
      color: s.safetyOk ? 'success.main' : 'error.main',
    },
    {
      label: t('monitoring.emergencyStop'),
      value: s.emergencyStop ? t('monitoring.active') : t('monitoring.inactive'),
      color: s.emergencyStop ? 'error.main' : 'success.main',
    },
    {
      label: t('monitoring.systemReady'),
      value: s.systemReady ? t('monitoring.ready') : t('monitoring.notReady'),
      color: s.systemReady ? 'success.main' : 'warning.main',
    },
    {
      label: t('monitoring.communication'),
      value: t(`communication.${s.communication}`),
      color: s.communication === 'OK' ? 'success.main' : s.communication === 'DEGRADED' ? 'warning.main' : 'error.main',
    },
    {
      label: t('monitoring.heartbeat'),
      value:
        s.heartbeatAgeMs !== null
          ? `${(s.heartbeatAgeMs / 1000).toFixed(1)} ${t('common.seconds')}`
          : t('common.never'),
      color: s.heartbeatAgeMs !== null && s.heartbeatAgeMs < 15000 ? 'success.main' : 'warning.main',
    },
    {
      label: t('monitoring.protocol'),
      value: `${s.protocol} (${s.configured ? t('common.yes') : t('common.no')})`,
      color: 'text.primary',
    },
  ];

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography variant="h5">{t('monitoring.title')}</Typography>
          <SystemStateBadge state={s.state} />
          <MachineStateBadge state={s.machineState} size="medium" />
        </Stack>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => void statusQuery.refetch()}
        >
          {t('common.refresh')}
        </Button>
      </Stack>

      {s.message && (
        <Alert severity={s.state === 'ERROR' || s.state === 'OFFLINE' ? 'error' : 'warning'}>{s.message}</Alert>
      )}

      <Grid container spacing={2}>
        {cards.map((c) => (
          <Grid key={c.label} size={{ xs: 6, sm: 4, md: 3 }}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="caption" color="text.secondary">
                {c.label}
              </Typography>
              <Typography variant="h6" fontWeight={800} sx={{ color: c.color, mt: 0.5 }}>
                {c.value}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={3} flexWrap="wrap">
          <Typography variant="body2">
            <strong>{t('monitoring.lastHeartbeat')}:</strong>{' '}
            {s.lastHeartbeat ? new Date(s.lastHeartbeat).toLocaleTimeString() : lastHeartbeat ?? t('common.never')}
          </Typography>
          <Typography variant="body2">
            <strong>{t('monitoring.lastUpdate')}:</strong> {new Date(s.lastUpdate).toLocaleTimeString()}
          </Typography>
          <Typography variant="body2">
            <strong>{t('monitoring.activeCommand')}:</strong> {s.activeCommandId ?? t('common.none')}
          </Typography>
        </Stack>
      </Paper>

      {/* Database Read-Through Cache Telemetry Card */}
      {cacheQuery.data && (
        <Paper sx={{ p: 2.5 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ sm: 'center' }}
            spacing={1.5}
            sx={{ mb: 1.5 }}
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <CacheIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={700}>
                Database Cache Performance
              </Typography>
              <Chip
                size="small"
                color={cacheQuery.data.redisConnected ? 'success' : 'primary'}
                variant="outlined"
                label={
                  cacheQuery.data.redisConnected
                    ? 'Redis L2 + Memory L1'
                    : cacheQuery.data.redisConfigured
                      ? 'Memory L1 (Redis Standby)'
                      : 'In-Memory LRU L1'
                }
              />
              <Chip
                size="small"
                color={cacheQuery.data.hitRatePct >= 60 ? 'success' : 'default'}
                label={`Hit Rate: ${cacheQuery.data.hitRatePct}%`}
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={() => void cacheQuery.refetch()}>
                {t('common.refresh')}
              </Button>
              {can('config.manage') && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<ClearIcon />}
                  disabled={flushCacheMutation.isPending}
                  onClick={() => flushCacheMutation.mutate()}
                >
                  Flush Cache
                </Button>
              )}
            </Stack>
          </Stack>

          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, cacheQuery.data.hitRatePct))}
            color={cacheQuery.data.hitRatePct >= 60 ? 'success' : 'primary'}
            sx={{ height: 8, borderRadius: 4, mb: 2 }}
          />

          <Grid container spacing={2} sx={{ mb: 1.5 }}>
            {[
              { label: 'Cache Hits (DB Saved)', value: cacheQuery.data.hits, color: 'success.main' },
              { label: 'Cache Misses (DB Reads)', value: cacheQuery.data.misses, color: 'text.primary' },
              { label: 'Stampede Deduped', value: cacheQuery.data.dedupedInFlight, color: 'primary.main' },
              {
                label: 'Active Entries',
                value: `${cacheQuery.data.entries} / ${cacheQuery.data.maxEntries}`,
                color: 'info.main',
              },
            ].map((m) => (
              <Grid key={m.label} size={{ xs: 6, md: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary">
                    {m.label}
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ color: m.color }}>
                    {m.value}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          {Object.keys(cacheQuery.data.byNamespace).length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {Object.entries(cacheQuery.data.byNamespace).map(([ns, nsStat]) => (
                <Chip
                  key={ns}
                  size="small"
                  variant="outlined"
                  label={`${ns}: ${nsStat.hitRatePct}% (${nsStat.hits}H / ${nsStat.misses}M)`}
                />
              ))}
            </Stack>
          )}
        </Paper>
      )}

      {movingList.length > 0 && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            {t('monitoring.movingProgress')}
          </Typography>
          <Stack spacing={1.5}>
            {movingList.map((mv) => (
              <Box key={mv.requestId} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="body2" fontWeight={700}>
                    {mv.plateNumber} → {mv.spaceNumber} ({t(`requestType.${mv.requestType}`)})
                  </Typography>
                  <Typography variant="body2" color="primary">
                    {mv.phase} · {mv.progress}%
                  </Typography>
                </Stack>
                <LinearProgress variant="determinate" value={mv.progress} sx={{ height: 8, borderRadius: 4 }} />
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Live WebSocket Event Feed */}
      <Paper sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1" fontWeight={700}>
              {t('monitoring.eventFeed')}
            </Typography>
            <Chip
              size="small"
              color={paused ? 'warning' : 'success'}
              label={paused ? t('monitoring.pause') : t('common.live')}
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              startIcon={paused ? <ResumeIcon /> : <PauseIcon />}
              onClick={() => setPaused(!paused)}
            >
              {paused ? t('monitoring.resume') : t('monitoring.pause')}
            </Button>
            <Button size="small" variant="outlined" startIcon={<ClearIcon />} onClick={clearFeed}>
              {t('monitoring.clearFeed')}
            </Button>
          </Stack>
        </Stack>
        <Divider sx={{ mb: 1.5 }} />
        <Box sx={{ maxHeight: 380, overflowY: 'auto', fontFamily: 'monospace', fontSize: 13 }}>
          {feed.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('monitoring.noEvents')}
            </Typography>
          ) : (
            <Stack spacing={0.75}>
              {feed.map((ev) => (
                <Box
                  key={ev.id}
                  sx={{
                    p: 1,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 2,
                  }}
                >
                  <Box>
                    <Chip size="small" label={ev.event} sx={{ mr: 1, fontFamily: 'monospace' }} />
                    <span>{ev.summary}</span>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Paper>
    </Stack>
  );
};

import {
  PlayArrow as ScenarioIcon,
  Refresh as RefreshIcon,
  Science as SimIcon,
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
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { alarmsApi, parkingApi, simulationApi, systemApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import {
  AlarmSeverityBadge,
  MachineStateBadge,
  RequestStatusBadge,
  SystemStateBadge,
} from '../components/StatusBadges';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SIMULATION_SCENARIOS, type SimulationScenario } from '../types/api';

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => systemApi.dashboard(),
    refetchInterval: 10000,
  });

  const activeRequestsQuery = useQuery({
    queryKey: ['parkingRequests', 'active-dashboard'],
    queryFn: () => parkingApi.requests({ active: true, limit: 6 }),
    enabled: can('parking.view'),
    refetchInterval: 8000,
  });

  const activeAlarmsQuery = useQuery({
    queryKey: ['alarms', 'active-dashboard'],
    queryFn: () => alarmsApi.list({ status: 'ACTIVE', limit: 6 }),
    enabled: can('alarms.view'),
    refetchInterval: 10000,
  });

  const canSim = can('simulation.control') && dashboardQuery.data?.system.mode === 'SIMULATION';

  const simStateQuery = useQuery({
    queryKey: ['simulationState'],
    queryFn: () => simulationApi.state(),
    enabled: !!canSim,
    refetchInterval: 8000,
  });

  const simMutation = useMutation({
    mutationFn: (scenario: SimulationScenario) => simulationApi.scenario(scenario),
    onSuccess: (_data, scenario) => {
      notify(t('simulation.applied', { s: t(`simulation.scenario.${scenario}`) }), 'success');
      void queryClient.invalidateQueries({ queryKey: ['simulationState'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['systemStatus'] });
      void queryClient.invalidateQueries({ queryKey: ['alarms'] });
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  if (dashboardQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void dashboardQuery.refetch()}>
            {t('common.retry')}
          </Button>
        }
      >
        {errorMessage(dashboardQuery.error, t)}
      </Alert>
    );
  }

  const { system, totals, activeAlarms, criticalAlarms, activeRequests, health } = dashboardQuery.data;
  const occupancyRate = totals.total > 0 ? Math.round((totals.occupied / totals.total) * 100) : 0;

  const chartData = [
    { name: t('spaceStatus.AVAILABLE'), value: totals.available, color: '#22c55e' },
    { name: t('spaceStatus.OCCUPIED'), value: totals.occupied, color: '#3b82f6' },
    { name: t('spaceStatus.RESERVED'), value: totals.reserved, color: '#06b6d4' },
    { name: t('spaceStatus.MOVING'), value: totals.moving, color: '#f59e0b' },
    { name: t('spaceStatus.MAINTENANCE'), value: totals.maintenance, color: '#eab308' },
    { name: t('spaceStatus.BLOCKED'), value: totals.blocked, color: '#64748b' },
    { name: t('spaceStatus.ERROR'), value: totals.error, color: '#ef4444' },
  ];

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">{t('dashboard.title')}</Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => void dashboardQuery.refetch()}
        >
          {t('common.refresh')}
        </Button>
      </Stack>

      {/* System Status Hero */}
      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={1}>
              <Typography variant="overline" color="text.secondary">
                {t('dashboard.systemStatus')}
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <SystemStateBadge state={system.state} />
                <MachineStateBadge state={system.machineState} size="medium" />
                <Chip
                  label={`${t('dashboard.mode')}: ${t(`mode.${system.mode}`)}`}
                  size="small"
                  variant="outlined"
                />
                <Chip label={`${t('dashboard.adapter')}: ${system.adapter}`} size="small" variant="outlined" />
              </Stack>
              {system.message && (
                <Alert severity={system.state === 'ERROR' || system.state === 'OFFLINE' ? 'error' : 'warning'} sx={{ mt: 1 }}>
                  {system.message}
                </Alert>
              )}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('monitoring.controllerLink')}
                </Typography>
                <Typography variant="body2" fontWeight={700} color={system.controllerConnected ? 'success.main' : 'error.main'}>
                  {system.controllerConnected ? t('monitoring.connected') : t('monitoring.disconnected')}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('monitoring.plcLink')}
                </Typography>
                <Typography variant="body2" fontWeight={700} color={system.plcConnected ? 'success.main' : 'error.main'}>
                  {system.plcConnected ? t('monitoring.connected') : t('monitoring.disconnected')}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('monitoring.safety')}
                </Typography>
                <Typography variant="body2" fontWeight={700} color={system.safetyOk ? 'success.main' : 'error.main'}>
                  {system.safetyOk ? t('monitoring.ok') : t('monitoring.notOk')}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('dashboard.health')}
                </Typography>
                <Typography variant="body2" fontWeight={700}>
                  {health}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={health}
                  color={health > 80 ? 'success' : health > 50 ? 'warning' : 'error'}
                  sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                />
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {/* KPI Cards */}
      <Grid container spacing={2}>
        {[
          { label: t('dashboard.totalSpaces'), value: totals.total, color: 'text.primary' },
          { label: t('dashboard.available'), value: totals.available, color: 'success.main' },
          { label: `${t('dashboard.occupied')} (${occupancyRate}%)`, value: totals.occupied, color: 'info.main' },
          { label: t('dashboard.activeRequests'), value: activeRequests, color: 'primary.main' },
          { label: t('dashboard.activeAlarms'), value: activeAlarms, color: activeAlarms > 0 ? 'warning.main' : 'text.primary' },
          { label: t('dashboard.criticalAlarms'), value: criticalAlarms, color: criticalAlarms > 0 ? 'error.main' : 'text.primary' },
        ].map((kpi) => (
          <Grid key={kpi.label} size={{ xs: 6, sm: 4, md: 2 }}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="caption" color="text.secondary">
                {kpi.label}
              </Typography>
              <Typography variant="h4" fontWeight={800} sx={{ color: kpi.color, mt: 0.5 }}>
                {kpi.value}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Space Distribution & Live Requests/Alarms */}
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              {t('dashboard.spaceDistribution')}
            </Typography>
            <Box sx={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2.5}>
            {/* Active Requests */}
            <Paper sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {t('dashboard.liveRequests')}
                </Typography>
                {can('parking.view') && (
                  <Button size="small" onClick={() => navigate('/parking')}>
                    {t('dashboard.viewAll')}
                  </Button>
                )}
              </Stack>
              <Divider sx={{ mb: 1.5 }} />
              {!activeRequestsQuery.data?.items.length ? (
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.noActiveRequests')}
                </Typography>
              ) : (
                <Stack spacing={1.25}>
                  {activeRequestsQuery.data.items.map((req) => (
                    <Box
                      key={req.id}
                      sx={{
                        p: 1.25,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        cursor: 'pointer',
                      }}
                      onClick={() => navigate('/parking')}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" fontWeight={700}>
                          {req.requestNumber} · {req.vehicle.plateNumber} ({t(`requestType.${req.requestType}`)})
                        </Typography>
                        <RequestStatusBadge status={req.status} />
                      </Stack>
                      {req.command && (
                        <Box sx={{ mt: 1 }}>
                          <LinearProgress variant="determinate" value={req.command.progress} sx={{ height: 6, borderRadius: 3 }} />
                        </Box>
                      )}
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>

            {/* Active Alarms */}
            <Paper sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {t('dashboard.liveAlarms')}
                </Typography>
                {can('alarms.view') && (
                  <Button size="small" onClick={() => navigate('/alarms')}>
                    {t('dashboard.viewAll')}
                  </Button>
                )}
              </Stack>
              <Divider sx={{ mb: 1.5 }} />
              {!activeAlarmsQuery.data?.items.length ? (
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.noActiveAlarms')}
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {activeAlarmsQuery.data.items.map((alarm) => (
                    <Stack
                      key={alarm.id}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <AlarmSeverityBadge severity={alarm.severity} />
                        <Box>
                          <Typography variant="body2" fontWeight={700}>
                            {alarm.alarmCode}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {alarm.description}
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(alarm.createdAt).toLocaleTimeString()}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Paper>
          </Stack>
        </Grid>
      </Grid>

      {/* Simulation Control Panel */}
      {canSim && (
        <Paper sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <SimIcon color="secondary" />
            <Typography variant="subtitle1" fontWeight={700}>
              {t('simulation.title')}
            </Typography>
          </Stack>
          {simStateQuery.data && (
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
              <Chip
                size="small"
                color={simStateQuery.data.offline ? 'error' : 'success'}
                label={`${t('simulation.offline')}: ${simStateQuery.data.offline ? t('common.yes') : t('common.no')}`}
              />
              <Chip
                size="small"
                color={simStateQuery.data.emergencyStop ? 'error' : 'default'}
                label={`${t('simulation.emergencyStop')}: ${simStateQuery.data.emergencyStop ? t('common.yes') : t('common.no')}`}
              />
              <Chip
                size="small"
                color={simStateQuery.data.failNext ? 'warning' : 'default'}
                label={`${t('simulation.failNext')}: ${simStateQuery.data.failNext ? t('common.yes') : t('common.no')}`}
              />
              <Chip
                size="small"
                color={simStateQuery.data.timeoutNext ? 'warning' : 'default'}
                label={`${t('simulation.timeoutNext')}: ${simStateQuery.data.timeoutNext ? t('common.yes') : t('common.no')}`}
              />
            </Stack>
          )}
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {SIMULATION_SCENARIOS.map((sc) => (
              <Button
                key={sc}
                size="small"
                variant="outlined"
                color={
                  sc === 'EMERGENCY_STOP' || sc === 'RAISE_CRITICAL' || sc === 'GO_OFFLINE'
                    ? 'error'
                    : sc === 'NORMAL' || sc === 'GO_ONLINE' || sc === 'CLEAR_EMERGENCY' || sc === 'CLEAR_ALARMS'
                      ? 'success'
                      : 'warning'
                }
                startIcon={<ScenarioIcon />}
                disabled={simMutation.isPending}
                onClick={() => simMutation.mutate(sc)}
              >
                {t(`simulation.scenario.${sc}`)}
              </Button>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
};

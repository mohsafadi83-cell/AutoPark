import { CheckCircleOutline as AckIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { alarmsApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { AlarmSeverityBadge, AlarmStatusBadge } from '../components/StatusBadges';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ALARM_SEVERITIES, type Alarm, type AlarmSeverity, type AlarmStatus } from '../types/api';

export const AlarmsPage: React.FC = () => {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<AlarmStatus | ''>('');
  const [severityFilter, setSeverityFilter] = useState<AlarmSeverity | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [ackTarget, setAckTarget] = useState<Alarm | null>(null);
  const [ackNote, setAckNote] = useState('');

  const alarmsQuery = useQuery({
    queryKey: ['alarms', statusFilter, severityFilter, page, rowsPerPage],
    queryFn: () =>
      alarmsApi.list({
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        page: page + 1,
        limit: rowsPerPage,
      }),
    refetchInterval: 8000,
  });

  const ackMutation = useMutation({
    mutationFn: () => alarmsApi.acknowledge(ackTarget!.id, ackNote.trim() || undefined),
    onSuccess: () => {
      notify(t('alarms.acknowledged'), 'success');
      setAckTarget(null);
      setAckNote('');
      void queryClient.invalidateQueries({ queryKey: ['alarms'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
        <Typography variant="h5">{t('alarms.title')}</Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void alarmsQuery.refetch()}>
          {t('common.refresh')}
        </Button>
      </Stack>

      <Alert severity="info">{t('alarms.noResetInfo')}</Alert>

      <Paper sx={{ p: 2.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{t('common.status')}</InputLabel>
            <Select
              label={t('common.status')}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as AlarmStatus | '');
                setPage(0);
              }}
            >
              <MenuItem value="">{t('alarms.all')}</MenuItem>
              <MenuItem value="ACTIVE">{t('alarmStatus.ACTIVE')}</MenuItem>
              <MenuItem value="ACKNOWLEDGED">{t('alarmStatus.ACKNOWLEDGED')}</MenuItem>
              <MenuItem value="RESOLVED">{t('alarmStatus.RESOLVED')}</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{t('common.severity')}</InputLabel>
            <Select
              label={t('common.severity')}
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value as AlarmSeverity | '');
                setPage(0);
              }}
            >
              <MenuItem value="">{t('common.all')}</MenuItem>
              {ALARM_SEVERITIES.map((sev) => (
                <MenuItem key={sev} value={sev}>
                  {t(`severity.${sev}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('alarms.code')}</TableCell>
                <TableCell>{t('common.severity')}</TableCell>
                <TableCell>{t('alarms.description')}</TableCell>
                <TableCell>{t('common.source')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('common.createdAt')}</TableCell>
                <TableCell>{t('alarms.acknowledgedBy')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alarmsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : !alarmsQuery.data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                alarmsQuery.data.items.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{a.alarmCode}</TableCell>
                    <TableCell>
                      <AlarmSeverityBadge severity={a.severity} />
                    </TableCell>
                    <TableCell>{a.description}</TableCell>
                    <TableCell>{a.source}</TableCell>
                    <TableCell>
                      <AlarmStatusBadge status={a.status} />
                    </TableCell>
                    <TableCell>{new Date(a.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {a.acknowledgedBy ? `${a.acknowledgedBy.fullName}` : t('common.none')}
                    </TableCell>
                    <TableCell align="right">
                      {a.status === 'ACTIVE' && can('alarms.acknowledge') && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<AckIcon />}
                          onClick={() => {
                            setAckTarget(a);
                            setAckNote('');
                          }}
                        >
                          {t('alarms.acknowledge')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={alarmsQuery.data?.total ?? 0}
          page={page}
          onPageChange={(_e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          labelRowsPerPage={t('common.rowsPerPage')}
        />
      </Paper>

      {/* Acknowledge Alarm Modal */}
      <Dialog open={!!ackTarget} onClose={() => setAckTarget(null)} maxWidth="xs" fullWidth>
        {ackTarget && (
          <>
            <DialogTitle>{t('alarms.acknowledgeTitle', { code: ackTarget.alarmCode })}</DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <Typography variant="body2">{ackTarget.description}</Typography>
                <TextField
                  label={t('alarms.note')}
                  value={ackNote}
                  onChange={(e) => setAckNote(e.target.value)}
                  multiline
                  rows={3}
                  fullWidth
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setAckTarget(null)}>{t('common.cancel')}</Button>
              <Button
                variant="contained"
                disabled={ackMutation.isPending}
                onClick={() => ackMutation.mutate()}
              >
                {t('alarms.acknowledge')}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Stack>
  );
};

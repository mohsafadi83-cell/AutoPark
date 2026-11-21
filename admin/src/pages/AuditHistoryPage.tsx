import { Download as DownloadIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import {
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auditApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { AlarmSeverityBadge } from '../components/StatusBadges';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ALARM_SEVERITIES,
  EVENT_CATEGORIES,
  HISTORY_KINDS,
  type AlarmSeverity,
  type EventCategory,
  type HistoryKind,
} from '../types/api';

type ActiveTab = 'history' | 'events' | 'audit';

export const AuditHistoryPage: React.FC = () => {
  const { t } = useTranslation();
  const { can, canAny } = useAuth();
  const { notify } = useToast();

  const canHistory = canAny(['history.view.all', 'history.view.own']);
  const canEvents = canAny(['history.view.all', 'diagnostics.view']);
  const canAudit = can('audit.view');

  const initialTab: ActiveTab = canHistory ? 'history' : canEvents ? 'events' : 'audit';
  const [tab, setTab] = useState<ActiveTab>(initialTab);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<HistoryKind | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | ''>('');
  const [severityFilter, setSeverityFilter] = useState<AlarmSeverity | ''>('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  const historyQuery = useQuery({
    queryKey: ['history', kindFilter, from, to, search, page, rowsPerPage],
    queryFn: () =>
      auditApi.history({
        kind: kindFilter || undefined,
        from: from || undefined,
        to: to || undefined,
        q: search || undefined,
        page: page + 1,
        limit: rowsPerPage,
      }),
    enabled: tab === 'history' && canHistory,
  });

  const eventsQuery = useQuery({
    queryKey: ['events', categoryFilter, severityFilter, from, to, page, rowsPerPage],
    queryFn: () =>
      auditApi.events({
        category: categoryFilter || undefined,
        severity: severityFilter || undefined,
        from: from || undefined,
        to: to || undefined,
        page: page + 1,
        limit: rowsPerPage,
      }),
    enabled: tab === 'events' && canEvents,
  });

  const auditQuery = useQuery({
    queryKey: ['audit', actionFilter, from, to, page, rowsPerPage],
    queryFn: () =>
      auditApi.audit({
        action: actionFilter || undefined,
        from: from || undefined,
        to: to || undefined,
        page: page + 1,
        limit: rowsPerPage,
      }),
    enabled: tab === 'audit' && canAudit,
  });

  const handleExportCsv = async () => {
    try {
      const blob = await auditApi.exportHistoryCsv({
        kind: kindFilter || undefined,
        from: from || undefined,
        to: to || undefined,
        q: search || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `autopark-history-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify(errorMessage(err, t), 'error');
    }
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
        <Typography variant="h5">{t('nav.auditAndHistory')}</Typography>
        <Stack direction="row" spacing={1}>
          {tab === 'history' && canHistory && (
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => void handleExportCsv()}>
              {t('history.exportCsv')}
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              if (tab === 'history') void historyQuery.refetch();
              if (tab === 'events') void eventsQuery.refetch();
              if (tab === 'audit') void auditQuery.refetch();
            }}
          >
            {t('common.refresh')}
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ px: 2 }}>
        <Tabs
          value={tab}
          onChange={(_e, v: ActiveTab) => {
            setTab(v);
            setPage(0);
          }}
        >
          {canHistory && <Tab value="history" label={t('history.title')} />}
          {canEvents && <Tab value="events" label={t('events.title')} />}
          {canAudit && <Tab value="audit" label={t('audit.title')} />}
        </Tabs>
      </Paper>

      <Paper sx={{ p: 2.5 }}>
        {/* Filters */}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap">
          {tab === 'history' && (
            <>
              <TextField
                size="small"
                placeholder={t('history.searchPlaceholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                sx={{ minWidth: 220 }}
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>{t('history.kind')}</InputLabel>
                <Select
                  label={t('history.kind')}
                  value={kindFilter}
                  onChange={(e) => {
                    setKindFilter(e.target.value as HistoryKind | '');
                    setPage(0);
                  }}
                >
                  <MenuItem value="">{t('common.all')}</MenuItem>
                  {HISTORY_KINDS.map((k) => (
                    <MenuItem key={k} value={k}>
                      {t(`history.kinds.${k}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          {tab === 'events' && (
            <>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>{t('common.category')}</InputLabel>
                <Select
                  label={t('common.category')}
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value as EventCategory | '');
                    setPage(0);
                  }}
                >
                  <MenuItem value="">{t('common.all')}</MenuItem>
                  {EVENT_CATEGORIES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {t(`eventCategory.${c}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 150 }}>
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
                  {ALARM_SEVERITIES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {t(`severity.${s}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          {tab === 'audit' && (
            <TextField
              size="small"
              label={t('audit.action')}
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 200 }}
            />
          )}

          <TextField
            size="small"
            type="date"
            label={t('common.from')}
            InputLabelProps={{ shrink: true }}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
          <TextField
            size="small"
            type="date"
            label={t('common.to')}
            InputLabelProps={{ shrink: true }}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </Stack>

        {/* Tables */}
        {tab === 'history' && (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('history.kind')}</TableCell>
                    <TableCell>{t('common.message')}</TableCell>
                    <TableCell>{t('history.plate')}</TableCell>
                    <TableCell>{t('common.status')}</TableCell>
                    <TableCell>{t('history.actor')}</TableCell>
                    <TableCell>{t('common.createdAt')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : !historyQuery.data?.items.length ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        {t('common.noData')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyQuery.data.items.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Chip size="small" label={t(`history.kinds.${item.kind}`)} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {item.title}
                          </Typography>
                          {item.description && (
                            <Typography variant="caption" color="text.secondary">
                              {item.description}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>
                          {item.plateNumber ?? t('common.none')}
                        </TableCell>
                        <TableCell>{item.status ?? t('common.none')}</TableCell>
                        <TableCell>{item.actor ?? t('common.none')}</TableCell>
                        <TableCell>{new Date(item.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={historyQuery.data?.total ?? 0}
              page={page}
              onPageChange={(_e, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              labelRowsPerPage={t('common.rowsPerPage')}
            />
          </>
        )}

        {tab === 'events' && (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('events.eventType')}</TableCell>
                    <TableCell>{t('common.category')}</TableCell>
                    <TableCell>{t('common.severity')}</TableCell>
                    <TableCell>{t('common.message')}</TableCell>
                    <TableCell>{t('common.source')}</TableCell>
                    <TableCell>{t('common.createdAt')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {eventsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : !eventsQuery.data?.items.length ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        {t('common.noData')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    eventsQuery.data.items.map((ev) => (
                      <TableRow key={ev.id} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{ev.eventType}</TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined" label={t(`eventCategory.${ev.category}`)} />
                        </TableCell>
                        <TableCell>
                          <AlarmSeverityBadge severity={ev.severity} />
                        </TableCell>
                        <TableCell>{ev.message}</TableCell>
                        <TableCell>{ev.source}</TableCell>
                        <TableCell>{new Date(ev.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={eventsQuery.data?.total ?? 0}
              page={page}
              onPageChange={(_e, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              labelRowsPerPage={t('common.rowsPerPage')}
            />
          </>
        )}

        {tab === 'audit' && (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('audit.user')}</TableCell>
                    <TableCell>{t('audit.action')}</TableCell>
                    <TableCell>{t('audit.entity')}</TableCell>
                    <TableCell>{t('audit.ip')}</TableCell>
                    <TableCell>{t('audit.details')}</TableCell>
                    <TableCell>{t('common.createdAt')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {auditQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : !auditQuery.data?.items.length ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        {t('common.noData')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditQuery.data.items.map((log) => (
                      <TableRow key={log.id} hover>
                        <TableCell>{log.username ?? log.userId ?? t('common.none')}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{log.action}</TableCell>
                        <TableCell>
                          {log.entity ? `${log.entity} ${log.entityId ?? ''}` : t('common.none')}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{log.ipAddress ?? t('common.none')}</TableCell>
                        <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.details ? JSON.stringify(log.details) : t('common.none')}
                        </TableCell>
                        <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={auditQuery.data?.total ?? 0}
              page={page}
              onPageChange={(_e, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              labelRowsPerPage={t('common.rowsPerPage')}
            />
          </>
        )}
      </Paper>
    </Stack>
  );
};

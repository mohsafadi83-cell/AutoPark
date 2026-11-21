import { Refresh as RefreshIcon } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  InputLabel,
  LinearProgress,
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
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { industrialApi } from '../api/endpoints';
import { CommandStatusBadge } from '../components/StatusBadges';
import { COMMAND_STATUSES, type CommandStatus, type IndustrialCommand, type RequestType } from '../types/api';

export const CommandsPage: React.FC = () => {
  const { t } = useTranslation();

  const [statusFilter, setStatusFilter] = useState<CommandStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<RequestType | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selected, setSelected] = useState<IndustrialCommand | null>(null);

  const commandsQuery = useQuery({
    queryKey: ['industrialCommands', statusFilter, typeFilter, page, rowsPerPage],
    queryFn: () =>
      industrialApi.commands({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        page: page + 1,
        limit: rowsPerPage,
      }),
    refetchInterval: 6000,
  });

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
        <Typography variant="h5">{t('commands.title')}</Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void commandsQuery.refetch()}>
          {t('common.refresh')}
        </Button>
      </Stack>

      <Paper sx={{ p: 2.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('common.type')}</InputLabel>
            <Select
              label={t('common.type')}
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as RequestType | '');
                setPage(0);
              }}
            >
              <MenuItem value="">{t('common.all')}</MenuItem>
              <MenuItem value="PARK">{t('requestType.PARK')}</MenuItem>
              <MenuItem value="RETRIEVE">{t('requestType.RETRIEVE')}</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>{t('common.status')}</InputLabel>
            <Select
              label={t('common.status')}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as CommandStatus | '');
                setPage(0);
              }}
            >
              <MenuItem value="">{t('common.all')}</MenuItem>
              {COMMAND_STATUSES.map((st) => (
                <MenuItem key={st} value={st}>
                  {t(`commandStatus.${st}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('commands.commandId')}</TableCell>
                <TableCell>{t('commands.type')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('commands.progress')}</TableCell>
                <TableCell>{t('commands.requestedBy')}</TableCell>
                <TableCell>{t('common.createdAt')}</TableCell>
                <TableCell>{t('commands.sentAt')}</TableCell>
                <TableCell>{t('commands.acknowledgedAt')}</TableCell>
                <TableCell>{t('commands.completedAt')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {commandsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : !commandsQuery.data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                commandsQuery.data.items.map((cmd) => (
                  <TableRow
                    key={cmd.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelected(cmd)}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{cmd.commandId}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={cmd.commandType === 'PARK' ? 'primary' : 'secondary'}
                        label={t(`requestType.${cmd.commandType}`)}
                      />
                    </TableCell>
                    <TableCell>
                      <CommandStatusBadge status={cmd.status} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 110 }}>
                      <Stack spacing={0.5}>
                        <LinearProgress variant="determinate" value={cmd.progress} />
                        <Typography variant="caption" color="text.secondary">
                          {cmd.progress}% {cmd.phase ? `· ${cmd.phase}` : ''}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{cmd.requestedBy?.fullName ?? t('common.none')}</TableCell>
                    <TableCell>{new Date(cmd.createdAt).toLocaleTimeString()}</TableCell>
                    <TableCell>{cmd.sentAt ? new Date(cmd.sentAt).toLocaleTimeString() : t('common.none')}</TableCell>
                    <TableCell>
                      {cmd.acknowledgedAt ? new Date(cmd.acknowledgedAt).toLocaleTimeString() : t('common.none')}
                    </TableCell>
                    <TableCell>
                      {cmd.completedAt ? new Date(cmd.completedAt).toLocaleTimeString() : t('common.none')}
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Button size="small" onClick={() => setSelected(cmd)}>
                        {t('common.details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={commandsQuery.data?.total ?? 0}
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

      {/* Command Inspector Drawer */}
      <Drawer
        anchor="right"
        open={!!selected}
        onClose={() => setSelected(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 480 }, p: 3 } }}
      >
        {selected && (
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" fontFamily="monospace">
                {selected.commandId}
              </Typography>
              <CommandStatusBadge status={selected.status} />
            </Stack>

            <Divider />

            <Stack spacing={1}>
              <Typography variant="body2">
                <strong>{t('commands.type')}:</strong> {t(`requestType.${selected.commandType}`)}
              </Typography>
              <Typography variant="body2">
                <strong>{t('commands.requestedBy')}:</strong> {selected.requestedBy?.fullName ?? t('common.none')}
              </Typography>
              <Typography variant="body2">
                <strong>{t('commands.vehicleId')}:</strong> {selected.vehicleId ?? t('common.none')}
              </Typography>
              <Typography variant="body2">
                <strong>{t('commands.spaceId')}:</strong> {selected.parkingSpaceId ?? t('common.none')}
              </Typography>
              <Typography variant="body2">
                <strong>{t('commands.requestId')}:</strong> {selected.parkingRequestId ?? t('common.none')}
              </Typography>
              <Typography variant="body2">
                <strong>{t('common.createdAt')}:</strong> {new Date(selected.createdAt).toLocaleString()}
              </Typography>
              <Typography variant="body2">
                <strong>{t('commands.sentAt')}:</strong>{' '}
                {selected.sentAt ? new Date(selected.sentAt).toLocaleString() : t('common.none')}
              </Typography>
              <Typography variant="body2">
                <strong>{t('commands.acknowledgedAt')}:</strong>{' '}
                {selected.acknowledgedAt ? new Date(selected.acknowledgedAt).toLocaleString() : t('common.none')}
              </Typography>
              <Typography variant="body2">
                <strong>{t('commands.completedAt')}:</strong>{' '}
                {selected.completedAt ? new Date(selected.completedAt).toLocaleString() : t('common.none')}
              </Typography>
            </Stack>

            {selected.errorMessage && <Alert severity="error">{selected.errorMessage}</Alert>}

            <Divider />

            <Typography variant="subtitle2" fontWeight={700}>
              {t('commands.payload')}
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover', overflowX: 'auto' }}>
              <pre style={{ margin: 0, fontSize: 12 }}>
                {JSON.stringify(selected.payload ?? {}, null, 2)}
              </pre>
            </Paper>

            <Typography variant="subtitle2" fontWeight={700}>
              {t('commands.response')}
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover', overflowX: 'auto' }}>
              <pre style={{ margin: 0, fontSize: 12 }}>
                {JSON.stringify(selected.controllerResponse ?? {}, null, 2)}
              </pre>
            </Paper>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" onClick={() => setSelected(null)}>
                {t('common.close')}
              </Button>
            </Box>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
};

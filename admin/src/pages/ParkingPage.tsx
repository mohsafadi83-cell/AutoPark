import {
  Add as AddIcon,
  Cancel as CancelIcon,
  DirectionsCar as CarIcon,
  LocalParking as ParkIcon,
  Refresh as RefreshIcon,
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
  Drawer,
  FormControl,
  FormControlLabel,
  Grid2 as Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
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
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parkingApi, vehiclesApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { RequestTimeline } from '../components/RequestTimeline';
import { CommandStatusBadge, RequestStatusBadge, SpaceStatusBadge } from '../components/StatusBadges';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  REQUEST_STATUSES,
  SPACE_STATUSES,
  type CommandStatus,
  type ParkingRequest,
  type ParkingSpace,
  type RequestStatus,
  type RequestType,
  type SpaceStatus,
} from '../types/api';

const CANCELLABLE_CMD_STATUSES: CommandStatus[] = ['CREATED', 'VALIDATED', 'AUTHORIZED'];

export function canCancelParkingRequest(req: ParkingRequest): boolean {
  if (req.status === 'COMPLETED' || req.status === 'FAILED' || req.status === 'CANCELLED') {
    return false;
  }
  if (!req.command) return true;
  return CANCELLABLE_CMD_STATUSES.includes(req.command.status);
}

/** Sorts tower bays top-to-bottom per TIA Portal PDF (L11 Level 1 Top -> L12 Level 2 Mid -> L13 Level 3 Bottom). */
export function sortTowerSpacesTopDown<T extends { level: number }>(spaces: T[]): T[] {
  return [...spaces].sort((a, b) => a.level - b.level);
}

const SPACE_BORDER_COLOR: Record<SpaceStatus, string> = {
  AVAILABLE: '#22c55e',
  OCCUPIED: '#3b82f6',
  RESERVED: '#06b6d4',
  MOVING: '#f59e0b',
  MAINTENANCE: '#eab308',
  BLOCKED: '#64748b',
  ERROR: '#ef4444',
};

export const ParkingPage: React.FC = () => {
  const { t } = useTranslation();
  const { can, canAny } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  // Space filters
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [zoneFilter, setZoneFilter] = useState<string>('');
  const [spaceStatusFilter, setSpaceStatusFilter] = useState<string>('');
  const [selectedSpace, setSelectedSpace] = useState<ParkingSpace | null>(null);

  // Request filters & pagination
  const [reqStatusFilter, setReqStatusFilter] = useState<RequestStatus | ''>('');
  const [reqTypeFilter, setReqTypeFilter] = useState<RequestType | ''>('');
  const [activeOnly, setActiveOnly] = useState<boolean>(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Create request modal state
  const [createType, setCreateType] = useState<RequestType | null>(null);
  const [inputMode, setInputMode] = useState<'vehicle' | 'plate'>('vehicle');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [plateNumber, setPlateNumber] = useState<string>('');
  const [targetSpaceNumber, setTargetSpaceNumber] = useState<string>('');
  const [confirmStep, setConfirmStep] = useState<boolean>(false);

  const canCreateRequest = canAny(['parking.request', 'parking.request.any']);

  const spacesQuery = useQuery({
    queryKey: ['parkingSpaces', levelFilter, zoneFilter, spaceStatusFilter],
    queryFn: () =>
      parkingApi.spaces({
        level: levelFilter || undefined,
        zone: zoneFilter || undefined,
        status: spaceStatusFilter || undefined,
      }),
    refetchInterval: 8000,
  });

  const requestsQuery = useQuery({
    queryKey: ['parkingRequests', reqStatusFilter, reqTypeFilter, activeOnly, page, rowsPerPage],
    queryFn: () =>
      parkingApi.requests({
        status: reqStatusFilter || undefined,
        type: reqTypeFilter || undefined,
        active: activeOnly ? true : undefined,
        page: page + 1,
        limit: rowsPerPage,
      }),
    refetchInterval: 6000,
  });

  const requestDetailQuery = useQuery({
    queryKey: ['parkingRequest', selectedRequestId],
    queryFn: () => parkingApi.request(selectedRequestId!),
    enabled: !!selectedRequestId,
    refetchInterval: 4000,
  });

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles', 'for-request'],
    queryFn: () => vehiclesApi.list(),
    enabled: !!createType,
  });

  const allSpaces = useMemo(() => spacesQuery.data ?? [], [spacesQuery.data]);
  const levels = useMemo(() => Array.from(new Set(allSpaces.map((s) => s.level))).sort((a, b) => a - b), [allSpaces]);
  const zones = useMemo(() => Array.from(new Set(allSpaces.map((s) => s.zone))).sort(), [allSpaces]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const base = inputMode === 'vehicle' ? { vehicleId } : { plateNumber: plateNumber.trim().toUpperCase() };
      return createType === 'PARK'
        ? parkingApi.park(targetSpaceNumber ? { ...base, targetSpaceNumber } : base)
        : parkingApi.retrieve(base);
    },
    onSuccess: (created) => {
      notify(t('requests.created', { number: created.requestNumber }), 'success');
      setCreateType(null);
      setConfirmStep(false);
      setVehicleId('');
      setPlateNumber('');
      setTargetSpaceNumber('');
      setSelectedRequestId(created.id);
      void queryClient.invalidateQueries({ queryKey: ['parkingRequests'] });
      void queryClient.invalidateQueries({ queryKey: ['parkingSpaces'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => {
      notify(errorMessage(err, t), 'error');
      setConfirmStep(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => parkingApi.cancel(id),
    onSuccess: () => {
      notify(t('requests.cancelled'), 'info');
      void queryClient.invalidateQueries({ queryKey: ['parkingRequests'] });
      void queryClient.invalidateQueries({ queryKey: ['parkingRequest', selectedRequestId] });
      void queryClient.invalidateQueries({ queryKey: ['parkingSpaces'] });
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const selectedVehicleObj = vehiclesQuery.data?.find((v) => v.id === vehicleId);
  const targetPlateLabel =
    inputMode === 'vehicle' ? (selectedVehicleObj?.plateNumber ?? '') : plateNumber.trim().toUpperCase();

  return (
    <Stack spacing={3}>
      {/* Header & Action Buttons */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
        <Typography variant="h5">{t('parking.title')}</Typography>
        <Stack direction="row" spacing={1}>
          {canCreateRequest && (
            <>
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={() => {
                  setCreateType('PARK');
                  setTargetSpaceNumber('');
                  setConfirmStep(false);
                }}
              >
                {t('parking.newPark')}
              </Button>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<CarIcon />}
                onClick={() => {
                  setCreateType('RETRIEVE');
                  setTargetSpaceNumber('');
                  setConfirmStep(false);
                }}
              >
                {t('parking.newRetrieve')}
              </Button>
            </>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              void spacesQuery.refetch();
              void requestsQuery.refetch();
            }}
          >
            {t('common.refresh')}
          </Button>
        </Stack>
      </Stack>

      {/* Parking Map Section */}
      <Paper sx={{ p: 2.5 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ md: 'center' }}
          spacing={2}
          sx={{ mb: 2 }}
        >
          <Stack direction="row" spacing={1.5} flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>{t('common.level')}</InputLabel>
              <Select
                label={t('common.level')}
                value={levelFilter}
                onChange={(e) => setLevelFilter(String(e.target.value))}
              >
                <MenuItem value="">{t('parking.allLevels')}</MenuItem>
                {levels.map((lvl) => (
                  <MenuItem key={lvl} value={String(lvl)}>
                    {t('parking.levelN', { n: lvl })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>{t('common.zone')}</InputLabel>
              <Select
                label={t('common.zone')}
                value={zoneFilter}
                onChange={(e) => setZoneFilter(String(e.target.value))}
              >
                <MenuItem value="">{t('parking.allZones')}</MenuItem>
                {zones.map((z) => (
                  <MenuItem key={z} value={z}>
                    {t('parking.zoneN', { z })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>{t('parking.statusFilter')}</InputLabel>
              <Select
                label={t('parking.statusFilter')}
                value={spaceStatusFilter}
                onChange={(e) => setSpaceStatusFilter(String(e.target.value))}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                {SPACE_STATUSES.map((st) => (
                  <MenuItem key={st} value={st}>
                    {t(`spaceStatus.${st}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {/* Status Legend */}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {SPACE_STATUSES.map((st) => (
              <SpaceStatusBadge key={st} status={st} />
            ))}
          </Stack>
        </Stack>

        {spacesQuery.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={2}>
            {['Lane 1', 'Lane 2', 'Lane 3', 'Lane 4'].map((laneName, colIdx) => {
              const stackSpaces = sortTowerSpacesTopDown(
                allSpaces.filter(
                  (s) =>
                    s.zone === laneName || (!s.zone.startsWith('Lane') && Math.floor(allSpaces.indexOf(s) / 3) === colIdx),
                ),
              );
              if (stackSpaces.length === 0) return null;
              const topNum = stackSpaces[0]?.spaceNumber ?? '';
              const bottomNum = stackSpaces[stackSpaces.length - 1]?.spaceNumber ?? '';
              return (
                <Grid key={laneName} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      bgcolor: 'background.default',
                      borderRadius: 2,
                      borderColor: 'divider',
                    }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ mb: 1.2, px: 0.5 }}
                    >
                      <Typography variant="caption" fontWeight={800} color="primary.main">
                        {`${laneName} (${topNum} ↓ ${bottomNum})`}
                      </Typography>
                      <Chip size="small" label={`P${stackSpaces.length}..P1`} variant="outlined" />
                    </Stack>
                    <Stack spacing={1.25}>
                      {stackSpaces.map((sp) => (
                        <Paper
                          key={sp.id}
                          onClick={() => setSelectedSpace(sp)}
                          sx={{
                            p: 1.5,
                            cursor: 'pointer',
                            borderLeft: `5px solid ${SPACE_BORDER_COLOR[sp.status]}`,
                            transition: 'transform 0.12s',
                            '&:hover': { transform: 'translateY(-2px)' },
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="subtitle2" fontWeight={800}>
                              {sp.spaceNumber}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              P{sp.level} · {sp.zone}
                            </Typography>
                          </Stack>
                          <Box sx={{ my: 0.75 }}>
                            <SpaceStatusBadge status={sp.status} />
                          </Box>
                          <Typography variant="caption" fontWeight={700} display="block" noWrap>
                            {sp.vehicle ? sp.vehicle.plateNumber : t('parking.emptySpace')}
                          </Typography>
                        </Paper>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Paper>

      {/* Requests Table Section */}
      <Paper sx={{ p: 2.5 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ md: 'center' }}
          spacing={2}
          sx={{ mb: 2 }}
        >
          <Typography variant="h6">{t('requests.title')}</Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>{t('common.type')}</InputLabel>
              <Select
                label={t('common.type')}
                value={reqTypeFilter}
                onChange={(e) => {
                  setReqTypeFilter(e.target.value as RequestType | '');
                  setPage(0);
                }}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                <MenuItem value="PARK">{t('requestType.PARK')}</MenuItem>
                <MenuItem value="RETRIEVE">{t('requestType.RETRIEVE')}</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>{t('common.status')}</InputLabel>
              <Select
                label={t('common.status')}
                value={reqStatusFilter}
                onChange={(e) => {
                  setReqStatusFilter(e.target.value as RequestStatus | '');
                  setPage(0);
                }}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                {REQUEST_STATUSES.map((st) => (
                  <MenuItem key={st} value={st}>
                    {t(`requestStatus.${st}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Checkbox
                  checked={activeOnly}
                  onChange={(e) => {
                    setActiveOnly(e.target.checked);
                    setPage(0);
                  }}
                />
              }
              label={t('requests.activeOnly')}
            />
          </Stack>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('requests.number')}</TableCell>
                <TableCell>{t('common.type')}</TableCell>
                <TableCell>{t('requests.plate')}</TableCell>
                <TableCell>{t('requests.space')}</TableCell>
                <TableCell>{t('requests.user')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('requests.progress')}</TableCell>
                <TableCell>{t('common.createdAt')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!requestsQuery.data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                requestsQuery.data.items.map((req) => (
                  <TableRow
                    key={req.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelectedRequestId(req.id)}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{req.requestNumber}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={req.requestType === 'PARK' ? 'primary' : 'secondary'}
                        label={t(`requestType.${req.requestType}`)}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{req.vehicle.plateNumber}</TableCell>
                    <TableCell>{req.parkingSpace?.spaceNumber ?? t('common.none')}</TableCell>
                    <TableCell>{req.user.fullName}</TableCell>
                    <TableCell>
                      <RequestStatusBadge status={req.status} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 110 }}>
                      {req.command ? (
                        <Stack spacing={0.5}>
                          <LinearProgress variant="determinate" value={req.command.progress} />
                          <Typography variant="caption" color="text.secondary">
                            {req.command.progress}%
                          </Typography>
                        </Stack>
                      ) : (
                        t('common.none')
                      )}
                    </TableCell>
                    <TableCell>{new Date(req.createdAt).toLocaleString()}</TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Button size="small" onClick={() => setSelectedRequestId(req.id)}>
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
          count={requestsQuery.data?.total ?? 0}
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

      {/* Space Details Dialog */}
      <Dialog open={!!selectedSpace} onClose={() => setSelectedSpace(null)} maxWidth="xs" fullWidth>
        {selectedSpace && (
          <>
            <DialogTitle>
              {t('parking.spaceDetails')} — {selectedSpace.spaceNumber}
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">{t('common.status')}:</Typography>
                  <SpaceStatusBadge status={selectedSpace.status} />
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">{t('common.level')}:</Typography>
                  <Typography fontWeight={700}>{selectedSpace.level}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">{t('common.zone')}:</Typography>
                  <Typography fontWeight={700}>{selectedSpace.zone}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">{t('parking.vehicle')}:</Typography>
                  <Typography fontWeight={700}>
                    {selectedSpace.vehicle ? selectedSpace.vehicle.plateNumber : t('parking.emptySpace')}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">{t('common.updatedAt')}:</Typography>
                  <Typography variant="body2">{new Date(selectedSpace.updatedAt).toLocaleString()}</Typography>
                </Stack>
              </Stack>
            </DialogContent>
            <DialogActions>
              {selectedSpace.status === 'AVAILABLE' && canCreateRequest && (
                <Button
                  color="success"
                  variant="contained"
                  disabled={createMutation.isPending}
                  onClick={async () => {
                    const target = selectedSpace.spaceNumber;
                    setSelectedSpace(null);
                    try {
                      await parkingApi.park({ targetSpaceNumber: target });
                      notify(`${t('parking.newPark')} (${target})`, 'success');
                      queryClient.invalidateQueries({ queryKey: ['parkingSpaces'] });
                      queryClient.invalidateQueries({ queryKey: ['parkingRequests'] });
                    } catch (err) {
                      notify(errorMessage(err, t), 'error');
                    }
                  }}
                >
                  {t('parking.newPark')} ({selectedSpace.spaceNumber})
                </Button>
              )}
              {(selectedSpace.status === 'OCCUPIED' || selectedSpace.vehicle) && canCreateRequest && (
                <Button
                  color="secondary"
                  variant="contained"
                  disabled={createMutation.isPending}
                  onClick={async () => {
                    const target = selectedSpace.spaceNumber;
                    const plate = selectedSpace.vehicle?.plateNumber;
                    setSelectedSpace(null);
                    try {
                      await parkingApi.retrieve(plate ? { plateNumber: plate, targetSpaceNumber: target } : { targetSpaceNumber: target });
                      notify(`${t('parking.newRetrieve')} (${target})`, 'success');
                      queryClient.invalidateQueries({ queryKey: ['parkingSpaces'] });
                      queryClient.invalidateQueries({ queryKey: ['parkingRequests'] });
                    } catch (err) {
                      notify(errorMessage(err, t), 'error');
                    }
                  }}
                >
                  {t('parking.newRetrieve')} ({selectedSpace.spaceNumber})
                </Button>
              )}
              <Button onClick={() => setSelectedSpace(null)}>{t('common.close')}</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* New Park / Retrieve Request Modal */}
      <Dialog
        open={!!createType}
        onClose={() => {
          setCreateType(null);
          setConfirmStep(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        {createType && (
          <>
            <DialogTitle>
              {confirmStep
                ? t('requests.confirmTitle', { type: t(`requestType.${createType}`) })
                : t('requests.createTitle', { type: t(`requestType.${createType}`) })}
            </DialogTitle>
            <DialogContent dividers>
              {!confirmStep ? (
                <Stack spacing={2.5}>
                  {can('parking.request.any') && (
                    <RadioGroup
                      row
                      value={inputMode}
                      onChange={(e) => setInputMode(e.target.value as 'vehicle' | 'plate')}
                    >
                      <FormControlLabel value="vehicle" control={<Radio />} label={t('requests.byVehicle')} />
                      <FormControlLabel value="plate" control={<Radio />} label={t('requests.byPlate')} />
                    </RadioGroup>
                  )}

                  {inputMode === 'vehicle' ? (
                    <FormControl fullWidth>
                      <InputLabel>{t('requests.selectVehicle')}</InputLabel>
                      <Select
                        label={t('requests.selectVehicle')}
                        value={vehicleId}
                        onChange={(e) => setVehicleId(String(e.target.value))}
                      >
                        {(vehiclesQuery.data ?? [])
                          .filter((v) => (createType === 'PARK' ? !v.parked : v.parked))
                          .map((v) => (
                            <MenuItem key={v.id} value={v.id}>
                              {v.plateNumber} — {v.brand ?? ''} {v.model ?? ''}
                            </MenuItem>
                          ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <TextField
                      label={t('requests.plateNumber')}
                      value={plateNumber}
                      onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                      fullWidth
                      required
                    />
                  )}
                </Stack>
              ) : (
                <Alert severity="warning" icon={<ParkIcon />}>
                  {t('requests.confirmBody', {
                    type: t(`requestType.${createType}`),
                    plate: targetPlateLabel,
                  })}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  if (confirmStep) setConfirmStep(false);
                  else setCreateType(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              {!confirmStep ? (
                <Button
                  variant="contained"
                  disabled={inputMode === 'vehicle' ? !vehicleId : !plateNumber.trim()}
                  onClick={() => setConfirmStep(true)}
                >
                  {t('common.confirm')}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  color={createType === 'PARK' ? 'primary' : 'secondary'}
                  disabled={createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {t('common.confirm')}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Request Detail Drawer */}
      <Drawer
        anchor="right"
        open={!!selectedRequestId}
        onClose={() => setSelectedRequestId(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 3 } }}
      >
        {requestDetailQuery.data ? (
          <Stack spacing={2.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="h6" fontFamily="monospace">
                  {requestDetailQuery.data.requestNumber}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t(`requestType.${requestDetailQuery.data.requestType}`)} ·{' '}
                  {t(`requestSource.${requestDetailQuery.data.source}`)}
                </Typography>
              </Box>
              <RequestStatusBadge status={requestDetailQuery.data.status} />
            </Stack>

            <Divider />

            <Stack spacing={1}>
              <Typography variant="body2">
                <strong>{t('requests.plate')}:</strong> {requestDetailQuery.data.vehicle.plateNumber}
              </Typography>
              <Typography variant="body2">
                <strong>{t('requests.space')}:</strong>{' '}
                {requestDetailQuery.data.parkingSpace?.spaceNumber ?? t('common.none')}
              </Typography>
              <Typography variant="body2">
                <strong>{t('requests.user')}:</strong> {requestDetailQuery.data.user.fullName}
              </Typography>
              <Typography variant="body2">
                <strong>{t('common.createdAt')}:</strong>{' '}
                {new Date(requestDetailQuery.data.createdAt).toLocaleString()}
              </Typography>
              {requestDetailQuery.data.completedAt && (
                <Typography variant="body2">
                  <strong>{t('requests.completedAt')}:</strong>{' '}
                  {new Date(requestDetailQuery.data.completedAt).toLocaleString()}
                </Typography>
              )}
            </Stack>

            {requestDetailQuery.data.errorMessage && (
              <Alert severity="error">{requestDetailQuery.data.errorMessage}</Alert>
            )}

            <Divider />

            <Typography variant="subtitle2" fontWeight={700}>
              {t('requests.timeline')}
            </Typography>
            <RequestTimeline request={requestDetailQuery.data} />

            <Divider />

            <Typography variant="subtitle2" fontWeight={700}>
              {t('requests.command')}
            </Typography>
            {requestDetailQuery.data.command ? (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontFamily="monospace" fontWeight={700}>
                      {requestDetailQuery.data.command.commandId}
                    </Typography>
                    <CommandStatusBadge status={requestDetailQuery.data.command.status} />
                  </Stack>
                  <LinearProgress variant="determinate" value={requestDetailQuery.data.command.progress} />
                  <Typography variant="caption" color="text.secondary">
                    {t('requests.progress')}: {requestDetailQuery.data.command.progress}%{' '}
                    {requestDetailQuery.data.command.phase ? `(${requestDetailQuery.data.command.phase})` : ''}
                  </Typography>
                </Stack>
              </Paper>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('requests.noCommand')}
              </Typography>
            )}

            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              {canCancelParkingRequest(requestDetailQuery.data) && (
                <Button
                  color="error"
                  variant="outlined"
                  startIcon={<CancelIcon />}
                  disabled={cancelMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        t('requests.cancelConfirm', { number: requestDetailQuery.data!.requestNumber }),
                      )
                    ) {
                      cancelMutation.mutate(requestDetailQuery.data!.id);
                    }
                  }}
                >
                  {t('requests.cancel')}
                </Button>
              )}
              <Button variant="contained" onClick={() => setSelectedRequestId(null)}>
                {t('common.close')}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}
      </Drawer>
    </Stack>
  );
};

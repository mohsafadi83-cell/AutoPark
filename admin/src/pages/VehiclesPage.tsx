import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  History as HistoryIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { vehiclesApi, type VehicleInput } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { RequestStatusBadge } from '../components/StatusBadges';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { Vehicle } from '../types/api';

export const VehiclesPage: React.FC = () => {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleInput>({
    plateNumber: '',
    vehicleType: '',
    brand: '',
    model: '',
    color: '',
    userId: '',
  });
  const [historyVehicle, setHistoryVehicle] = useState<Vehicle | null>(null);

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles', search],
    queryFn: () => vehiclesApi.list({ q: search || undefined }),
  });

  const historyQuery = useQuery({
    queryKey: ['vehicleHistory', historyVehicle?.id],
    queryFn: () => vehiclesApi.history(historyVehicle!.id),
    enabled: !!historyVehicle,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: VehicleInput = {
        plateNumber: form.plateNumber?.trim().toUpperCase(),
        vehicleType: form.vehicleType?.trim() || null,
        brand: form.brand?.trim() || null,
        model: form.model?.trim() || null,
        color: form.color?.trim() || null,
        userId: can('vehicles.manage.any') && form.userId?.trim() ? form.userId.trim() : undefined,
      };
      if (editing) {
        return vehiclesApi.update(editing.id, payload);
      }
      return vehiclesApi.create(payload);
    },
    onSuccess: () => {
      notify(t('common.saved'), 'success');
      setModalOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vehiclesApi.remove(id),
    onSuccess: () => {
      notify(t('vehicles.deleted'), 'info');
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ plateNumber: '', vehicleType: 'SEDAN', brand: '', model: '', color: '', userId: '' });
    setModalOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm({
      plateNumber: v.plateNumber,
      vehicleType: v.vehicleType ?? '',
      brand: v.brand ?? '',
      model: v.model ?? '',
      color: v.color ?? '',
      userId: v.userId,
    });
    setModalOpen(true);
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
        <Typography variant="h5">{t('vehicles.title')}</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            {t('vehicles.add')}
          </Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void vehiclesQuery.refetch()}>
            {t('common.refresh')}
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ p: 2.5 }}>
        <Box sx={{ mb: 2, maxWidth: 360 }}>
          <TextField
            size="small"
            fullWidth
            placeholder={t('vehicles.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('vehicles.plate')}</TableCell>
                <TableCell>{t('vehicles.owner')}</TableCell>
                <TableCell>{t('vehicles.type')}</TableCell>
                <TableCell>{t('vehicles.brand')}</TableCell>
                <TableCell>{t('vehicles.model')}</TableCell>
                <TableCell>{t('vehicles.color')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('vehicles.location')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {vehiclesQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : !vehiclesQuery.data?.length ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                vehiclesQuery.data.map((v) => (
                  <TableRow key={v.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{v.plateNumber}</TableCell>
                    <TableCell>{v.ownerName ?? v.userId}</TableCell>
                    <TableCell>{v.vehicleType ?? t('common.none')}</TableCell>
                    <TableCell>{v.brand ?? t('common.none')}</TableCell>
                    <TableCell>{v.model ?? t('common.none')}</TableCell>
                    <TableCell>{v.color ?? t('common.none')}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={v.parked ? 'primary' : 'default'}
                        label={v.parked ? t('vehicles.parked') : t('vehicles.notParked')}
                      />
                    </TableCell>
                    <TableCell>
                      {v.parkingSpace ? `${v.parkingSpace.spaceNumber} (L${v.parkingSpace.level})` : t('common.none')}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={t('vehicles.history')}>
                        <IconButton size="small" onClick={() => setHistoryVehicle(v)}>
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common.edit')}>
                        <IconButton size="small" onClick={() => openEdit(v)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common.delete')}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={v.parked}
                            onClick={() => {
                              if (window.confirm(t('vehicles.deleteConfirm', { plate: v.plateNumber }))) {
                                deleteMutation.mutate(v.id);
                              }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Add / Edit Vehicle Modal */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t('vehicles.editTitle') : t('vehicles.addTitle')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label={t('vehicles.plate')}
              value={form.plateNumber ?? ''}
              onChange={(e) => setForm({ ...form, plateNumber: e.target.value.toUpperCase() })}
              required
              fullWidth
            />
            <TextField
              label={t('vehicles.type')}
              value={form.vehicleType ?? ''}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={t('vehicles.brand')}
                value={form.brand ?? ''}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                fullWidth
              />
              <TextField
                label={t('vehicles.model')}
                value={form.model ?? ''}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              label={t('vehicles.color')}
              value={form.color ?? ''}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              fullWidth
            />
            {can('vehicles.manage.any') && !editing && (
              <TextField
                label={`${t('vehicles.owner')} ID`}
                helperText={t('vehicles.ownerHelp')}
                value={form.userId ?? ''}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
                fullWidth
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            disabled={!form.plateNumber?.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Vehicle History Drawer */}
      <Drawer
        anchor="right"
        open={!!historyVehicle}
        onClose={() => setHistoryVehicle(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 440 }, p: 3 } }}
      >
        {historyVehicle && (
          <Stack spacing={2}>
            <Typography variant="h6">
              {t('vehicles.history')} — {historyVehicle.plateNumber}
            </Typography>
            <Divider />
            {historyQuery.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : !historyQuery.data?.length ? (
              <Typography color="text.secondary">{t('vehicles.noHistory')}</Typography>
            ) : (
              <Stack spacing={1.5}>
                {historyQuery.data.map((req) => (
                  <Paper key={req.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" fontWeight={700} fontFamily="monospace">
                        {req.requestNumber}
                      </Typography>
                      <RequestStatusBadge status={req.status} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                      {t(`requestType.${req.requestType}`)} · {req.parkingSpace?.spaceNumber ?? t('common.none')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(req.createdAt).toLocaleString()}
                    </Typography>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
};

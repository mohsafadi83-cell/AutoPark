import {
  Add as AddIcon,
  Block as RevokeIcon,
  CheckCircle as ActivateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  PhonelinkLock as DevicesIcon,
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
  FormControl,
  FormControlLabel,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  devicesApi,
  usersApi,
  type AuthorizedDevice,
  type DevicePayload,
} from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { useToast } from '../context/ToastContext';

interface FormState {
  employeeName: string;
  username: string;
  macAddress: string;
  deviceId: string;
  deviceModel: string;
  canControl: boolean;
}

const EMPTY_FORM: FormState = {
  employeeName: '',
  username: '',
  macAddress: '',
  deviceId: '',
  deviceModel: '',
  canControl: true,
};

export const DevicesPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const qc = useQueryClient();
  const { notify } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AuthorizedDevice | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const devicesQ = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  const usersQ = useQuery({
    queryKey: ['users-for-devices'],
    queryFn: () => usersApi.list({ limit: 100 }),
  });

  const employeeUsers = (usersQ.data?.items ?? []).filter((u) => u.role !== 'CUSTOMER');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['devices'] });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: DevicePayload = {
        employeeName: form.employeeName.trim(),
        username: form.username.trim(),
        macAddress: form.macAddress.trim().toUpperCase(),
        deviceId: form.deviceId.trim().toUpperCase(),
        deviceModel: form.deviceModel.trim(),
        canControl: form.canControl,
      };
      if (editing) {
        return devicesApi.update(editing.id, payload);
      }
      return devicesApi.register(payload);
    },
    onSuccess: () => {
      notify(
        editing
          ? isAr
            ? 'تم تعديل عنوان الـ MAC وبيانات الجهاز بنجاح'
            : 'Device MAC & details updated successfully'
          : isAr
            ? 'تم تسجيل وتصريح الجهاز بنجاح'
            : 'Device authorized successfully',
        'success',
      );
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const policyMut = useMutation({
    mutationFn: (enforce: boolean) => devicesApi.updatePolicy(enforce),
    onSuccess: (res) => {
      notify(
        res.enforceWhitelist
          ? isAr
            ? 'تم تفعيل التقييد الصارم بالـ MAC للموظفين فقط'
            : 'Strict MAC whitelist enabled'
          : isAr
            ? 'تم تعطيل التقييد الصارم (الأجهزة الملغاة تبقى محظورة)'
            : 'Strict MAC whitelist relaxed',
        'success',
      );
      invalidate();
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const revokeMut = useMutation({
    mutationFn: (d: AuthorizedDevice) =>
      devicesApi.revoke(
        d.id,
        isAr ? 'إلغاء صلاحية التحكم بالجهاز' : 'Device access revoked by administrator',
        false,
      ),
    onSuccess: () => {
      notify(isAr ? 'تم إلغاء صلاحية الجهاز فوراً' : 'Device access revoked', 'success');
      invalidate();
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => devicesApi.activate(id),
    onSuccess: () => {
      notify(isAr ? 'تم تفعيل الجهاز بنجاح' : 'Device re-activated', 'success');
      invalidate();
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => devicesApi.remove(id),
    onSuccess: () => {
      notify(isAr ? 'تم حذف سجل الجهاز' : 'Device deleted', 'success');
      invalidate();
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (d: AuthorizedDevice) => {
    setEditing(d);
    setForm({
      employeeName: d.employeeName ?? '',
      username: d.username ?? '',
      macAddress: d.macAddress ?? '',
      deviceId: d.deviceId ?? '',
      deviceModel: d.deviceModel ?? '',
      canControl: d.canControl,
    });
    setDialogOpen(true);
  };

  const items = devicesQ.data?.items ?? [];
  const enforceWhitelist = devicesQ.data?.enforceWhitelist ?? true;

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5}>
        <Stack direction="row" spacing={1.2} alignItems="center">
          <DevicesIcon color="primary" fontSize="large" />
          <Box>
            <Typography variant="h5" fontWeight={800}>
              {isAr ? 'إدارة أجهزة الموظفين (MAC Address)' : 'Authorized Employee MAC Devices'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isAr
                ? 'إضافة وتعديل عناوين MAC Address وبيانات هواتف الموظفين المصرّح لهم بالدخول والتحكم بالمواقف.'
                : 'Add, edit, revoke, and manage employee phone MAC addresses authorized to sign in and control parking.'}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => devicesQ.refetch()}
            disabled={devicesQ.isFetching}
          >
            {isAr ? 'تحديث' : 'Refresh'}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            {isAr ? 'إضافة جهاز MAC' : 'Add MAC Device'}
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={enforceWhitelist}
              onChange={(e) => policyMut.mutate(e.target.checked)}
              disabled={policyMut.isPending}
            />
          }
          label={
            <Typography fontWeight={700}>
              {isAr
                ? 'تقييد الدخول من الموبايل للهواتف المسجّلة والمطابقة لعنوان MAC في قاعدة البيانات فقط'
                : 'Strict Whitelist: Allow mobile login ONLY for phones whose MAC matches the database'}
            </Typography>
          }
        />
      </Paper>

      {devicesQ.isError && (
        <Alert severity="error">{errorMessage(devicesQ.error, t)}</Alert>
      )}

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{isAr ? 'اسم الموظف' : 'Employee Name'}</TableCell>
                <TableCell>{isAr ? 'الحساب' : 'Username'}</TableCell>
                <TableCell>MAC Address</TableCell>
                <TableCell>{isAr ? 'معرّف الجهاز' : 'Device ID'}</TableCell>
                <TableCell>{isAr ? 'نوع الهاتف' : 'Phone Model'}</TableCell>
                <TableCell>{isAr ? 'التحكم' : 'Control'}</TableCell>
                <TableCell>{isAr ? 'الحالة' : 'Status'}</TableCell>
                <TableCell align="center">{isAr ? 'الإجراءات' : 'Actions'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {devicesQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {isAr ? 'لا توجد أجهزة مسجّلة بعد' : 'No authorized devices registered yet'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{d.employeeName}</TableCell>
                    <TableCell>{d.username || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, direction: 'ltr' }}>
                      {d.macAddress || '—'}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', direction: 'ltr' }}>
                      {d.deviceId || '—'}
                    </TableCell>
                    <TableCell>{d.deviceModel || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={d.canControl ? (isAr ? 'مسموح' : 'Allowed') : isAr ? 'ممنوع' : 'Blocked'}
                        color={d.canControl ? 'info' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={
                          d.status === 'ACTIVE'
                            ? isAr
                              ? 'مفعّل'
                              : 'ACTIVE'
                            : isAr
                              ? 'ملغى'
                              : 'REVOKED'
                        }
                        color={d.status === 'ACTIVE' ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title={isAr ? 'تعديل الـ MAC والمعلومات' : 'Edit MAC & Details'}>
                          <IconButton size="small" color="primary" onClick={() => openEdit(d)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {d.status === 'ACTIVE' ? (
                          <Tooltip title={isAr ? 'إلغاء صلاحية الجهاز' : 'Revoke Access'}>
                            <IconButton size="small" color="warning" onClick={() => revokeMut.mutate(d)}>
                              <RevokeIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title={isAr ? 'إعادة التفعيل' : 'Activate'}>
                            <IconButton size="small" color="success" onClick={() => activateMut.mutate(d.id)}>
                              <ActivateIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title={isAr ? 'حذف' : 'Delete'}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => {
                              if (
                                window.confirm(
                                  isAr
                                    ? `هل تريد حذف جهاز الموظف (${d.employeeName}) نهائياً؟`
                                    : `Permanently delete device for ${d.employeeName}?`,
                                )
                              ) {
                                deleteMut.mutate(d.id);
                              }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {editing
            ? isAr
              ? 'تعديل عنوان MAC ومعلومات الجهاز'
              : 'Edit Device MAC & Details'
            : isAr
              ? 'إضافة جهاز موظف جديد (MAC Address)'
              : 'Authorize New Employee MAC Device'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={isAr ? 'اسم الموظف الكامل' : 'Employee Full Name'}
              value={form.employeeName}
              onChange={(e) => setForm({ ...form, employeeName: e.target.value })}
              required
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>{isAr ? 'حساب الموظف (اختياري للربط)' : 'Linked Employee Username'}</InputLabel>
              <Select
                value={form.username}
                label={isAr ? 'حساب الموظف (اختياري للربط)' : 'Linked Employee Username'}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              >
                <MenuItem value="">{isAr ? '— بدون تقييد بحساب محدد —' : '— Any employee account —'}</MenuItem>
                {employeeUsers.map((u) => (
                  <MenuItem key={u.id} value={u.username}>
                    {u.username} — {u.fullName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={isAr ? 'عنوان MAC Address (مثال AA:BB:CC:DD:EE:FF)' : 'MAC Address (e.g. AA:BB:CC:DD:EE:FF)'}
              value={form.macAddress}
              onChange={(e) => setForm({ ...form, macAddress: e.target.value.toUpperCase() })}
              inputProps={{ dir: 'ltr', style: { fontFamily: 'monospace' } }}
              fullWidth
            />
            <TextField
              label={isAr ? 'معرّف الجهاز Device ID (اختياري)' : 'Mobile Device ID (Optional)'}
              value={form.deviceId}
              onChange={(e) => setForm({ ...form, deviceId: e.target.value.toUpperCase() })}
              inputProps={{ dir: 'ltr', style: { fontFamily: 'monospace' } }}
              fullWidth
            />
            <TextField
              label={isAr ? 'نوع الهاتف (Samsung / iPhone)' : 'Phone Model (Samsung / iPhone)'}
              value={form.deviceModel}
              onChange={(e) => setForm({ ...form, deviceModel: e.target.value })}
              fullWidth
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.canControl}
                  onChange={(e) => setForm({ ...form, canControl: e.target.checked })}
                />
              }
              label={
                isAr
                  ? 'السماح بالتحكم عن بُعد وتحريك المواقف من هذا الجهاز'
                  : 'Allow remote parking control from this device'
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
          <Button
            variant="contained"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !form.employeeName.trim() || (!form.macAddress.trim() && !form.deviceId.trim())}
          >
            {editing ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : isAr ? 'تصريح الجهاز' : 'Authorize Device'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

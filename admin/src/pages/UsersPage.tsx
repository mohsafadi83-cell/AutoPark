import {
  Add as AddIcon,
  Block as DisableIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Edit as EditIcon,
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
  FormControl,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usersApi, type UserCreateInput, type UserUpdateInput } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PERMISSIONS, ROLES, type Role, type User, type UserStatus } from '../types/api';

export const UsersPage: React.FC = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('OPERATOR');
  const [status, setStatus] = useState<UserStatus>('ACTIVE');
  const [password, setPassword] = useState('');

  const usersQuery = useQuery({
    queryKey: ['users', search, roleFilter, statusFilter, page, rowsPerPage],
    queryFn: () =>
      usersApi.list({
        q: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        page: page + 1,
        limit: rowsPerPage,
      }),
    enabled: tab === 'users',
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => usersApi.roles(),
    enabled: tab === 'roles',
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const body: UserUpdateInput = {
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          role,
          status,
          password: password ? password : undefined,
        };
        return usersApi.update(editing.id, body);
      }
      const body: UserCreateInput = {
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        role,
      };
      return usersApi.create(body);
    },
    onSuccess: () => {
      notify(t('common.saved'), 'success');
      setModalOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => usersApi.disable(id),
    onSuccess: () => {
      notify(t('users.disabled'), 'info');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const openAdd = () => {
    setEditing(null);
    setFullName('');
    setUsername('');
    setEmail('');
    setPhone('');
    setRole('OPERATOR');
    setStatus('ACTIVE');
    setPassword('');
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setFullName(u.fullName);
    setUsername(u.username);
    setEmail(u.email);
    setPhone(u.phone ?? '');
    setRole(u.role);
    setStatus(u.status);
    setPassword('');
    setModalOpen(true);
  };

  const availableRoles = ROLES.filter(
    (r) => r !== 'SUPER_ADMIN' || currentUser?.role === 'SUPER_ADMIN',
  );

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
        <Typography variant="h5">{tab === 'users' ? t('users.title') : t('rolesPage.title')}</Typography>
        <Stack direction="row" spacing={1}>
          {tab === 'users' && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
              {t('users.add')}
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => void (tab === 'users' ? usersQuery.refetch() : rolesQuery.refetch())}
          >
            {t('common.refresh')}
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ px: 2 }}>
        <Tabs value={tab} onChange={(_e, v: 'users' | 'roles') => setTab(v)}>
          <Tab value="users" label={t('nav.users')} />
          <Tab value="roles" label={t('nav.roles')} />
        </Tabs>
      </Paper>

      {tab === 'users' ? (
        <Paper sx={{ p: 2.5 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
            <TextField
              size="small"
              placeholder={t('users.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 260 }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{t('users.role')}</InputLabel>
              <Select
                label={t('users.role')}
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as Role | '');
                  setPage(0);
                }}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                {ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {t(`roles.${r}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>{t('users.status')}</InputLabel>
              <Select
                label={t('users.status')}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as UserStatus | '');
                  setPage(0);
                }}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                <MenuItem value="ACTIVE">{t('userStatus.ACTIVE')}</MenuItem>
                <MenuItem value="DISABLED">{t('userStatus.DISABLED')}</MenuItem>
                <MenuItem value="LOCKED">{t('userStatus.LOCKED')}</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('users.fullName')}</TableCell>
                  <TableCell>{t('users.username')}</TableCell>
                  <TableCell>{t('users.email')}</TableCell>
                  <TableCell>{t('users.role')}</TableCell>
                  <TableCell>{t('users.status')}</TableCell>
                  <TableCell>{t('users.lastLogin')}</TableCell>
                  <TableCell align="right">{t('common.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {usersQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : !usersQuery.data?.items.length ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      {t('common.noData')}
                    </TableCell>
                  </TableRow>
                ) : (
                  usersQuery.data.items.map((u) => (
                    <TableRow key={u.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>{u.fullName}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{u.username}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={t(`roles.${u.role}`)} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={u.status === 'ACTIVE' ? 'success' : u.status === 'LOCKED' ? 'warning' : 'default'}
                          label={t(`userStatus.${u.status}`)}
                        />
                      </TableCell>
                      <TableCell>
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : t('common.never')}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={t('common.edit')}>
                          <IconButton size="small" onClick={() => openEdit(u)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {u.id !== currentUser?.id && u.status !== 'DISABLED' && (
                          <Tooltip title={t('users.disable')}>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                if (window.confirm(t('users.disableConfirm', { name: u.fullName }))) {
                                  disableMutation.mutate(u.id);
                                }
                              }}
                            >
                              <DisableIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
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
            count={usersQuery.data?.total ?? 0}
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
      ) : (
        /* Roles & Permissions Matrix */
        <Paper sx={{ p: 2.5 }}>
          {rolesQuery.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('rolesPage.permission')}</TableCell>
                    {(rolesQuery.data ?? []).map((r) => (
                      <TableCell key={r.name} align="center">
                        {t(`roles.${r.name}`)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {PERMISSIONS.map((perm) => (
                    <TableRow key={perm} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {t(`permissions.${perm}`)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                          {perm}
                        </Typography>
                      </TableCell>
                      {(rolesQuery.data ?? []).map((r) => {
                        const granted = r.permissions.includes(perm);
                        return (
                          <TableCell key={r.name} align="center">
                            {granted ? (
                              <CheckIcon color="success" fontSize="small" />
                            ) : (
                              <CloseIcon color="disabled" fontSize="small" />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Create / Edit User Dialog */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t('users.editTitle') : t('users.addTitle')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label={t('users.fullName')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              fullWidth
            />
            {!editing && (
              <TextField
                label={t('users.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                fullWidth
              />
            )}
            <TextField
              label={t('users.email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label={t('users.phone')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>{t('users.role')}</InputLabel>
              <Select label={t('users.role')} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {availableRoles.map((r) => (
                  <MenuItem key={r} value={r}>
                    {t(`roles.${r}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {editing && (
              <FormControl fullWidth>
                <InputLabel>{t('users.status')}</InputLabel>
                <Select
                  label={t('users.status')}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as UserStatus)}
                >
                  <MenuItem value="ACTIVE">{t('userStatus.ACTIVE')}</MenuItem>
                  <MenuItem value="DISABLED">{t('userStatus.DISABLED')}</MenuItem>
                  <MenuItem value="LOCKED">{t('userStatus.LOCKED')}</MenuItem>
                </Select>
              </FormControl>
            )}
            <TextField
              label={editing ? t('users.newPassword') : t('users.password')}
              type="password"
              helperText={t('users.passwordHint')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!editing}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            disabled={
              !fullName.trim() ||
              !email.trim() ||
              (!editing && (!username.trim() || !password)) ||
              saveMutation.isPending
            }
            onClick={() => saveMutation.mutate()}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

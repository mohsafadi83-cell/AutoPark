import {
  Button,
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
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import type { Language, Preferences } from '../types/api';

export const ProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { user, setUser, logout } = useAuth();
  const { setLanguage } = useAppTheme();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [lang, setLang] = useState<Language>(user?.language ?? 'en');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const prefsQuery = useQuery({
    queryKey: ['preferences'],
    queryFn: () => authApi.preferences(),
  });

  const [prefs, setPrefs] = useState<Preferences>({
    language: user?.language ?? 'en',
    notifyParking: true,
    notifyAlarms: true,
    notifyMaintenance: true,
  });

  useEffect(() => {
    if (prefsQuery.data) {
      setPrefs(prefsQuery.data);
    }
  }, [prefsQuery.data]);

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      authApi.updateMe({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        language: lang,
      }),
    onSuccess: (updated) => {
      setUser(updated);
      setLanguage(updated.language);
      notify(t('common.saved'), 'success');
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      notify(t('profile.passwordChanged'), 'success');
      void logout();
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const updatePrefsMutation = useMutation({
    mutationFn: (body: Partial<Preferences>) => authApi.updatePreferences(body),
    onSuccess: (updated) => {
      setPrefs(updated);
      void queryClient.invalidateQueries({ queryKey: ['preferences'] });
      notify(t('common.saved'), 'success');
    },
    onError: (err) => notify(errorMessage(err, t), 'error'),
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify(t('profile.passwordMismatch'), 'error');
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      notify(t('profile.passwordWeak'), 'error');
      return;
    }
    changePasswordMutation.mutate();
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h5">{t('profile.title')}</Typography>

      <Grid container spacing={3}>
        {/* Personal Info */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              {t('profile.info')}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={2}>
              <TextField
                label={t('users.fullName')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                fullWidth
              />
              <TextField
                label={t('users.email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
              />
              <TextField
                label={t('users.phone')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>{t('common.language')}</InputLabel>
                <Select
                  label={t('common.language')}
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Language)}
                >
                  <MenuItem value="en">English</MenuItem>
                  <MenuItem value="ar">العربية</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="contained"
                disabled={updateProfileMutation.isPending}
                onClick={() => updateProfileMutation.mutate()}
              >
                {t('common.save')}
              </Button>
            </Stack>
          </Paper>
        </Grid>

        {/* Change Password & Preferences */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={3}>
            <Paper sx={{ p: 3 }} component="form" onSubmit={handlePasswordSubmit}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                {t('profile.changePassword')}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <TextField
                  label={t('profile.currentPassword')}
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  fullWidth
                />
                <TextField
                  label={t('profile.newPassword')}
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  fullWidth
                />
                <TextField
                  label={t('profile.confirmPassword')}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  fullWidth
                />
                <Button type="submit" variant="contained" color="warning" disabled={changePasswordMutation.isPending}>
                  {t('profile.changePassword')}
                </Button>
              </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                {t('profile.preferences')}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={prefs.notifyParking}
                      onChange={(e) => updatePrefsMutation.mutate({ notifyParking: e.target.checked })}
                    />
                  }
                  label={t('profile.notifyParking')}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={prefs.notifyAlarms}
                      onChange={(e) => updatePrefsMutation.mutate({ notifyAlarms: e.target.checked })}
                    />
                  }
                  label={t('profile.notifyAlarms')}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={prefs.notifyMaintenance}
                      onChange={(e) => updatePrefsMutation.mutate({ notifyMaintenance: e.target.checked })}
                    />
                  }
                  label={t('profile.notifyMaintenance')}
                />
              </Stack>
            </Paper>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
};

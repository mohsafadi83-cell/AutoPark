import {
  Brightness4 as DarkIcon,
  Brightness7 as LightIcon,
  Translate as TranslateIcon,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { systemApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { getFirstAccessibleRoute, useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';

const DEMO_USERS: Array<{ username: string; password: string; role: string }> = [
  { username: 'superadmin', password: 'Admin@12345', role: 'SUPER_ADMIN' },
  { username: 'admin', password: 'Admin@12345', role: 'SYSTEM_ADMIN' },
  { username: 'operator', password: 'Operator@123', role: 'OPERATOR' },
  { username: 'attendant', password: 'Operator@123', role: 'PARKING_ATTENDANT' },
  { username: 'engineer', password: 'Engineer@123', role: 'MAINTENANCE_ENGINEER' },
  { username: 'viewer', password: 'Viewer@1234', role: 'READ_ONLY' },
];

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, user, login } = useAuth();
  const { mode, toggleTheme, language, toggleLanguage } = useAppTheme();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => systemApi.health(),
    retry: 1,
  });

  if (isAuthenticated && user) {
    const dest = getFirstAccessibleRoute(user) ?? '/dashboard';
    return <Navigate to={dest} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(t('errors.required'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const loggedIn = await login(username.trim(), password);
      const dest = getFirstAccessibleRoute(loggedIn) ?? '/dashboard';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const isSimulation = !healthQuery.data || healthQuery.data.mode === 'SIMULATION';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ position: 'fixed', top: 16, right: 16 }}>
        <Button size="small" variant="outlined" startIcon={<TranslateIcon />} onClick={toggleLanguage}>
          {language === 'en' ? 'العربية' : 'English'}
        </Button>
        <IconButton onClick={toggleTheme}>
          {mode === 'dark' ? <LightIcon /> : <DarkIcon />}
        </IconButton>
      </Stack>

      <Paper sx={{ p: 4, width: '100%', maxWidth: 440 }}>
        <Stack spacing={2.5} component="form" onSubmit={handleSubmit}>
          <Stack direction="column" spacing={1.2} alignItems="center" justifyContent="center">
            <Box
              sx={{
                bgcolor: '#ffffff',
                borderRadius: 2.5,
                px: 2,
                py: 1.5,
                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Box
                component="img"
                src="/techno_logo.png"
                alt="TECHNO Electrical.Jo"
                sx={{ height: 84, width: 'auto', display: 'block' }}
              />
            </Box>
            <Box textAlign="center">
              <Typography variant="h6" fontWeight={800}>
                TECHNO Electrical.Jo
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {t('app.name')} — {t('app.subtitle')}
              </Typography>
            </Box>
          </Stack>

          <Typography variant="subtitle1" textAlign="center" fontWeight={600}>
            {t('auth.title')}
          </Typography>

          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={t('auth.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            fullWidth
          />

          <TextField
            label={t('auth.password')}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={t('auth.showPassword')}
                    onClick={() => setShowPassword((s) => !s)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
            {submitting ? t('auth.loggingIn') : t('auth.login')}
          </Button>

          {isSimulation && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  {t('auth.demoAccounts')}
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {DEMO_USERS.map((d) => (
                    <Chip
                      key={d.username}
                      label={`${d.username} (${t(`roles.${d.role}`)})`}
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setUsername(d.username);
                        setPassword(d.password);
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
};

import { LockOutlined as LockIcon } from '@mui/icons-material';
import { Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getFirstAccessibleRoute, useAuth } from '../context/AuthContext';
import type { Permission } from '../types/api';

export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export const RequirePermission: React.FC<{
  permissions: Permission[];
  children: React.ReactNode;
}> = ({ permissions, children }) => {
  const { user, canAny } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (canAny(permissions)) {
    return <>{children}</>;
  }

  const startRoute = getFirstAccessibleRoute(user);

  return (
    <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
      <Paper sx={{ p: 4, maxWidth: 480, textAlign: 'center' }}>
        <Stack spacing={2} alignItems="center">
          <LockIcon color="error" sx={{ fontSize: 48 }} />
          <Typography variant="h6">{t('auth.forbiddenTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('auth.forbiddenBody')}
          </Typography>
          {startRoute && (
            <Button variant="contained" onClick={() => navigate(startRoute)}>
              {t('auth.goHome')}
            </Button>
          )}
        </Stack>
      </Paper>
    </Box>
  );
};

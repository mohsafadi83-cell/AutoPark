import { Box, CircularProgress } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RequireAuth, RequirePermission } from './components/RouteGuard';
import { AuthProvider, getFirstAccessibleRoute, useAuth } from './context/AuthContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { AppThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import './i18n';
import { LoginPage } from './pages/LoginPage';

// Route-level code splitting to reduce initial JS bundle size and accelerate first paint
const AlarmsPage = lazy(() => import('./pages/AlarmsPage').then((m) => ({ default: m.AlarmsPage })));
const AuditHistoryPage = lazy(() => import('./pages/AuditHistoryPage').then((m) => ({ default: m.AuditHistoryPage })));
const CommandsPage = lazy(() => import('./pages/CommandsPage').then((m) => ({ default: m.CommandsPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const DevicesPage = lazy(() => import('./pages/DevicesPage').then((m) => ({ default: m.DevicesPage })));
const IndustrialConfigPage = lazy(() => import('./pages/IndustrialConfigPage').then((m) => ({ default: m.IndustrialConfigPage })));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage').then((m) => ({ default: m.MonitoringPage })));
const ParkingPage = lazy(() => import('./pages/ParkingPage').then((m) => ({ default: m.ParkingPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage').then((m) => ({ default: m.VehiclesPage })));

const PageLoader: React.FC = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
    <CircularProgress size={32} />
  </Box>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3000,
      refetchOnWindowFocus: false,
    },
  },
});

const IndexRedirect: React.FC = () => {
  const { user } = useAuth();
  const dest = getFirstAccessibleRoute(user) ?? '/profile';
  return <Navigate to={dest} replace />;
};

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<IndexRedirect />} />
        <Route
          path="dashboard"
          element={
            <RequirePermission permissions={['dashboard.view']}>
              <DashboardPage />
            </RequirePermission>
          }
        />
        <Route
          path="monitoring"
          element={
            <RequirePermission permissions={['system.monitor']}>
              <MonitoringPage />
            </RequirePermission>
          }
        />
        <Route
          path="parking"
          element={
            <RequirePermission permissions={['parking.view']}>
              <ParkingPage />
            </RequirePermission>
          }
        />
        <Route
          path="vehicles"
          element={
            <RequirePermission permissions={['vehicles.manage.own', 'vehicles.manage.any']}>
              <VehiclesPage />
            </RequirePermission>
          }
        />
        <Route
          path="users"
          element={
            <RequirePermission permissions={['users.manage']}>
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="devices"
          element={
            <RequirePermission permissions={['users.manage']}>
              <DevicesPage />
            </RequirePermission>
          }
        />
        <Route
          path="alarms"
          element={
            <RequirePermission permissions={['alarms.view']}>
              <AlarmsPage />
            </RequirePermission>
          }
        />
        <Route
          path="commands"
          element={
            <RequirePermission permissions={['commands.view']}>
              <CommandsPage />
            </RequirePermission>
          }
        />
        <Route
          path="audit"
          element={
            <RequirePermission permissions={['audit.view', 'history.view.all', 'history.view.own', 'diagnostics.view']}>
              <AuditHistoryPage />
            </RequirePermission>
          }
        />
        <Route
          path="config"
          element={
            <RequirePermission permissions={['config.manage']}>
              <IndustrialConfigPage />
            </RequirePermission>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<IndexRedirect />} />
      </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <RealtimeProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </RealtimeProvider>
          </AuthProvider>
        </ToastProvider>
      </AppThemeProvider>
    </QueryClientProvider>
  );
}

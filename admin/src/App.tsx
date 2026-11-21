import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RequireAuth, RequirePermission } from './components/RouteGuard';
import { AuthProvider, getFirstAccessibleRoute, useAuth } from './context/AuthContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { AppThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import './i18n';
import { AlarmsPage } from './pages/AlarmsPage';
import { AuditHistoryPage } from './pages/AuditHistoryPage';
import { CommandsPage } from './pages/CommandsPage';
import { DashboardPage } from './pages/DashboardPage';
import { IndustrialConfigPage } from './pages/IndustrialConfigPage';
import { LoginPage } from './pages/LoginPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { ParkingPage } from './pages/ParkingPage';
import { ProfilePage } from './pages/ProfilePage';
import { UsersPage } from './pages/UsersPage';
import { VehiclesPage } from './pages/VehiclesPage';

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

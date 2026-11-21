import {
  AccountCircle as ProfileIcon,
  Brightness4 as DarkIcon,
  Brightness7 as LightIcon,
  Dashboard as DashboardIcon,
  DirectionsCar as VehiclesIcon,
  FactCheck as AuditIcon,
  LocalParking as ParkingIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  MonitorHeart as MonitoringIcon,
  Notifications as NotificationsIcon,
  People as UsersIcon,
  SettingsInputComponent as ConfigIcon,
  Terminal as CommandsIcon,
  Translate as TranslateIcon,
  WarningAmber as AlarmsIcon,
} from '@mui/icons-material';
import {
  Alert,
  AppBar,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { notificationsApi, systemApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { useAppTheme } from '../context/ThemeContext';
import type { Permission } from '../types/api';
import { SystemStateBadge } from './StatusBadges';

const DRAWER_WIDTH = 260;

interface NavItem {
  labelKey: string;
  path: string;
  icon: React.ReactElement;
  permissions: Permission[];
  section: 'operations' | 'administration' | 'diagnostics';
}

const NAV_ITEMS: NavItem[] = [
  {
    labelKey: 'nav.dashboard',
    path: '/dashboard',
    icon: <DashboardIcon />,
    permissions: ['dashboard.view'],
    section: 'operations',
  },
  {
    labelKey: 'nav.monitoring',
    path: '/monitoring',
    icon: <MonitoringIcon />,
    permissions: ['system.monitor'],
    section: 'operations',
  },
  {
    labelKey: 'nav.parking',
    path: '/parking',
    icon: <ParkingIcon />,
    permissions: ['parking.view'],
    section: 'operations',
  },
  {
    labelKey: 'nav.alarms',
    path: '/alarms',
    icon: <AlarmsIcon />,
    permissions: ['alarms.view'],
    section: 'operations',
  },
  {
    labelKey: 'nav.vehicles',
    path: '/vehicles',
    icon: <VehiclesIcon />,
    permissions: ['vehicles.manage.own', 'vehicles.manage.any'],
    section: 'administration',
  },
  {
    labelKey: 'nav.users',
    path: '/users',
    icon: <UsersIcon />,
    permissions: ['users.manage'],
    section: 'administration',
  },
  {
    labelKey: 'nav.config',
    path: '/config',
    icon: <ConfigIcon />,
    permissions: ['config.manage'],
    section: 'administration',
  },
  {
    labelKey: 'nav.commands',
    path: '/commands',
    icon: <CommandsIcon />,
    permissions: ['commands.view'],
    section: 'diagnostics',
  },
  {
    labelKey: 'nav.auditAndHistory',
    path: '/audit',
    icon: <AuditIcon />,
    permissions: ['audit.view', 'history.view.all', 'history.view.own', 'diagnostics.view'],
    section: 'diagnostics',
  },
];

export const AppShell: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout, canAny } = useAuth();
  const { connected: wsConnected, connecting: wsConnecting } = useRealtime();
  const { mode, toggleTheme, language, toggleLanguage } = useAppTheme();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['systemStatus'],
    queryFn: () => systemApi.status(),
    refetchInterval: 10000,
    retry: 1,
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => notificationsApi.list({ unread: true, limit: 20 }),
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.read(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.readAll(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadList = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.total ?? unreadList.length;
  const sysStatus = statusQuery.data;
  const backendOffline = statusQuery.isError;

  const sections: Array<{ key: NavItem['section']; title: string }> = [
    { key: 'operations', title: t('nav.sectionOperations') },
    { key: 'administration', title: t('nav.sectionAdministration') },
    { key: 'diagnostics', title: t('nav.sectionDiagnostics') },
  ];

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ParkingIcon color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="subtitle1" fontWeight={800} lineHeight={1.2}>
            {t('app.name')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('app.subtitle')}
          </Typography>
        </Box>
      </Box>
      <Divider />
      <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {sections.map((sec) => {
          const items = NAV_ITEMS.filter((i) => i.section === sec.key && canAny(i.permissions));
          if (items.length === 0) return null;
          return (
            <List
              key={sec.key}
              subheader={
                <ListSubheader sx={{ bgcolor: 'transparent', lineHeight: '32px', fontWeight: 700 }}>
                  {sec.title}
                </ListSubheader>
              }
            >
              {items.map((item) => {
                const selected = location.pathname.startsWith(item.path);
                return (
                  <ListItemButton
                    key={item.path}
                    selected={selected}
                    onClick={() => {
                      navigate(item.path);
                      if (isMobile) setMobileOpen(false);
                    }}
                    sx={{ mx: 1, borderRadius: 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={t(item.labelKey)} primaryTypographyProps={{ fontWeight: selected ? 700 : 500 }} />
                  </ListItemButton>
                );
              })}
            </List>
          );
        })}
      </Box>
      <Divider />
      <List sx={{ py: 1 }}>
        <ListItemButton
          selected={location.pathname === '/profile'}
          onClick={() => {
            navigate('/profile');
            if (isMobile) setMobileOpen(false);
          }}
          sx={{ mx: 1, borderRadius: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 38 }}>
            <ProfileIcon />
          </ListItemIcon>
          <ListItemText
            primary={user?.fullName ?? t('nav.profile')}
            secondary={user ? t(`roles.${user.role}`) : undefined}
          />
        </ListItemButton>
        <ListItemButton
          onClick={() => {
            void logout();
          }}
          sx={{ mx: 1, borderRadius: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 38 }}>
            <LogoutIcon color="error" />
          </ListItemIcon>
          <ListItemText primary={t('nav.logout')} />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
          >
            {drawerContent}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            open
            sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
          >
            {drawerContent}
          </Drawer>
        )}
      </Box>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar
          position="sticky"
          color="default"
          elevation={0}
          sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
        >
          <Toolbar sx={{ gap: 1.5, justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              {isMobile && (
                <IconButton edge="start" onClick={() => setMobileOpen(true)}>
                  <MenuIcon />
                </IconButton>
              )}
              {sysStatus && <SystemStateBadge state={sysStatus.state} size="small" />}
              {sysStatus && (
                <Chip
                  size="small"
                  variant="outlined"
                  color={sysStatus.mode === 'SIMULATION' ? 'secondary' : 'primary'}
                  label={`${t(`mode.${sysStatus.mode}`)} · ${sysStatus.adapter}`}
                />
              )}
              <Chip
                size="small"
                color={wsConnected ? 'success' : wsConnecting ? 'warning' : 'error'}
                variant="outlined"
                label={`WS: ${
                  wsConnected
                    ? t('realtime.connected')
                    : wsConnecting
                      ? t('realtime.connecting')
                      : t('realtime.disconnected')
                }`}
              />
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title={t('common.language')}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<TranslateIcon />}
                  onClick={toggleLanguage}
                  data-testid="language-toggle"
                >
                  {language === 'en' ? 'العربية' : 'English'}
                </Button>
              </Tooltip>

              <Tooltip title={t('common.theme')}>
                <IconButton onClick={toggleTheme} data-testid="theme-toggle">
                  {mode === 'dark' ? <LightIcon /> : <DarkIcon />}
                </IconButton>
              </Tooltip>

              <Tooltip title={t('notifications.title')}>
                <IconButton onClick={(e) => setNotifAnchor(e.currentTarget)}>
                  <Badge badgeContent={unreadCount} color="error">
                    <NotificationsIcon />
                  </Badge>
                </IconButton>
              </Tooltip>

              <Menu
                anchorEl={notifAnchor}
                open={Boolean(notifAnchor)}
                onClose={() => setNotifAnchor(null)}
                PaperProps={{ sx: { width: 340, maxHeight: 420 } }}
              >
                <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {t('notifications.title')} ({unreadCount})
                  </Typography>
                  {unreadCount > 0 && (
                    <Button size="small" onClick={() => markAllReadMutation.mutate()}>
                      {t('notifications.markAllRead')}
                    </Button>
                  )}
                </Box>
                <Divider />
                {unreadList.length === 0 ? (
                  <MenuItem disabled>{t('notifications.empty')}</MenuItem>
                ) : (
                  unreadList.map((n) => (
                    <MenuItem
                      key={n.id}
                      onClick={() => {
                        markReadMutation.mutate(n.id);
                      }}
                      sx={{ whiteSpace: 'normal', alignItems: 'flex-start', flexDirection: 'column', py: 1 }}
                    >
                      <Typography variant="body2" fontWeight={700}>
                        {n.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {n.body}
                      </Typography>
                    </MenuItem>
                  ))
                )}
              </Menu>
            </Stack>
          </Toolbar>

          {/* Industrial Safety & Connection Banners */}
          {backendOffline && (
            <Alert severity="error" variant="filled" sx={{ borderRadius: 0, py: 0.25 }}>
              {t('banner.backendDown')}
            </Alert>
          )}
          {!backendOffline && !wsConnected && (
            <Alert severity="warning" variant="filled" sx={{ borderRadius: 0, py: 0.25 }}>
              {t('banner.realtimeDown')}
            </Alert>
          )}
          {sysStatus?.emergencyStop && (
            <Alert severity="error" variant="filled" sx={{ borderRadius: 0, py: 0.5, fontWeight: 700 }}>
              {t('banner.emergency')}
            </Alert>
          )}
          {sysStatus && !sysStatus.controllerConnected && (
            <Alert severity="error" sx={{ borderRadius: 0, py: 0.25 }}>
              {t('banner.controllerOffline')}
            </Alert>
          )}
          {sysStatus?.mode === 'SIMULATION' && (
            <Alert severity="info" sx={{ borderRadius: 0, py: 0.25 }}>
              {t('banner.simulation')}
            </Alert>
          )}
        </AppBar>

        <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, maxWidth: '100%', overflowX: 'hidden' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

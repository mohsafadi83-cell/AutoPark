import {
  Block as BlockIcon,
  Build as BuildIcon,
  CheckCircle as CheckCircleIcon,
  DirectionsCar as CarIcon,
  Error as ErrorIcon,
  HourglassEmpty as HourglassIcon,
  Info as InfoIcon,
  LocalParking as ParkingIcon,
  NotificationImportant as EmergencyIcon,
  OfflineBolt as OfflineIcon,
  Sync as SyncIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { Chip, type ChipProps } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AlarmSeverity,
  AlarmStatus,
  CommandStatus,
  MachineState,
  RequestStatus,
  SpaceStatus,
  SystemState,
} from '../types/api';

export const SystemStateBadge: React.FC<{ state: SystemState; size?: ChipProps['size'] }> = ({
  state,
  size = 'medium',
}) => {
  const { t } = useTranslation();
  const config: Record<SystemState, { color: ChipProps['color']; icon: React.ReactElement }> = {
    ONLINE: { color: 'success', icon: <CheckCircleIcon /> },
    WARNING: { color: 'warning', icon: <WarningIcon /> },
    ERROR: { color: 'error', icon: <ErrorIcon /> },
    OFFLINE: { color: 'default', icon: <OfflineIcon /> },
  };
  const cfg = config[state] ?? config.OFFLINE;
  return (
    <Chip
      size={size}
      color={cfg.color}
      icon={cfg.icon}
      label={t(`systemState.${state}`)}
      data-testid={`system-state-${state}`}
      sx={{ fontWeight: 700 }}
    />
  );
};

export const MachineStateBadge: React.FC<{ state: MachineState; size?: ChipProps['size'] }> = ({
  state,
  size = 'small',
}) => {
  const { t } = useTranslation();
  const config: Record<MachineState, { color: ChipProps['color']; icon: React.ReactElement }> = {
    IDLE: { color: 'success', icon: <CheckCircleIcon /> },
    BUSY: { color: 'info', icon: <SyncIcon /> },
    FAULT: { color: 'error', icon: <ErrorIcon /> },
    EMERGENCY_STOP: { color: 'error', icon: <EmergencyIcon /> },
    MAINTENANCE: { color: 'warning', icon: <BuildIcon /> },
    UNKNOWN: { color: 'default', icon: <HourglassIcon /> },
  };
  const cfg = config[state] ?? config.UNKNOWN;
  return <Chip size={size} color={cfg.color} icon={cfg.icon} label={t(`machineState.${state}`)} sx={{ fontWeight: 600 }} />;
};

export const AlarmSeverityBadge: React.FC<{ severity: AlarmSeverity; size?: ChipProps['size'] }> = ({
  severity,
  size = 'small',
}) => {
  const { t } = useTranslation();
  const config: Record<AlarmSeverity, { color: ChipProps['color']; icon: React.ReactElement }> = {
    INFO: { color: 'info', icon: <InfoIcon /> },
    WARNING: { color: 'warning', icon: <WarningIcon /> },
    CRITICAL: { color: 'error', icon: <ErrorIcon /> },
    EMERGENCY: { color: 'error', icon: <EmergencyIcon /> },
  };
  const cfg = config[severity] ?? config.INFO;
  return (
    <Chip
      size={size}
      color={cfg.color}
      icon={cfg.icon}
      label={t(`severity.${severity}`)}
      data-testid={`alarm-severity-${severity}`}
      sx={{ fontWeight: 700 }}
    />
  );
};

export const AlarmStatusBadge: React.FC<{ status: AlarmStatus; size?: ChipProps['size'] }> = ({
  status,
  size = 'small',
}) => {
  const { t } = useTranslation();
  const config: Record<AlarmStatus, { color: ChipProps['color']; icon: React.ReactElement }> = {
    ACTIVE: { color: 'error', icon: <WarningIcon /> },
    ACKNOWLEDGED: { color: 'warning', icon: <InfoIcon /> },
    RESOLVED: { color: 'success', icon: <CheckCircleIcon /> },
  };
  const cfg = config[status] ?? config.ACTIVE;
  return <Chip size={size} color={cfg.color} icon={cfg.icon} label={t(`alarmStatus.${status}`)} />;
};

export const RequestStatusBadge: React.FC<{ status: RequestStatus; size?: ChipProps['size'] }> = ({
  status,
  size = 'small',
}) => {
  const { t } = useTranslation();
  const config: Record<RequestStatus, { color: ChipProps['color']; icon: React.ReactElement }> = {
    PENDING: { color: 'default', icon: <HourglassIcon /> },
    VALIDATING: { color: 'info', icon: <SyncIcon /> },
    APPROVED: { color: 'info', icon: <CheckCircleIcon /> },
    PROCESSING: { color: 'primary', icon: <SyncIcon /> },
    IN_PROGRESS: { color: 'primary', icon: <CarIcon /> },
    COMPLETED: { color: 'success', icon: <CheckCircleIcon /> },
    FAILED: { color: 'error', icon: <ErrorIcon /> },
    CANCELLED: { color: 'warning', icon: <BlockIcon /> },
  };
  const cfg = config[status] ?? config.PENDING;
  return <Chip size={size} color={cfg.color} icon={cfg.icon} label={t(`requestStatus.${status}`)} />;
};

export const CommandStatusBadge: React.FC<{ status: CommandStatus; size?: ChipProps['size'] }> = ({
  status,
  size = 'small',
}) => {
  const { t } = useTranslation();
  const config: Record<CommandStatus, { color: ChipProps['color']; icon: React.ReactElement }> = {
    CREATED: { color: 'default', icon: <HourglassIcon /> },
    VALIDATED: { color: 'info', icon: <CheckCircleIcon /> },
    AUTHORIZED: { color: 'info', icon: <CheckCircleIcon /> },
    SENT: { color: 'primary', icon: <SyncIcon /> },
    ACKNOWLEDGED: { color: 'primary', icon: <CheckCircleIcon /> },
    EXECUTING: { color: 'warning', icon: <SyncIcon /> },
    COMPLETED: { color: 'success', icon: <CheckCircleIcon /> },
    FAILED: { color: 'error', icon: <ErrorIcon /> },
    TIMEOUT: { color: 'error', icon: <WarningIcon /> },
    CANCELLED: { color: 'default', icon: <BlockIcon /> },
  };
  const cfg = config[status] ?? config.CREATED;
  return <Chip size={size} color={cfg.color} icon={cfg.icon} label={t(`commandStatus.${status}`)} />;
};

export const SpaceStatusBadge: React.FC<{ status: SpaceStatus; size?: ChipProps['size'] }> = ({
  status,
  size = 'small',
}) => {
  const { t } = useTranslation();
  const config: Record<SpaceStatus, { color: ChipProps['color']; icon: React.ReactElement }> = {
    AVAILABLE: { color: 'success', icon: <ParkingIcon /> },
    OCCUPIED: { color: 'primary', icon: <CarIcon /> },
    RESERVED: { color: 'info', icon: <HourglassIcon /> },
    MOVING: { color: 'warning', icon: <SyncIcon /> },
    BLOCKED: { color: 'default', icon: <BlockIcon /> },
    MAINTENANCE: { color: 'warning', icon: <BuildIcon /> },
    ERROR: { color: 'error', icon: <ErrorIcon /> },
  };
  const cfg = config[status] ?? config.AVAILABLE;
  return <Chip size={size} color={cfg.color} icon={cfg.icon} label={t(`spaceStatus.${status}`)} />;
};

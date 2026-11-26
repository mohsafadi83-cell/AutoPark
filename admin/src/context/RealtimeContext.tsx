import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { io, type Socket } from 'socket.io-client';
import { getSocketOrigin, refreshAccessToken } from '../api/client';
import { tokenStore } from '../api/tokenStore';
import type {
  Alarm,
  AppNotification,
  IndustrialCommand,
  ParkingRequest,
  ParkingSpace,
  SystemStatus,
  VehicleMovingEvent,
} from '../types/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

export interface RealtimeFeedItem {
  id: string;
  event: string;
  timestamp: string;
  summary: string;
  payload: unknown;
}

interface RealtimeContextValue {
  connected: boolean;
  connecting: boolean;
  lastHeartbeat: string | null;
  feed: RealtimeFeedItem[];
  paused: boolean;
  setPaused: (paused: boolean) => void;
  clearFeed: () => void;
  movingVehicles: Record<string, VehicleMovingEvent>;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { notify } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [feed, setFeed] = useState<RealtimeFeedItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [movingVehicles, setMovingVehicles] = useState<Record<string, VehicleMovingEvent>>({});
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const pushEvent = useCallback((event: string, summary: string, payload: unknown) => {
    if (pausedRef.current) return;
    setFeed((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        event,
        timestamp: new Date().toISOString(),
        summary,
        payload,
      },
      ...prev.slice(0, 149),
    ]);
  }, []);

  const clearFeed = useCallback(() => setFeed([]), []);

  useEffect(() => {
    if (!isAuthenticated) {
      setConnected(false);
      setConnecting(false);
      return;
    }

    const token = tokenStore.getAccessToken();
    if (!token) return;

    setConnecting(true);
    const socket: Socket = io(`${getSocketOrigin()}/realtime`, {
      auth: { token },
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
    });

    const unsubToken = tokenStore.subscribe((newToken) => {
      if (newToken) {
        socket.auth = { token: newToken };
        if (!socket.connected) {
          socket.connect();
        }
      } else {
        socket.disconnect();
      }
    });

    socket.on('connect', () => {
      setConnected(true);
      setConnecting(false);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', () => {
      setConnected(false);
      setConnecting(true);
    });

    socket.on('auth.error', async () => {
      setConnected(false);
      try {
        const fresh = await refreshAccessToken({ silent: true });
        socket.auth = { token: fresh };
        socket.connect();
      } catch {
        socket.disconnect();
      }
    });

    const handleSystemStatus = (event: string) => (status: SystemStatus) => {
      queryClient.setQueryData(['systemStatus'], status);
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['industrialStatus'] });
      pushEvent(event, `${status.state} / ${status.machineState}`, status);
    };

    socket.on('system.status.changed', handleSystemStatus('system.status.changed'));
    socket.on('controller.online', handleSystemStatus('controller.online'));
    socket.on('controller.offline', handleSystemStatus('controller.offline'));

    const handleRequestEvent = (event: string) => (req: ParkingRequest) => {
      void queryClient.invalidateQueries({ queryKey: ['parkingRequests'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.setQueryData(['parkingRequest', req.id], req);
      if (req.status === 'COMPLETED' || req.status === 'FAILED' || req.status === 'CANCELLED') {
        setMovingVehicles((prev) => {
          const copy = { ...prev };
          delete copy[req.id];
          return copy;
        });
      }
      pushEvent(event, `${req.requestNumber} (${req.requestType}) → ${req.status}`, req);
    };

    socket.on('parking.request.created', handleRequestEvent('parking.request.created'));
    socket.on('parking.request.updated', handleRequestEvent('parking.request.updated'));
    socket.on('vehicle.parked', handleRequestEvent('vehicle.parked'));
    socket.on('vehicle.retrieved', handleRequestEvent('vehicle.retrieved'));

    socket.on('parking.space.updated', (space: ParkingSpace) => {
      void queryClient.invalidateQueries({ queryKey: ['parkingSpaces'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      pushEvent('parking.space.updated', `${space.spaceNumber} → ${space.status}`, space);
    });

    socket.on('vehicle.moving', (ev: VehicleMovingEvent) => {
      setMovingVehicles((prev) => ({ ...prev, [ev.requestId]: ev }));
      pushEvent('vehicle.moving', `${ev.plateNumber} (${ev.spaceNumber}) ${ev.progress}% - ${ev.phase}`, ev);
    });

    socket.on('command.updated', (cmd: IndustrialCommand) => {
      void queryClient.invalidateQueries({ queryKey: ['industrialCommands'] });
      void queryClient.invalidateQueries({ queryKey: ['parkingRequests'] });
      pushEvent('command.updated', `${cmd.commandId} (${cmd.commandType}) → ${cmd.status} (${cmd.progress}%)`, cmd);
    });

    const handleAlarm = (event: string) => (alarm: Alarm) => {
      void queryClient.invalidateQueries({ queryKey: ['alarms'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      pushEvent(event, `[${alarm.severity}] ${alarm.alarmCode}: ${alarm.description}`, alarm);
      if (event === 'alarm.created') {
        const sev =
          alarm.severity === 'CRITICAL' || alarm.severity === 'EMERGENCY'
            ? 'error'
            : alarm.severity === 'WARNING'
              ? 'warning'
              : 'info';
        notify(t('toast.alarm', { code: alarm.alarmCode, description: alarm.description }), sev);
      }
    };

    socket.on('alarm.created', handleAlarm('alarm.created'));
    socket.on('alarm.acknowledged', handleAlarm('alarm.acknowledged'));
    socket.on('alarm.resolved', handleAlarm('alarm.resolved'));

    socket.on('notification', (n: AppNotification) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      pushEvent('notification', `${n.title}: ${n.body}`, n);
      notify(`${n.title} — ${n.body}`, n.type === 'CRITICAL_ALARM' || n.type === 'SYSTEM_ERROR' ? 'error' : 'info');
    });

    socket.on('heartbeat', (hb: { time: string }) => {
      setLastHeartbeat(hb.time);
    });

    return () => {
      unsubToken();
      socket.disconnect();
    };
  }, [isAuthenticated, notify, pushEvent, queryClient, t]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      connected,
      connecting,
      lastHeartbeat,
      feed,
      paused,
      setPaused,
      clearFeed,
      movingVehicles,
    }),
    [connected, connecting, lastHeartbeat, feed, paused, clearFeed, movingVehicles],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}

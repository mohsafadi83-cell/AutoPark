import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RequestTimeline, normalizeRequestSteps } from '../components/RequestTimeline';
import { AlarmSeverityBadge, SystemStateBadge } from '../components/StatusBadges';
import { getFirstAccessibleRoute, hasAnyPermission, hasPermission } from '../context/AuthContext';
import { applyDocumentLanguage } from '../i18n';
import '../i18n';
import { MASKED_SECRET, sanitizeConfigPayload } from '../pages/IndustrialConfigPage';
import { canCancelParkingRequest, sortTowerSpacesTopDown } from '../pages/ParkingPage';
import { TAG_KEYS, type IndustrialConfig, type ParkingRequest, type TagDefinition, type User } from '../types/api';

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u-1',
  fullName: 'Test Operator',
  username: 'operator',
  email: 'operator@autopark.local',
  phone: null,
  role: 'OPERATOR',
  permissions: ['dashboard.view', 'parking.view', 'alarms.view'],
  status: 'ACTIVE',
  language: 'en',
  lastLogin: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('RBAC permission checks', () => {
  it('grants explicit permissions and denies missing permissions for standard roles', () => {
    const operator = makeUser();
    expect(hasPermission(operator, 'dashboard.view')).toBe(true);
    expect(hasPermission(operator, 'config.manage')).toBe(false);
    expect(hasAnyPermission(operator, ['config.manage', 'alarms.view'])).toBe(true);
    expect(hasAnyPermission(operator, ['config.manage', 'users.manage'])).toBe(false);
  });

  it('grants all permissions to SUPER_ADMIN regardless of permission array', () => {
    const superAdmin = makeUser({ role: 'SUPER_ADMIN', permissions: [] });
    expect(hasPermission(superAdmin, 'config.manage')).toBe(true);
    expect(hasPermission(superAdmin, 'simulation.control')).toBe(true);
  });

  it('resolves the first accessible route based on permissions', () => {
    const monitorOnly = makeUser({ permissions: ['system.monitor'] });
    expect(getFirstAccessibleRoute(monitorOnly)).toBe('/monitoring');
    expect(getFirstAccessibleRoute(null)).toBeNull();
  });
});

describe('Status & Alarm badge accessibility (icon + text)', () => {
  it('renders SystemStateBadge with both icon and visible text label', () => {
    render(<SystemStateBadge state="ONLINE" />);
    const badge = screen.getByTestId('system-state-ONLINE');
    expect(badge).toHaveTextContent('Online');
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('renders AlarmSeverityBadge with both icon and visible severity text', () => {
    render(<AlarmSeverityBadge severity="CRITICAL" />);
    const badge = screen.getByTestId('alarm-severity-CRITICAL');
    expect(badge).toHaveTextContent('Critical');
    expect(badge.querySelector('svg')).not.toBeNull();
  });
});

describe('Request step timeline safety rule', () => {
  const baseRequest: ParkingRequest = {
    id: 'req-1',
    requestNumber: 'PR-20261113-000001',
    requestType: 'PARK',
    status: 'IN_PROGRESS',
    source: 'ADMIN',
    vehicle: { id: 'v-1', plateNumber: 'ABC-1234', brand: 'Toyota', model: 'Camry', color: 'White' },
    user: { id: 'u-1', fullName: 'Operator' },
    parkingSpace: { id: 's-1', spaceNumber: 'A-101', level: 1, zone: 'A' },
    command: null,
    steps: [
      { key: 'CREATED', status: 'DONE', at: '2026-01-01T00:00:00Z' },
      { key: 'VALIDATED', status: 'DONE', at: '2026-01-01T00:00:01Z' },
      { key: 'APPROVED', status: 'DONE', at: '2026-01-01T00:00:02Z' },
      { key: 'COMMAND_SENT', status: 'DONE', at: '2026-01-01T00:00:03Z' },
      { key: 'CONTROLLER_CONFIRMED', status: 'DONE', at: '2026-01-01T00:00:04Z' },
      { key: 'VEHICLE_MOVING', status: 'DONE', at: '2026-01-01T00:00:05Z' },
      // Even if a buggy payload claims PARKING_COMPLETED is DONE while request status is IN_PROGRESS:
      { key: 'PARKING_COMPLETED', status: 'DONE', at: '2026-01-01T00:00:06Z' },
    ],
    errorMessage: null,
    createdAt: '2026-01-01T00:00:00Z',
    completedAt: null,
  };

  it('never marks the final step DONE unless request.status === COMPLETED', () => {
    const normalized = normalizeRequestSteps(baseRequest);
    const finalStep = normalized[normalized.length - 1];
    expect(finalStep.key).toBe('PARKING_COMPLETED');
    expect(finalStep.status).not.toBe('DONE');

    render(<RequestTimeline request={baseRequest} />);
    const finalEl = screen.getByTestId('timeline-step-PARKING_COMPLETED');
    expect(finalEl.getAttribute('data-status')).toBe('ACTIVE');
  });

  it('marks the final step DONE when request.status === COMPLETED', () => {
    const completedReq: ParkingRequest = { ...baseRequest, status: 'COMPLETED' };
    const normalized = normalizeRequestSteps(completedReq);
    expect(normalized[normalized.length - 1].status).toBe('DONE');
  });

  it('disallows cancelling a request once command status is SENT or beyond', () => {
    expect(canCancelParkingRequest(baseRequest)).toBe(true);
    const sentReq: ParkingRequest = {
      ...baseRequest,
      command: {
        id: 'c-1',
        commandId: 'CMD-1',
        commandType: 'PARK',
        status: 'SENT',
        requestedBy: null,
        vehicleId: 'v-1',
        parkingSpaceId: 's-1',
        parkingRequestId: 'req-1',
        payload: null,
        controllerResponse: null,
        progress: 25,
        phase: 'MOVING',
        createdAt: '2026-01-01T00:00:00Z',
        sentAt: '2026-01-01T00:00:03Z',
        acknowledgedAt: null,
        completedAt: null,
        errorMessage: null,
      },
    };
    expect(canCancelParkingRequest(sentReq)).toBe(false);
  });
});

describe('Secret masking in IndustrialConfig form & RTL language switching', () => {
  it('strips masked secrets ("********") when preparing payload for save/test', () => {
    const tagMap = Object.fromEntries(
      TAG_KEYS.map((k) => [k, { address: 'DB1.DBX0.0', dataType: 'BOOL', access: 'R' } as TagDefinition]),
    ) as Record<(typeof TAG_KEYS)[number], TagDefinition>;

    const cfg: IndustrialConfig = {
      protocol: 'OPC_UA',
      plcModel: 'S7-1500',
      host: '192.168.10.20',
      port: 4840,
      rack: 0,
      slot: 1,
      opcuaEndpoint: 'opc.tcp://192.168.10.20:4840',
      opcuaSecurityMode: 'SignAndEncrypt',
      opcuaUsername: 'admin',
      opcuaPassword: MASKED_SECRET,
      modbusUnitId: 1,
      mqttUrl: null,
      mqttTopicPrefix: null,
      mqttUsername: null,
      mqttPassword: MASKED_SECRET,
      restBaseUrl: null,
      restApiKey: 'new-secret-key-123',
      pollIntervalMs: 500,
      ackTimeoutMs: 5000,
      completionTimeoutMs: 120000,
      heartbeatTimeoutMs: 10000,
      supportsIdempotentCommands: false,
      readOnly: false,
      tagMap,
      updatedAt: '2026-01-01T00:00:00Z',
      updatedBy: 'superadmin',
    };

    const sanitized = sanitizeConfigPayload(cfg);
    expect(sanitized.opcuaPassword).toBeUndefined();
    expect(sanitized.mqttPassword).toBeUndefined();
    expect(sanitized.restApiKey).toBe('new-secret-key-123');
    expect(sanitized.updatedAt).toBeUndefined();
  });

  it('sets document dir="rtl" for Arabic and dir="ltr" for English', () => {
    applyDocumentLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');

    applyDocumentLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });

  it('sorts tower bays top-to-bottom (P3 Top -> P2 Mid -> P1 Bottom) matching physical lift & KTP400 HMI', () => {
    const sorted = sortTowerSpacesTopDown([
      { spaceNumber: 'L11', level: 1 },
      { spaceNumber: 'L13', level: 3 },
      { spaceNumber: 'L12', level: 2 },
    ]);
    expect(sorted.map((s) => s.spaceNumber)).toEqual(['L13', 'L12', 'L11']);
  });
});

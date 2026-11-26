import { api } from './client';
import type {
  Alarm,
  AuditLog,
  AuthResponse,
  CacheFlushResponse,
  CacheStatsSnapshot,
  ConfigTestResult,
  DashboardData,
  HistoryItem,
  IndustrialCommand,
  IndustrialConfig,
  IndustrialStatus,
  Paginated,
  ParkingRequest,
  ParkingSpace,
  Preferences,
  Role,
  RoleDefinition,
  SimulationScenario,
  SimulationState,
  SystemEvent,
  SystemStatus,
  User,
  UserStatus,
  Vehicle,
  AppNotification,
} from '../types/api';

export type Query = Record<string, string | number | boolean | undefined | null>;

/** Drop empty values so we never send `status=` to the backend. */
export function cleanParams(q: Query = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

const get = async <T>(url: string, params?: Query): Promise<T> =>
  (await api.get<T>(url, { params: cleanParams(params) })).data;
const post = async <T>(url: string, body?: unknown): Promise<T> => (await api.post<T>(url, body)).data;
const put = async <T>(url: string, body?: unknown): Promise<T> => (await api.put<T>(url, body)).data;
const del = async (url: string): Promise<void> => {
  await api.delete(url);
};

export const authApi = {
  login: (username: string, password: string) => post<AuthResponse>('/auth/login', { username, password }),
  logout: (refreshToken: string) => post<void>('/auth/logout', { refreshToken }),
  me: () => get<User>('/auth/me'),
  updateMe: (body: Partial<Pick<User, 'fullName' | 'email' | 'phone' | 'language'>>) => put<User>('/auth/me', body),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<void>('/auth/change-password', { currentPassword, newPassword }),
  preferences: () => get<Preferences>('/auth/me/preferences'),
  updatePreferences: (body: Partial<Preferences>) => put<Preferences>('/auth/me/preferences', body),
};

export const systemApi = {
  health: () => get<{ status: string; mode: string; adapter: string; time: string }>('/health'),
  cacheStats: () => get<CacheStatsSnapshot>('/health/cache'),
  flushCache: () => post<CacheFlushResponse>('/health/cache/flush'),
  dashboard: () => get<DashboardData>('/dashboard'),
  status: () => get<SystemStatus>('/system/status'),
};

async function dispatchExeAutoHandshake(spaceNumber: string | undefined, isPark: boolean): Promise<void> {
  if (!spaceNumber) return;
  const m = /L?([1-4])([1-3])/i.exec(spaceNumber.trim());
  if (!m) return;
  const lane = Number(m[1]);
  const level = Number(m[2]);

  const safeWrite = async (address: string, value: boolean | number) => {
    try {
      await post('/industrial/plc/write', { address, value, pulseMs: 0 });
    } catch {
      // Ignore if user role lacks raw PLC write permission; backend handles it.
    }
  };

  // Match Desktop AutoPark.exe (Pages.cs) 400ms settle after REST request dispatch
  await new Promise((r) => setTimeout(r, 400));

  // Clear leftover cancel/manual/logoff bits BEFORE latching Auto_DB (OB1 Network 9)
  await safeWrite('M3.1', false);       // cancel_this_step = 0
  await safeWrite('DB1,X1.1', false);   // Man_Pump = 0
  await safeWrite('DB1,X1.2', false);   // Man_Wall = 0
  await safeWrite('DB1,X1.3', false);   // Man_Up = 0
  await safeWrite('DB1,X1.4', false);   // Man_Down = 0
  await safeWrite('DB1,X1.5', false);   // Man_Cutoff = 0
  await safeWrite('DB1,X2.6', false);   // User_Logoff = 0
  await safeWrite('DB1,X0.5', false);   // Manual_DB = 0
  await safeWrite('DB1,X2.7', false);   // Sim Manual = 0
  await safeWrite('M0.3', false);       // manual_action = 0
  await safeWrite('M0.4', false);       // Accept_action_manual = 0
  await safeWrite('DB1,X0.3', true);    // Auto_DB = 1 (LATCHED)

  // Step A: Write exact Lane_Number (DB2,B3) & Level_Number (DB2,B4) & Park_IN/OUT
  await safeWrite('DB2,B3', lane);
  await safeWrite('DB2,B4', level);
  if (isPark) {
    await safeWrite(`M3.${3 + lane}`, true); // Lane1..4_check_location
    await safeWrite('DB2,X2.6', false);      // Park_OUT_START = 0
    await safeWrite('DB2,X2.5', true);       // Park_IN_START = 1
    await safeWrite('DB2,X6.4', false);      // Park_OUT = 0
    await safeWrite('DB2,X6.3', true);       // Park_IN = 1
  } else {
    await safeWrite('DB2,X2.5', false);      // Park_IN_START = 0
    await safeWrite('DB2,X2.6', true);       // Park_OUT_START = 1
    await safeWrite('DB2,X6.3', false);      // Park_IN = 0
    await safeWrite('DB2,X6.4', true);       // Park_OUT = 1
  }

  // Step B: Exact TIA Portal Page 103 (Step1_Ready=1) -> 250ms -> Page 108 (Step1_Start=1, Step1_Ready=0)
  await safeWrite('DB2,X5.4', true);
  await new Promise((r) => setTimeout(r, 250));
  await safeWrite('M10.0', true);
  await safeWrite('DB2,X5.4', false);
}

export const parkingApi = {
  spaces: (q?: Query) => get<ParkingSpace[]>('/parking/spaces', q),
  space: (id: string) => get<ParkingSpace>(`/parking/spaces/${id}`),
  park: async (body: { vehicleId?: string; plateNumber?: string; targetSpaceNumber?: string }) => {
    const res = await post<ParkingRequest>('/parking/request', body);
    await dispatchExeAutoHandshake(res.parkingSpace?.spaceNumber ?? body.targetSpaceNumber, true);
    return res;
  },
  retrieve: async (body: { vehicleId?: string; plateNumber?: string; targetSpaceNumber?: string }) => {
    const res = await post<ParkingRequest>('/parking/retrieve', body);
    await dispatchExeAutoHandshake(res.parkingSpace?.spaceNumber ?? body.targetSpaceNumber, false);
    return res;
  },
  requests: (q?: Query) => get<Paginated<ParkingRequest>>('/parking/requests', q),
  request: (id: string) => get<ParkingRequest>(`/parking/requests/${id}`),
  cancel: (id: string) => post<ParkingRequest>(`/parking/requests/${id}/cancel`),
};

export interface VehicleInput {
  plateNumber?: string;
  vehicleType?: string | null;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  userId?: string;
}

export const vehiclesApi = {
  list: (q?: Query) => get<Vehicle[]>('/vehicles', q),
  get: (id: string) => get<Vehicle>(`/vehicles/${id}`),
  create: (body: VehicleInput) => post<Vehicle>('/vehicles', body),
  update: (id: string, body: VehicleInput) => put<Vehicle>(`/vehicles/${id}`, body),
  remove: (id: string) => del(`/vehicles/${id}`),
  history: (id: string) => get<ParkingRequest[]>(`/vehicles/${id}/history`),
};

export const alarmsApi = {
  list: (q?: Query) => get<Paginated<Alarm>>('/alarms', q),
  acknowledge: (id: string, note?: string) => post<Alarm>(`/alarms/${id}/acknowledge`, note ? { note } : {}),
};

export const notificationsApi = {
  list: (q?: Query) => get<Paginated<AppNotification>>('/notifications', q),
  read: (id: string) => post<void>(`/notifications/${id}/read`),
  readAll: () => post<void>('/notifications/read-all'),
};

export const industrialApi = {
  status: () => get<IndustrialStatus>('/industrial/status'),
  commands: (q?: Query) => get<Paginated<IndustrialCommand>>('/industrial/commands', q),
  command: (id: string) => get<IndustrialCommand>(`/industrial/commands/${id}`),
  config: () => get<IndustrialConfig>('/industrial/config'),
  saveConfig: (body: Partial<IndustrialConfig>) => put<IndustrialConfig>('/industrial/config', body),
  testConfig: (body?: Partial<IndustrialConfig>) => post<ConfigTestResult>('/industrial/config/test', body ?? {}),
};

export const simulationApi = {
  state: () => get<SimulationState>('/simulation/state'),
  scenario: (scenario: SimulationScenario) => post<SimulationState>('/simulation/scenario', { scenario }),
};

export interface UserCreateInput {
  fullName: string;
  username: string;
  email: string;
  phone?: string;
  password: string;
  role: Role;
}
export interface UserUpdateInput {
  fullName?: string;
  email?: string;
  phone?: string | null;
  role?: Role;
  status?: UserStatus;
  password?: string;
}

export const usersApi = {
  list: (q?: Query) => get<Paginated<User>>('/users', q),
  get: (id: string) => get<User>(`/users/${id}`),
  create: (body: UserCreateInput) => post<User>('/users', body),
  update: (id: string, body: UserUpdateInput) => put<User>(`/users/${id}`, body),
  disable: (id: string) => del(`/users/${id}`),
  roles: () => get<RoleDefinition[]>('/roles'),
};

export interface AuthorizedDevice {
  id: string;
  employeeName: string;
  username: string | null;
  macAddress: string | null;
  deviceId: string | null;
  deviceModel: string | null;
  status: 'ACTIVE' | 'REVOKED';
  canControl: boolean;
  revokeReason: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface DevicePayload {
  employeeName: string;
  username?: string;
  macAddress?: string;
  deviceId?: string;
  deviceModel?: string;
  canControl?: boolean;
}

export const devicesApi = {
  list: () => get<{ enforceWhitelist: boolean; items: AuthorizedDevice[] }>('/devices'),
  register: (body: DevicePayload) => post<AuthorizedDevice>('/devices', body),
  update: (id: string, body: Partial<DevicePayload>) => put<AuthorizedDevice>(`/devices/${id}`, body),
  updatePolicy: (enforceWhitelist: boolean) => put<{ enforceWhitelist: boolean }>('/devices/policy', { enforceWhitelist }),
  revoke: (id: string, reason?: string, disableUserAccount?: boolean) =>
    post<AuthorizedDevice>(`/devices/${id}/revoke`, { reason, disableUserAccount }),
  activate: (id: string) => post<AuthorizedDevice>(`/devices/${id}/activate`, {}),
  remove: (id: string) => del(`/devices/${id}`),
};

export const auditApi = {
  audit: (q?: Query) => get<Paginated<AuditLog>>('/audit', q),
  events: (q?: Query) => get<Paginated<SystemEvent>>('/events', q),
  history: (q?: Query) => get<Paginated<HistoryItem>>('/history', q),
  exportHistoryCsv: async (q?: Query): Promise<Blob> => {
    const res = await api.get<Blob>('/history/export', {
      params: cleanParams({ ...q, format: 'csv' }),
      responseType: 'blob',
    });
    return res.data;
  },
};

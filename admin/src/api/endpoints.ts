import { api } from './client';
import type {
  Alarm,
  AuditLog,
  AuthResponse,
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
  dashboard: () => get<DashboardData>('/dashboard'),
  status: () => get<SystemStatus>('/system/status'),
};

export const parkingApi = {
  spaces: (q?: Query) => get<ParkingSpace[]>('/parking/spaces', q),
  space: (id: string) => get<ParkingSpace>(`/parking/spaces/${id}`),
  park: (body: { vehicleId?: string; plateNumber?: string }) => post<ParkingRequest>('/parking/request', body),
  retrieve: (body: { vehicleId?: string; plateNumber?: string }) => post<ParkingRequest>('/parking/retrieve', body),
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

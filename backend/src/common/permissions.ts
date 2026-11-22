import { Role } from './enums';

export enum Permission {
  DASHBOARD_VIEW = 'dashboard.view',
  PARKING_VIEW = 'parking.view',
  PARKING_REQUEST = 'parking.request',
  PARKING_REQUEST_ANY = 'parking.request.any',
  VEHICLES_MANAGE_OWN = 'vehicles.manage.own',
  VEHICLES_MANAGE_ANY = 'vehicles.manage.any',
  ALARMS_VIEW = 'alarms.view',
  ALARMS_ACKNOWLEDGE = 'alarms.acknowledge',
  HISTORY_VIEW_OWN = 'history.view.own',
  HISTORY_VIEW_ALL = 'history.view.all',
  SYSTEM_MONITOR = 'system.monitor',
  DIAGNOSTICS_VIEW = 'diagnostics.view',
  COMMANDS_VIEW = 'commands.view',
  USERS_MANAGE = 'users.manage',
  CONFIG_MANAGE = 'config.manage',
  AUDIT_VIEW = 'audit.view',
  SIMULATION_CONTROL = 'simulation.control',
}

const P = Permission;
const ALL = Object.values(Permission);

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: ALL,
  [Role.SYSTEM_ADMIN]: ALL.filter((p) => p !== P.SIMULATION_CONTROL),
  [Role.OPERATOR]: [
    P.DASHBOARD_VIEW, P.PARKING_VIEW, P.PARKING_REQUEST, P.PARKING_REQUEST_ANY,
    P.VEHICLES_MANAGE_OWN, P.VEHICLES_MANAGE_ANY, P.ALARMS_VIEW, P.ALARMS_ACKNOWLEDGE,
    P.HISTORY_VIEW_ALL, P.SYSTEM_MONITOR, P.COMMANDS_VIEW,
  ],
  [Role.EMPLOYEE]: [
    P.DASHBOARD_VIEW, P.PARKING_VIEW, P.PARKING_REQUEST, P.PARKING_REQUEST_ANY, P.SYSTEM_MONITOR,
  ],
  [Role.PARKING_ATTENDANT]: [
    P.DASHBOARD_VIEW, P.PARKING_VIEW, P.PARKING_REQUEST, P.PARKING_REQUEST_ANY, P.SYSTEM_MONITOR,
  ],
  [Role.MAINTENANCE_ENGINEER]: [
    P.DASHBOARD_VIEW, P.PARKING_VIEW, P.ALARMS_VIEW, P.ALARMS_ACKNOWLEDGE, P.HISTORY_VIEW_ALL,
    P.SYSTEM_MONITOR, P.DIAGNOSTICS_VIEW, P.COMMANDS_VIEW, P.SIMULATION_CONTROL,
  ],
  [Role.CUSTOMER]: [
    P.DASHBOARD_VIEW, P.PARKING_VIEW, P.PARKING_REQUEST, P.VEHICLES_MANAGE_OWN, P.HISTORY_VIEW_OWN,
  ],
  [Role.READ_ONLY]: [P.DASHBOARD_VIEW, P.PARKING_VIEW, P.ALARMS_VIEW, P.SYSTEM_MONITOR, P.HISTORY_VIEW_ALL],
};

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

/** Roles that see all realtime traffic (not only their own requests). */
export function isStaff(role: Role): boolean {
  return role !== Role.CUSTOMER;
}

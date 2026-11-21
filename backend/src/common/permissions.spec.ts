import { Role } from './enums';
import { hasPermission, isStaff, Permission, permissionsFor } from './permissions';
import { decryptSecret, encryptSecret, normalizePlate } from './utils';

describe('RBAC permissions & security utilities', () => {
  it('grants SUPER_ADMIN all permissions and restricts CUSTOMER to own operations', () => {
    expect(hasPermission(Role.SUPER_ADMIN, Permission.CONFIG_MANAGE)).toBe(true);
    expect(hasPermission(Role.SUPER_ADMIN, Permission.SIMULATION_CONTROL)).toBe(true);
    expect(hasPermission(Role.CUSTOMER, Permission.PARKING_REQUEST)).toBe(true);
    expect(hasPermission(Role.CUSTOMER, Permission.PARKING_REQUEST_ANY)).toBe(false);
    expect(hasPermission(Role.CUSTOMER, Permission.CONFIG_MANAGE)).toBe(false);
    expect(hasPermission(Role.READ_ONLY, Permission.PARKING_REQUEST)).toBe(false);
    expect(permissionsFor(Role.OPERATOR)).toContain(Permission.ALARMS_ACKNOWLEDGE);
    expect(isStaff(Role.CUSTOMER)).toBe(false);
    expect(isStaff(Role.OPERATOR)).toBe(true);
  });

  it('encrypts and decrypts industrial secrets with AES-256-GCM', () => {
    const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const cipher = encryptSecret('S7-Secret-Pass#2026', key);
    expect(cipher).not.toContain('S7-Secret-Pass#2026');
    expect(decryptSecret(cipher, key)).toBe('S7-Secret-Pass#2026');
  });

  it('normalizes license plates consistently', () => {
    expect(normalizePlate('  abc   1234 ')).toBe('ABC 1234');
  });
});

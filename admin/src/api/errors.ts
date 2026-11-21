import { isAxiosError } from 'axios';
import type { TFunction } from 'i18next';
import type { ApiErrorBody } from '../types/api';

/** Known machine-readable error codes from the API contract. */
export const KNOWN_ERROR_CODES = [
  'SYSTEM_OFFLINE',
  'SYSTEM_NOT_READY',
  'EMERGENCY_STOP_ACTIVE',
  'SAFETY_INTERLOCK',
  'CRITICAL_ALARM_ACTIVE',
  'MACHINE_BUSY',
  'DUPLICATE_REQUEST',
  'VEHICLE_ALREADY_PARKED',
  'VEHICLE_NOT_PARKED',
  'NO_SPACE_AVAILABLE',
  'VEHICLE_NOT_FOUND',
  'FORBIDDEN_VEHICLE',
  'COMMAND_ALREADY_SENT',
] as const;

export interface ParsedApiError {
  status: number | null;
  code: string | null;
  message: string | null;
}

export function parseApiError(err: unknown): ParsedApiError {
  if (isAxiosError<ApiErrorBody>(err)) {
    const body = err.response?.data;
    const msg = body?.message;
    return {
      status: err.response?.status ?? null,
      code: body?.code ?? null,
      message: Array.isArray(msg) ? msg.join(', ') : (msg ?? null),
    };
  }
  if (err instanceof Error) return { status: null, code: null, message: err.message };
  return { status: null, code: null, message: null };
}

/** Map an error to a translated, user-facing message. */
export function errorMessage(err: unknown, t: TFunction): string {
  const p = parseApiError(err);
  if (p.code) {
    const key = `errors.codes.${p.code}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  if (p.status === null && isAxiosError(err)) return t('errors.network');
  switch (p.status) {
    case 401:
      return t('errors.unauthorized');
    case 403:
      return t('errors.forbidden');
    case 404:
      return p.message ?? t('errors.notFound');
    case 423:
      return t('errors.locked');
    case 429:
      return t('errors.rateLimited');
    default:
      if (p.status && p.status >= 500) return t('errors.server');
  }
  return p.message ?? t('errors.unknown');
}

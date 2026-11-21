import { HttpException, HttpStatus } from '@nestjs/common';

/** Machine readable error codes shared with the mobile app & admin panel (see API_DOCUMENTATION.md). */
export type ErrorCode =
  | 'SYSTEM_OFFLINE'
  | 'SYSTEM_NOT_READY'
  | 'EMERGENCY_STOP_ACTIVE'
  | 'SAFETY_INTERLOCK'
  | 'CRITICAL_ALARM_ACTIVE'
  | 'MACHINE_BUSY'
  | 'DUPLICATE_REQUEST'
  | 'VEHICLE_ALREADY_PARKED'
  | 'VEHICLE_NOT_PARKED'
  | 'NO_SPACE_AVAILABLE'
  | 'VEHICLE_NOT_FOUND'
  | 'FORBIDDEN_VEHICLE'
  | 'COMMAND_ALREADY_SENT'
  | 'CONTROLLER_READ_ONLY'
  | 'WRITE_DISABLED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_DISABLED'
  | 'INVALID_REFRESH_TOKEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'SIMULATION_ONLY'
  | 'COMMAND_IN_PROGRESS'
  | 'DEVICE_REVOKED'
  | 'DEVICE_CONTROL_DISABLED'
  | 'DEVICE_NOT_AUTHORIZED'
  | 'DEVICE_USER_MISMATCH'
  | 'ONLY_EMPLOYEES_ALLOWED';

export class AppError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.CONFLICT,
  ) {
    super({ statusCode: status, error: HttpStatus[status] ?? 'Error', message, code }, status);
  }

  static notFound(what: string, code: ErrorCode = 'NOT_FOUND') {
    return new AppError(code, `${what} not found`, HttpStatus.NOT_FOUND);
  }
  static forbidden(message = 'Forbidden', code: ErrorCode = 'FORBIDDEN') {
    return new AppError(code, message, HttpStatus.FORBIDDEN);
  }
  static badRequest(message: string, code: ErrorCode = 'VALIDATION_ERROR') {
    return new AppError(code, message, HttpStatus.BAD_REQUEST);
  }
}

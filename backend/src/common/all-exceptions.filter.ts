import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ControllerError } from '../modules/industrial/industrial-controller.interface';

/** Uniform error responses. Never leaks stack traces / SQL to clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    if (exception instanceof ControllerError) {
      const codeMap: Record<string, number> = {
        REJECTED: HttpStatus.FORBIDDEN,
        NOT_CONFIGURED: HttpStatus.BAD_REQUEST,
        NOT_CONNECTED: HttpStatus.SERVICE_UNAVAILABLE,
        WRITE_FAILED: HttpStatus.BAD_GATEWAY,
        TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
      };
      const status = codeMap[exception.code] ?? HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        statusCode: status,
        error: HttpStatus[status],
        code: exception.code,
        message: exception.message,
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { statusCode: status, error: HttpStatus[status], message: body }
          : { statusCode: status, error: HttpStatus[status], ...(body as object) };
      if (status === 400 && !(payload as { code?: string }).code) (payload as { code?: string }).code = 'VALIDATION_ERROR';
      return res.status(status).json(payload);
    }

    if (exception instanceof QueryFailedError) {
      const driverError = (exception as unknown as { driverError?: { code?: string } }).driverError;
      if (driverError?.code === '23505') {
        return res
          .status(409)
          .json({ statusCode: 409, error: 'Conflict', message: 'Resource already exists or conflicts with an active operation', code: 'CONFLICT' });
      }
    }

    this.logger.error(`Unhandled error on ${req?.method} ${req?.url}`, (exception as Error)?.stack ?? String(exception));
    return res
      .status(500)
      .json({ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' });
  }
}

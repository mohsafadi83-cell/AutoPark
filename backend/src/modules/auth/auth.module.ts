import {
  Body, CanActivate, Controller, ExecutionContext, Get, Global, Headers, HttpCode, HttpStatus, Inject, Injectable,
  Module, Post, Put, UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import {
  IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MinLength,
} from 'class-validator';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../../config/app.config';
import {
  ANY_PERMISSIONS_KEY, AuthUser, CurrentUser, IS_PUBLIC_KEY, PERMISSIONS_KEY, Public, ReqMeta, RequestMeta,
} from '../../common/decorators';
import { AlarmSeverity, EventCategory, Role, UserStatus } from '../../common/enums';
import { AppError } from '../../common/errors';
import { Permission, permissionsFor } from '../../common/permissions';
import { iso } from '../../common/utils';
import { RefreshTokenEntity, UserEntity } from '../../database/entities';
import { AuditService } from '../audit/audit.module';
import { DevicesService } from '../devices/devices.module';

/* ─────────────────────────── DTOs ─────────────────────────── */
export class LoginDto {
  @IsString() username: string;
  @IsString() password: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() macAddress?: string;
}

export class RefreshDto {
  @IsString() refreshToken: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsIn(['ar', 'en']) language?: 'ar' | 'en';
}

export class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must contain uppercase, lowercase, and a number',
  })
  newPassword: string;
}

export class UpdatePreferencesDto {
  @IsOptional() @IsIn(['ar', 'en']) language?: 'ar' | 'en';
  @IsOptional() @IsBoolean() notifyParking?: boolean;
  @IsOptional() @IsBoolean() notifyAlarms?: boolean;
  @IsOptional() @IsBoolean() notifyMaintenance?: boolean;
}

export function toUserDto(u: UserEntity) {
  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: u.email,
    phone: u.phone ?? null,
    role: u.role,
    permissions: permissionsFor(u.role),
    status: u.status,
    language: u.language ?? 'ar',
    lastLogin: iso(u.lastLogin),
    createdAt: iso(u.createdAt),
    updatedAt: iso(u.updatedAt),
  };
}

/* ─────────────────────────── Auth Service ─────────────────────────── */
@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity) private readonly rtRepo: Repository<RefreshTokenEntity>,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly devices: DevicesService,
  ) {}

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async login(
    dto: LoginDto,
    meta: RequestMeta,
    deviceHeaders?: { clientType?: string; deviceId?: string; macAddress?: string },
  ) {
    const key = dto.username.trim();
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.username) = LOWER(:k) OR LOWER(u.email) = LOWER(:k)', { k: key })
      .getOne();

    if (!user) {
      await this.audit.recordEvent({
        eventType: 'LOGIN_FAILED',
        category: EventCategory.SECURITY,
        severity: AlarmSeverity.WARNING,
        message: `Failed login for unknown user "${key}"`,
        source: meta.ip ?? 'AUTH',
      });
      throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password', HttpStatus.UNAUTHORIZED);
    }

    await this.devices.verifyMobileAccess({
      clientType: deviceHeaders?.clientType,
      rawDeviceId: dto.deviceId || deviceHeaders?.deviceId,
      rawMac: dto.macAddress || deviceHeaders?.macAddress,
      username: user.username,
      userRole: user.role,
      isControlOperation: false,
    });

    if (user.status === UserStatus.DISABLED) {
      throw new AppError('ACCOUNT_DISABLED', 'Account is disabled', HttpStatus.FORBIDDEN);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppError('ACCOUNT_LOCKED', 'Account is temporarily locked due to failed login attempts', 423 as HttpStatus);
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= this.cfg.auth.maxAttempts) {
        user.lockedUntil = new Date(Date.now() + this.cfg.auth.lockMinutes * 60_000);
        user.status = UserStatus.LOCKED;
      }
      await this.usersRepo.save(user);
      await this.audit.log({
        userId: user.id,
        username: user.username,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'user',
        entityId: user.id,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        details: { attempts: user.failedLoginAttempts, locked: Boolean(user.lockedUntil) },
      });
      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        throw new AppError('ACCOUNT_LOCKED', 'Account locked due to multiple failed login attempts', 423 as HttpStatus);
      }
      throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password', HttpStatus.UNAUTHORIZED);
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    if (user.status === UserStatus.LOCKED) user.status = UserStatus.ACTIVE;
    user.lastLogin = new Date();
    await this.usersRepo.save(user);

    const tokens = await this.issueTokens(user, randomUUID(), meta);
    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'AUTH_LOGIN_SUCCESS',
      entity: 'user',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ...tokens, user: toUserDto(user) };
  }

  async refresh(dto: RefreshDto, meta: RequestMeta) {
    const hash = this.hashToken(dto.refreshToken);
    const stored = await this.rtRepo.findOne({ where: { tokenHash: hash } });
    if (!stored) {
      throw new AppError('INVALID_REFRESH_TOKEN', 'Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }
    if (stored.revokedAt) {
      // Reuse of a rotated refresh token -> revoke entire token family!
      await this.rtRepo
        .createQueryBuilder()
        .update()
        .set({ revokedAt: new Date() })
        .where('family_id = :fid AND revoked_at IS NULL', { fid: stored.familyId })
        .execute();
      await this.audit.recordEvent({
        eventType: 'REFRESH_TOKEN_REUSE_DETECTED',
        category: EventCategory.SECURITY,
        severity: AlarmSeverity.WARNING,
        message: `Revoked refresh token reused for user ${stored.userId}; family invalidated`,
        source: meta.ip ?? 'AUTH',
      });
      throw new AppError('INVALID_REFRESH_TOKEN', 'Refresh token has already been used', HttpStatus.UNAUTHORIZED);
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new AppError('INVALID_REFRESH_TOKEN', 'Refresh token expired', HttpStatus.UNAUTHORIZED);
    }

    stored.revokedAt = new Date();
    await this.rtRepo.save(stored);

    const user = await this.usersRepo.findOne({ where: { id: stored.userId } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new AppError('ACCOUNT_DISABLED', 'User account is not active', HttpStatus.FORBIDDEN);
    }

    const tokens = await this.issueTokens(user, stored.familyId, meta);
    return { ...tokens, user: toUserDto(user) };
  }

  async logout(refreshToken: string | undefined, user: AuthUser, meta: RequestMeta) {
    if (refreshToken) {
      const hash = this.hashToken(refreshToken);
      await this.rtRepo
        .createQueryBuilder()
        .update()
        .set({ revokedAt: new Date() })
        .where('token_hash = :hash', { hash })
        .execute();
    }
    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'AUTH_LOGOUT',
      entity: 'user',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async getMe(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');
    return toUserDto(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto, meta: RequestMeta) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');
    if (dto.fullName !== undefined) user.fullName = dto.fullName.trim();
    if (dto.email !== undefined) user.email = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) user.phone = dto.phone.trim() || null;
    if (dto.language !== undefined) user.language = dto.language;
    const saved = await this.usersRepo.save(user);
    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'USER_PROFILE_UPDATE',
      entity: 'user',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return toUserDto(saved);
  }

  async changePassword(userId: string, dto: ChangePasswordDto, meta: RequestMeta) {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: userId })
      .getOne();
    if (!user) throw AppError.notFound('User');
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect', HttpStatus.BAD_REQUEST);

    const rounds = this.cfg.isTest ? 4 : this.cfg.auth.bcryptRounds;
    user.passwordHash = await bcrypt.hash(dto.newPassword, rounds);
    user.passwordChangedAt = new Date();
    await this.usersRepo.save(user);

    await this.rtRepo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('user_id = :uid AND revoked_at IS NULL', { uid: user.id })
      .execute();

    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'AUTH_PASSWORD_CHANGED',
      entity: 'user',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async getPreferences(userId: string) {
    const u = await this.usersRepo.findOne({ where: { id: userId } });
    if (!u) throw AppError.notFound('User');
    return {
      language: u.language ?? 'ar',
      notifyParking: u.preferences?.notifyParking ?? true,
      notifyAlarms: u.preferences?.notifyAlarms ?? true,
      notifyMaintenance: u.preferences?.notifyMaintenance ?? true,
    };
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const u = await this.usersRepo.findOne({ where: { id: userId } });
    if (!u) throw AppError.notFound('User');
    if (dto.language) u.language = dto.language;
    u.preferences = {
      notifyParking: dto.notifyParking ?? u.preferences?.notifyParking ?? true,
      notifyAlarms: dto.notifyAlarms ?? u.preferences?.notifyAlarms ?? true,
      notifyMaintenance: dto.notifyMaintenance ?? u.preferences?.notifyMaintenance ?? true,
    };
    await this.usersRepo.save(u);
    return this.getPreferences(userId);
  }

  private async issueTokens(user: UserEntity, familyId: string, meta: RequestMeta) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, username: user.username, role: user.role },
      { secret: this.cfg.auth.accessSecret, expiresIn: this.cfg.auth.accessTtl },
    );
    const rawRefresh = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.cfg.auth.refreshTtlDays * 86_400_000);
    await this.rtRepo.save({
      userId: user.id,
      tokenHash: this.hashToken(rawRefresh),
      familyId,
      expiresAt,
      revokedAt: null,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return { accessToken, refreshToken: rawRefresh, expiresIn: this.cfg.auth.accessTtl };
  }
}

/* ─────────────────────────── Global Auth & RBAC Guard ─────────────────────────── */
@Injectable()
export class JwtAndPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    private readonly audit: AuditService,
    private readonly devices: DevicesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const authHeader: string | undefined = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    const token = authHeader.slice(7).trim();
    let payload: { sub: string; username: string; role: Role };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.cfg.auth.accessSecret });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.usersRepo.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }

    // Real-time MAC Address & Device ID revocation check on every mobile request!
    const urlPath = String(req.originalUrl ?? req.url ?? '');
    const isControlOp =
      req.method !== 'GET' &&
      (urlPath.includes('/parking/request') ||
        urlPath.includes('/parking/retrieve') ||
        urlPath.includes('/industrial/s7/'));
    await this.devices.verifyMobileAccess({
      clientType: req.headers?.['x-client-type'] as string | undefined,
      rawDeviceId: req.headers?.['x-device-id'] as string | undefined,
      rawMac: req.headers?.['x-device-mac'] as string | undefined,
      username: user.username,
      userRole: user.role,
      isControlOperation: isControlOp,
    });

    const perms = permissionsFor(user.role);
    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      permissions: perms,
    };
    req.user = authUser;

    const requiredAll = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredAny = this.reflector.getAllAndOverride<Permission[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const okAll = !requiredAll?.length || requiredAll.every((p) => perms.includes(p));
    const okAny = !requiredAny?.length || requiredAny.some((p) => perms.includes(p));
    if (!okAll || !okAny) {
      await this.audit.log({
        userId: user.id,
        username: user.username,
        action: 'RBAC_DENIED',
        entity: req.method,
        entityId: req.originalUrl ?? req.url,
        ipAddress: req.ip ?? null,
        details: { role: user.role, requiredAll, requiredAny },
      });
      throw AppError.forbidden('Insufficient permissions for this operation');
    }
    return true;
  }
}

/* ─────────────────────────── Controller ─────────────────────────── */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @ReqMeta() meta: RequestMeta,
    @Headers('x-client-type') clientType?: string,
    @Headers('x-device-id') deviceId?: string,
    @Headers('x-device-mac') macAddress?: string,
  ) {
    return this.auth.login(dto, meta, { clientType, deviceId, macAddress });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.refresh(dto, meta);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: { refreshToken?: string },
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.logout(body?.refreshToken, user, meta);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getMe(user.id);
  }

  @Put('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.updateMe(user.id, dto, meta);
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.changePassword(user.id, dto, meta);
  }

  @Get('me/preferences')
  getPrefs(@CurrentUser() user: AuthUser) {
    return this.auth.getPreferences(user.id);
  }

  @Put('me/preferences')
  updatePrefs(@CurrentUser() user: AuthUser, @Body() dto: UpdatePreferencesDto) {
    return this.auth.updatePreferences(user.id, dto);
  }
}

@Global()
@Module({
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAndPermissionsGuard },
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

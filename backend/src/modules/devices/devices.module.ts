import {
  Body, Controller, Delete, Get, Global, HttpStatus, Injectable, Module, Param, Post, Put,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Repository } from 'typeorm';
import { AppCacheService } from '../../common/cache.module';
import {
  AuthUser, CurrentUser, ReqMeta, RequestMeta, RequirePermissions,
} from '../../common/decorators';
import { UserStatus } from '../../common/enums';
import { AppError } from '../../common/errors';
import { Permission } from '../../common/permissions';
import { iso } from '../../common/utils';
import {
  AuthorizedDeviceEntity, IntegrationConfigEntity, RefreshTokenEntity, UserEntity,
} from '../../database/entities';
import { AuditService } from '../audit/audit.module';

export class RegisterDeviceDto {
  @IsString() employeeName: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() macAddress?: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() deviceModel?: string;
  @IsOptional() @IsBoolean() canControl?: boolean;
}

export class UpdateDeviceDto {
  @IsOptional() @IsString() employeeName?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() macAddress?: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() deviceModel?: string;
  @IsOptional() @IsBoolean() canControl?: boolean;
}

export class RevokeDeviceDto {
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsBoolean() disableUserAccount?: boolean;
}

export class DevicePolicyDto {
  @IsBoolean() enforceWhitelist: boolean;
}

export function normalizeMacAddress(raw?: string | null): string | null {
  if (!raw) return null;
  const hex = raw.trim().toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 12) return null;
  return hex.match(/.{1,2}/g)!.join(':');
}

export function normalizeDeviceId(raw?: string | null): string | null {
  if (!raw) return null;
  const clean = raw.trim().toUpperCase();
  return clean.length >= 4 ? clean : null;
}

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(AuthorizedDeviceEntity) private readonly repo: Repository<AuthorizedDeviceEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity) private readonly rtRepo: Repository<RefreshTokenEntity>,
    @InjectRepository(IntegrationConfigEntity) private readonly configRepo: Repository<IntegrationConfigEntity>,
    private readonly audit: AuditService,
    private readonly cache: AppCacheService,
  ) {}

  async getEnforceWhitelist(): Promise<boolean> {
    return this.cache.getOrSet('devices:policy', 30_000, async () => {
      const row = await this.configRepo.findOne({ where: { id: 1 } });
      const s = (row?.settings ?? {}) as Record<string, unknown>;
      if (typeof s.enforceDeviceWhitelist === 'boolean') {
        return s.enforceDeviceWhitelist;
      }
      // Strict default: ONLY registered employee phones are allowed to access via the mobile app!
      return true;
    });
  }

  async setEnforceWhitelist(enforce: boolean, admin: AuthUser, meta: RequestMeta) {
    let row = await this.configRepo.findOne({ where: { id: 1 } });
    if (!row) {
      row = this.configRepo.create({ id: 1, protocol: 'SIEMENS_S7', settings: {}, secrets: {}, tagMap: {} });
    }
    row.settings = { ...(row.settings ?? {}), enforceDeviceWhitelist: Boolean(enforce) };
    row.updatedBy = admin.username;
    await this.configRepo.save(row);
    this.cache.invalidatePrefix('devices:');
    this.cache.invalidatePrefix('industrial:');

    await this.audit.log({
      userId: admin.id,
      username: admin.username,
      action: 'DEVICE_WHITELIST_POLICY_CHANGE',
      entity: 'authorized_device_policy',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { enforceWhitelist: Boolean(enforce) },
    });
    return { enforceWhitelist: Boolean(enforce) };
  }

  async listDevices() {
    return this.cache.getOrSet('devices:list', 10_000, async () => {
      const [items, enforceWhitelist] = await Promise.all([
        this.repo.find({ order: { createdAt: 'DESC' } }),
        this.getEnforceWhitelist(),
      ]);
      return {
        enforceWhitelist,
        items: items.map((d) => this.toDto(d)),
      };
    });
  }

  async registerDevice(dto: RegisterDeviceDto, admin: AuthUser, meta: RequestMeta) {
    const employeeName = (dto.employeeName || '').trim();
    if (!employeeName) throw AppError.badRequest('اسم الموظف مطلوب');

    const mac = dto.macAddress && dto.macAddress.trim() ? normalizeMacAddress(dto.macAddress) : null;
    if (dto.macAddress && dto.macAddress.trim() && !mac) {
      throw AppError.badRequest('صيغة عنوان الـ MAC Address غير صحيحة (مثال صحيح: AA:BB:CC:DD:EE:FF)');
    }
    const devId = normalizeDeviceId(dto.deviceId);
    if (!mac && !devId) {
      throw AppError.badRequest('يرجى إدخال عنوان MAC Address أو معرّف الجهاز (Device ID)');
    }

    // Check duplicates
    if (mac) {
      const dupMac = await this.repo.findOne({ where: { macAddress: mac } });
      if (dupMac) {
        throw AppError.badRequest(`عنوان الـ MAC (${mac}) مسجّل مسبقاً للموظف: ${dupMac.employeeName}`);
      }
    }
    if (devId) {
      const dupDev = await this.repo.findOne({ where: { deviceId: devId } });
      if (dupDev) {
        throw AppError.badRequest(`معرّف الجهاز (${devId}) مسجّل مسبقاً للموظف: ${dupDev.employeeName}`);
      }
    }

    const saved = await this.repo.save({
      employeeName,
      username: dto.username?.trim() || null,
      macAddress: mac,
      deviceId: devId,
      deviceModel: dto.deviceModel?.trim() || null,
      status: 'ACTIVE',
      canControl: dto.canControl ?? true,
      revokeReason: null,
      revokedBy: null,
      revokedAt: null,
      lastSeenAt: null,
    });
    this.cache.invalidatePrefix('devices:');

    await this.audit.log({
      userId: admin.id,
      username: admin.username,
      action: 'DEVICE_REGISTERED',
      entity: 'authorized_device',
      entityId: saved.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { employeeName, username: saved.username, macAddress: mac, deviceId: devId },
    });

    return this.toDto(saved);
  }

  async updateDevice(id: string, dto: UpdateDeviceDto, admin: AuthUser, meta: RequestMeta) {
    const dev = await this.repo.findOne({ where: { id } });
    if (!dev) throw AppError.notFound('Authorized device');

    if (dto.employeeName !== undefined) {
      const emp = dto.employeeName.trim();
      if (!emp) throw AppError.badRequest('اسم الموظف مطلوب');
      dev.employeeName = emp;
    }

    if (dto.username !== undefined) {
      dev.username = dto.username.trim() || null;
    }

    if (dto.macAddress !== undefined) {
      const trimmedMac = dto.macAddress.trim();
      if (!trimmedMac) {
        dev.macAddress = null;
      } else {
        const mac = normalizeMacAddress(trimmedMac);
        if (!mac) {
          throw AppError.badRequest('صيغة عنوان الـ MAC Address غير صحيحة (مثال صحيح: AA:BB:CC:DD:EE:FF)');
        }
        const dupMac = await this.repo.findOne({ where: { macAddress: mac } });
        if (dupMac && dupMac.id !== dev.id) {
          throw AppError.badRequest(`عنوان الـ MAC (${mac}) مسجّل مسبقاً للموظف: ${dupMac.employeeName}`);
        }
        dev.macAddress = mac;
      }
    }

    if (dto.deviceId !== undefined) {
      const trimmedId = dto.deviceId.trim();
      if (!trimmedId) {
        dev.deviceId = null;
      } else {
        const devId = normalizeDeviceId(trimmedId);
        if (!devId) {
          throw AppError.badRequest('معرّف الجهاز (Device ID) غير صالح');
        }
        const dupDev = await this.repo.findOne({ where: { deviceId: devId } });
        if (dupDev && dupDev.id !== dev.id) {
          throw AppError.badRequest(`معرّف الجهاز (${devId}) مسجّل مسبقاً للموظف: ${dupDev.employeeName}`);
        }
        dev.deviceId = devId;
      }
    }

    if (!dev.macAddress && !dev.deviceId) {
      throw AppError.badRequest('يرجى الإبقاء على عنوان MAC Address أو معرّف الجهاز (Device ID) على الأقل');
    }

    if (dto.deviceModel !== undefined) {
      dev.deviceModel = dto.deviceModel.trim() || null;
    }

    if (dto.canControl !== undefined) {
      dev.canControl = Boolean(dto.canControl);
    }

    const saved = await this.repo.save(dev);
    this.cache.invalidatePrefix('devices:');

    await this.audit.log({
      userId: admin.id,
      username: admin.username,
      action: 'DEVICE_UPDATED',
      entity: 'authorized_device',
      entityId: saved.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: {
        employeeName: saved.employeeName,
        username: saved.username,
        macAddress: saved.macAddress,
        deviceId: saved.deviceId,
        deviceModel: saved.deviceModel,
        canControl: saved.canControl,
      },
    });

    return this.toDto(saved);
  }

  /**
   * Immediately revokes a mobile device upon employee resignation:
   * 1. Marks device REVOKED and canControl = false
   * 2. Immediately invalidates all active refresh tokens of the linked employee
   * 3. Optionally disables the employee's user account too
   */
  async revokeDevice(id: string, dto: RevokeDeviceDto, admin: AuthUser, meta: RequestMeta) {
    const dev = await this.repo.findOne({ where: { id } });
    if (!dev) throw AppError.notFound('Authorized device');

    dev.status = 'REVOKED';
    dev.canControl = false;
    dev.revokedAt = new Date();
    dev.revokedBy = admin.username;
    dev.revokeReason = dto.reason?.trim() || 'استقالة الموظف — إلغاء صلاحية التحكم بالنظام';
    await this.repo.save(dev);

    // Kick out active sessions immediately if linked to a user
    if (dev.username) {
      const linkedUser = await this.usersRepo.findOne({ where: { username: dev.username } });
      if (linkedUser) {
        await this.rtRepo
          .createQueryBuilder()
          .update()
          .set({ revokedAt: new Date() })
          .where('user_id = :uid AND revoked_at IS NULL', { uid: linkedUser.id })
          .execute();
        if (dto.disableUserAccount) {
          linkedUser.status = UserStatus.DISABLED;
          await this.usersRepo.save(linkedUser);
          this.cache.delete(`auth:user:${linkedUser.id}`);
          this.cache.delete(`auth:me:${linkedUser.id}`);
          this.cache.invalidatePrefix('users:');
        }
      }
    }
    this.cache.invalidatePrefix('devices:');

    await this.audit.log({
      userId: admin.id,
      username: admin.username,
      action: 'DEVICE_REVOKED',
      entity: 'authorized_device',
      entityId: dev.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: {
        employeeName: dev.employeeName,
        username: dev.username,
        macAddress: dev.macAddress,
        deviceId: dev.deviceId,
        reason: dev.revokeReason,
        disableUserAccount: Boolean(dto.disableUserAccount),
      },
    });

    return this.toDto(dev);
  }

  async activateDevice(id: string, admin: AuthUser, meta: RequestMeta) {
    const dev = await this.repo.findOne({ where: { id } });
    if (!dev) throw AppError.notFound('Authorized device');

    dev.status = 'ACTIVE';
    dev.canControl = true;
    dev.revokedAt = null;
    dev.revokedBy = null;
    dev.revokeReason = null;
    await this.repo.save(dev);

    if (dev.username) {
      const linkedUser = await this.usersRepo.findOne({ where: { username: dev.username } });
      if (linkedUser && linkedUser.status === UserStatus.DISABLED) {
        linkedUser.status = UserStatus.ACTIVE;
        await this.usersRepo.save(linkedUser);
        this.cache.delete(`auth:user:${linkedUser.id}`);
        this.cache.delete(`auth:me:${linkedUser.id}`);
        this.cache.invalidatePrefix('users:');
      }
    }
    this.cache.invalidatePrefix('devices:');

    await this.audit.log({
      userId: admin.id,
      username: admin.username,
      action: 'DEVICE_ACTIVATED',
      entity: 'authorized_device',
      entityId: dev.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { employeeName: dev.employeeName, macAddress: dev.macAddress, deviceId: dev.deviceId },
    });

    return this.toDto(dev);
  }

  async deleteDevice(id: string, admin: AuthUser, meta: RequestMeta) {
    const dev = await this.repo.findOne({ where: { id } });
    if (!dev) throw AppError.notFound('Authorized device');
    await this.repo.remove(dev);
    this.cache.invalidatePrefix('devices:');

    await this.audit.log({
      userId: admin.id,
      username: admin.username,
      action: 'DEVICE_DELETED',
      entity: 'authorized_device',
      entityId: id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { employeeName: dev.employeeName, macAddress: dev.macAddress, deviceId: dev.deviceId },
    });
    return { deleted: true, id };
  }

  /**
   * Enforces MAC Address & Device ID access control on every mobile login and API request.
   * Desktop admin (`AutoPark.exe`) without `X-Client-Type: mobile` / `X-Device-Id` / `X-Device-Mac` is unaffected.
   */
  async verifyMobileAccess(params: {
    clientType?: string;
    rawDeviceId?: string;
    rawMac?: string;
    username?: string;
    userRole?: string;
    isControlOperation?: boolean;
  }): Promise<void> {
    const isMobile =
      params.clientType?.toLowerCase() === 'mobile' ||
      Boolean(params.rawDeviceId) ||
      Boolean(params.rawMac);
    if (!isMobile) return;

    // When MAC / Device Whitelist enforcement is turned OFF, allow everyone to install & run the app freely
    const enforcePolicy = await this.getEnforceWhitelist();
    if (!enforcePolicy) return;

    // Only defined company employees (not external customers) may access via the mobile app when enforcement is ON
    if (params.userRole && params.userRole.toUpperCase() === 'CUSTOMER') {
      throw new AppError(
        'ONLY_EMPLOYEES_ALLOWED',
        'Access denied: Mobile app access is restricted to registered employees only. / الدخول عبر التطبيق مقتصر على الموظفين المعرّفين في النظام فقط.',
        HttpStatus.FORBIDDEN,
      );
    }

    const mac = normalizeMacAddress(params.rawMac) ?? normalizeMacAddress(params.rawDeviceId);
    const devId = normalizeDeviceId(params.rawDeviceId) ?? normalizeDeviceId(params.rawMac);

    // Search by MAC Address or Device ID in PostgreSQL authorized_devices table
    let matched: AuthorizedDeviceEntity | null = null;
    if (mac) {
      matched = await this.repo.findOne({ where: { macAddress: mac } });
    }
    if (!matched && devId) {
      matched = await this.repo.findOne({ where: { deviceId: devId } });
    }
    if (!matched && mac) {
      matched = await this.repo.findOne({ where: { deviceId: mac } });
    }

    if (matched) {
      if (matched.status === 'REVOKED') {
        throw new AppError(
          'DEVICE_REVOKED',
          `Device access revoked (${matched.employeeName}). / تم إلغاء صلاحية هذا الهاتف من التحكم بنظام Auto Park.${matched.revokeReason ? ' (' + matched.revokeReason + ')' : ''}`,
          HttpStatus.FORBIDDEN,
        );
      }
      if (
        matched.username &&
        params.username &&
        matched.username.toLowerCase() !== params.username.trim().toLowerCase()
      ) {
        throw new AppError(
          'DEVICE_USER_MISMATCH',
          `This phone is registered to employee "${matched.employeeName}" (${matched.username}) only. / هذا الهاتف مسجّل باسم الموظف (${matched.employeeName}) فقط.`,
          HttpStatus.FORBIDDEN,
        );
      }
      if (params.isControlOperation && !matched.canControl) {
        throw new AppError(
          'DEVICE_CONTROL_DISABLED',
          'Control permission is disabled for this device. / هذا الجهاز ممنوع من تحريك المواقف.',
          HttpStatus.FORBIDDEN,
        );
      }

      // Auto-bind deviceId/macAddress on first verified connection
      let dirty = false;
      if (!matched.deviceId && devId) {
        const conflict = await this.repo.findOne({ where: { deviceId: devId } });
        if (!conflict) {
          matched.deviceId = devId;
          dirty = true;
        }
      }
      if (!matched.macAddress && mac) {
        const conflict = await this.repo.findOne({ where: { macAddress: mac } });
        if (!conflict) {
          matched.macAddress = mac;
          dirty = true;
        }
      }
      if (!matched.username && params.username) {
        matched.username = params.username.trim();
        dirty = true;
      }
      matched.lastSeenAt = new Date();
      if (dirty) {
        await this.repo.save(matched);
      } else {
        await this.repo.update({ id: matched.id }, { lastSeenAt: matched.lastSeenAt });
      }
      return;
    }

    // Not found in authorized_devices — check if whitelist enforcement is enabled
    const enforce = await this.getEnforceWhitelist();
    if (enforce) {
      const idHint = mac ? `MAC: ${mac}` : (devId ? `Device ID: ${devId}` : 'Unknown Device');
      throw new AppError(
        'DEVICE_NOT_AUTHORIZED',
        `Device MAC does not match authorized devices in database (${idHint}). / عنوان MAC الخاص بجهازك غير متوافق مع قاعدة البيانات (${idHint}).`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  toDto(d: AuthorizedDeviceEntity) {
    return {
      id: d.id,
      employeeName: d.employeeName,
      username: d.username,
      macAddress: d.macAddress,
      deviceId: d.deviceId,
      deviceModel: d.deviceModel,
      status: d.status,
      canControl: d.canControl,
      revokeReason: d.revokeReason,
      revokedBy: d.revokedBy,
      revokedAt: iso(d.revokedAt),
      lastSeenAt: iso(d.lastSeenAt),
      createdAt: iso(d.createdAt),
    };
  }
}

@Controller('devices')
export class DevicesController {
  constructor(private readonly service: DevicesService) {}

  @Get()
  @RequirePermissions(Permission.USERS_MANAGE)
  list() {
    return this.service.listDevices();
  }

  @Post()
  @RequirePermissions(Permission.USERS_MANAGE)
  register(@Body() dto: RegisterDeviceDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.service.registerDevice(dto, user, meta);
  }

  @Put('policy')
  @RequirePermissions(Permission.USERS_MANAGE)
  updatePolicy(@Body() dto: DevicePolicyDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.service.setEnforceWhitelist(dto.enforceWhitelist, user, meta);
  }

  @Put(':id')
  @RequirePermissions(Permission.USERS_MANAGE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.updateDevice(id, dto, user, meta);
  }

  @Post(':id/revoke')
  @RequirePermissions(Permission.USERS_MANAGE)
  revoke(
    @Param('id') id: string,
    @Body() dto: RevokeDeviceDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.revokeDevice(id, dto ?? {}, user, meta);
  }

  @Post(':id/activate')
  @RequirePermissions(Permission.USERS_MANAGE)
  activate(@Param('id') id: string, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.service.activateDevice(id, user, meta);
  }

  @Delete(':id')
  @RequirePermissions(Permission.USERS_MANAGE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.service.deleteDevice(id, user, meta);
  }
}

@Global()
@Module({
  providers: [DevicesService],
  controllers: [DevicesController],
  exports: [DevicesService],
})
export class DevicesModule {}

import {
  Body, Controller, Delete, Get, HttpCode, Inject, Injectable, Module, Param, Post, Put, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../../config/app.config';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta, RequirePermissions } from '../../common/decorators';
import { Role, UserStatus } from '../../common/enums';
import { AppError } from '../../common/errors';
import { pageParams, paginated, PaginationQuery } from '../../common/pagination';
import { Permission, ROLE_PERMISSIONS } from '../../common/permissions';
import { RefreshTokenEntity, UserEntity } from '../../database/entities';
import { AuditService } from '../audit/audit.module';
import { toUserDto } from '../auth/auth.module';

export class UserFilterQuery extends PaginationQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() role?: Role;
  @IsOptional() @IsString() status?: UserStatus;
}

export class CreateUserDto {
  @IsString() fullName: string;
  @IsString() username: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must contain uppercase, lowercase, and a number',
  })
  password: string;
  @IsEnum(Role) role: Role;
}

export class UpdateUserDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity) private readonly rtRepo: Repository<RefreshTokenEntity>,
    private readonly audit: AuditService,
  ) {}

  async list(q: UserFilterQuery) {
    const { page, limit, skip, take } = pageParams(q);
    const qb = this.usersRepo.createQueryBuilder('u').orderBy('u.created_at', 'DESC').skip(skip).take(take);
    if (q.q) {
      qb.andWhere('(u.full_name ILIKE :q OR u.username ILIKE :q OR u.email ILIKE :q)', { q: `%${q.q}%` });
    }
    if (q.role) qb.andWhere('u.role = :role', { role: q.role });
    if (q.status) qb.andWhere('u.status = :status', { status: q.status });
    const [rows, total] = await qb.getManyAndCount();
    return paginated(rows.map(toUserDto), total, page, limit);
  }

  async findOne(id: string) {
    const u = await this.usersRepo.findOne({ where: { id } });
    if (!u) throw AppError.notFound('User');
    return toUserDto(u);
  }

  async create(dto: CreateUserDto, actor: AuthUser, meta: RequestMeta) {
    if (dto.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw AppError.forbidden('Only a Super Admin can create another Super Admin');
    }
    const rounds = this.cfg.isTest ? 4 : this.cfg.auth.bcryptRounds;
    const saved = await this.usersRepo.save({
      fullName: dto.fullName.trim(),
      username: dto.username.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone?.trim() || null,
      passwordHash: await bcrypt.hash(dto.password, rounds),
      role: dto.role,
      status: UserStatus.ACTIVE,
      language: 'ar',
    });
    await this.audit.log({
      userId: actor.id,
      username: actor.username,
      action: 'USER_CREATE',
      entity: 'user',
      entityId: saved.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { username: saved.username, role: saved.role },
    });
    return toUserDto(saved);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser, meta: RequestMeta) {
    const u = await this.usersRepo.findOne({ where: { id } });
    if (!u) throw AppError.notFound('User');
    if (u.id === actor.id && (dto.status && dto.status !== UserStatus.ACTIVE)) {
      throw AppError.badRequest('You cannot disable your own account');
    }
    if (u.id === actor.id && dto.role && dto.role !== u.role) {
      throw AppError.badRequest('You cannot change your own role');
    }
    if ((dto.role === Role.SUPER_ADMIN || u.role === Role.SUPER_ADMIN) && actor.role !== Role.SUPER_ADMIN) {
      throw AppError.forbidden('Only a Super Admin can modify a Super Admin');
    }

    if (dto.fullName !== undefined) u.fullName = dto.fullName.trim();
    if (dto.email !== undefined) u.email = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) u.phone = dto.phone.trim() || null;
    if (dto.role !== undefined) u.role = dto.role;
    if (dto.status !== undefined) {
      u.status = dto.status;
      if (dto.status === UserStatus.ACTIVE) {
        u.failedLoginAttempts = 0;
        u.lockedUntil = null;
      }
    }
    if (dto.password) {
      const rounds = this.cfg.isTest ? 4 : this.cfg.auth.bcryptRounds;
      u.passwordHash = await bcrypt.hash(dto.password, rounds);
    }

    const saved = await this.usersRepo.save(u);
    if (dto.status === UserStatus.DISABLED || dto.password) {
      await this.rtRepo
        .createQueryBuilder()
        .update()
        .set({ revokedAt: new Date() })
        .where('user_id = :uid AND revoked_at IS NULL', { uid: u.id })
        .execute();
    }

    await this.audit.log({
      userId: actor.id,
      username: actor.username,
      action: 'USER_UPDATE',
      entity: 'user',
      entityId: u.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { role: saved.role, status: saved.status },
    });
    return toUserDto(saved);
  }

  async disable(id: string, actor: AuthUser, meta: RequestMeta) {
    await this.update(id, { status: UserStatus.DISABLED }, actor, meta);
  }

  getRolesMatrix() {
    return Object.values(Role).map((r) => ({
      name: r,
      permissions: ROLE_PERMISSIONS[r],
    }));
  }
}

@Controller()
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('users')
  @RequirePermissions(Permission.USERS_MANAGE)
  list(@Query() q: UserFilterQuery) {
    return this.service.list(q);
  }

  @Get('users/:id')
  @RequirePermissions(Permission.USERS_MANAGE)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('users')
  @RequirePermissions(Permission.USERS_MANAGE)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.service.create(dto, user, meta);
  }

  @Put('users/:id')
  @RequirePermissions(Permission.USERS_MANAGE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.update(id, dto, user, meta);
  }

  @Delete('users/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.USERS_MANAGE)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    await this.service.disable(id, user, meta);
  }

  @Get('roles')
  @RequirePermissions(Permission.USERS_MANAGE)
  roles() {
    return this.service.getRolesMatrix();
  }
}

@Module({
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}

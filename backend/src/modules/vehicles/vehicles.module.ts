import {
  Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Post, Put, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString } from 'class-validator';
import { In, IsNull, Repository } from 'typeorm';
import { AppCacheService } from '../../common/cache.module';
import {
  AuthUser, CurrentUser, ReqMeta, RequestMeta, RequireAnyPermission,
} from '../../common/decorators';
import { ACTIVE_REQUEST_STATUSES } from '../../common/enums';
import { AppError } from '../../common/errors';
import { hasPermission, Permission } from '../../common/permissions';
import { iso, normalizePlate } from '../../common/utils';
import {
  ParkingRequestEntity, ParkingSpaceEntity, UserEntity, VehicleEntity,
} from '../../database/entities';
import { AuditService } from '../audit/audit.module';

export class VehicleQuery {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() q?: string;
}

export class CreateVehicleDto {
  @IsString() plateNumber: string;
  @IsOptional() @IsString() vehicleType?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() userId?: string;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() plateNumber?: string;
  @IsOptional() @IsString() vehicleType?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() color?: string;
}

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(VehicleEntity) private readonly vehRepo: Repository<VehicleEntity>,
    @InjectRepository(ParkingSpaceEntity) private readonly spaceRepo: Repository<ParkingSpaceEntity>,
    @InjectRepository(ParkingRequestEntity) private readonly reqRepo: Repository<ParkingRequestEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    private readonly audit: AuditService,
    private readonly cache: AppCacheService,
  ) {}

  async list(user: AuthUser, q: VehicleQuery) {
    const canAny = hasPermission(user.role, Permission.VEHICLES_MANAGE_ANY) || hasPermission(user.role, Permission.PARKING_REQUEST_ANY);
    const scope = canAny ? `any:${q.userId ?? 'all'}` : `own:${user.id}`;
    const cacheKey = `vehicles:list:${scope}:${(q.q ?? '').trim().toLowerCase()}`;
    return this.cache.getOrSet(cacheKey, 5000, async () => {
      const qb = this.vehRepo
        .createQueryBuilder('v')
        .leftJoinAndSelect('v.user', 'u')
        .where('v.deleted_at IS NULL')
        .orderBy('v.createdAt', 'DESC');

      if (!canAny) {
        qb.andWhere('v.user_id = :uid', { uid: user.id });
      } else if (q.userId) {
        qb.andWhere('v.user_id = :uid', { uid: q.userId });
      }
      if (q.q) {
        qb.andWhere('(v.plate_number ILIKE :q OR v.brand ILIKE :q OR v.model ILIKE :q)', { q: `%${q.q}%` });
      }
      const list = await qb.getMany();
      return this.enrichWithSpaces(list);
    });
  }

  async findOne(id: string, user: AuthUser) {
    const v = await this.vehRepo.findOne({ where: { id, deletedAt: IsNull() }, relations: ['user'] });
    if (!v) throw AppError.notFound('Vehicle', 'VEHICLE_NOT_FOUND');
    const canAny = hasPermission(user.role, Permission.VEHICLES_MANAGE_ANY) || hasPermission(user.role, Permission.PARKING_REQUEST_ANY);
    if (!canAny && v.userId !== user.id) {
      throw AppError.forbidden('You do not have access to this vehicle', 'FORBIDDEN_VEHICLE');
    }
    const [dto] = await this.enrichWithSpaces([v]);
    return dto;
  }

  async create(dto: CreateVehicleDto, user: AuthUser, meta: RequestMeta) {
    const canAny = hasPermission(user.role, Permission.VEHICLES_MANAGE_ANY);
    const ownerId = canAny && dto.userId ? dto.userId : user.id;
    const owner = await this.userRepo.findOne({ where: { id: ownerId } });
    if (!owner) throw AppError.notFound('Vehicle owner');

    const plate = normalizePlate(dto.plateNumber);
    if (!plate) throw AppError.badRequest('Plate number is required');

    const dup = await this.vehRepo.findOne({ where: { plateNumber: plate, deletedAt: IsNull() } });
    if (dup) throw new AppError('CONFLICT', `Vehicle with plate "${plate}" already exists`);

    const saved = await this.vehRepo.save({
      userId: ownerId,
      plateNumber: plate,
      vehicleType: dto.vehicleType?.trim() || 'SEDAN',
      brand: dto.brand?.trim() || null,
      model: dto.model?.trim() || null,
      color: dto.color?.trim() || null,
    });
    saved.user = owner;
    this.cache.invalidatePrefix('vehicles:');

    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'VEHICLE_CREATE',
      entity: 'vehicle',
      entityId: saved.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { plateNumber: saved.plateNumber, ownerId },
    });
    const [out] = await this.enrichWithSpaces([saved]);
    return out;
  }

  async update(id: string, dto: UpdateVehicleDto, user: AuthUser, meta: RequestMeta) {
    const v = await this.vehRepo.findOne({ where: { id, deletedAt: IsNull() }, relations: ['user'] });
    if (!v) throw AppError.notFound('Vehicle', 'VEHICLE_NOT_FOUND');
    const canAny = hasPermission(user.role, Permission.VEHICLES_MANAGE_ANY);
    if (!canAny && v.userId !== user.id) {
      throw AppError.forbidden('You cannot edit another user’s vehicle', 'FORBIDDEN_VEHICLE');
    }

    if (dto.plateNumber !== undefined) {
      const p = normalizePlate(dto.plateNumber);
      if (!p) throw AppError.badRequest('Plate number cannot be empty');
      v.plateNumber = p;
    }
    if (dto.vehicleType !== undefined) v.vehicleType = dto.vehicleType?.trim() || null;
    if (dto.brand !== undefined) v.brand = dto.brand?.trim() || null;
    if (dto.model !== undefined) v.model = dto.model?.trim() || null;
    if (dto.color !== undefined) v.color = dto.color?.trim() || null;

    const saved = await this.vehRepo.save(v);
    this.cache.invalidatePrefix('vehicles:');
    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'VEHICLE_UPDATE',
      entity: 'vehicle',
      entityId: saved.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { plateNumber: saved.plateNumber },
    });
    const [out] = await this.enrichWithSpaces([saved]);
    return out;
  }

  async remove(id: string, user: AuthUser, meta: RequestMeta) {
    const v = await this.vehRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!v) throw AppError.notFound('Vehicle', 'VEHICLE_NOT_FOUND');
    const canAny = hasPermission(user.role, Permission.VEHICLES_MANAGE_ANY);
    if (!canAny && v.userId !== user.id) {
      throw AppError.forbidden('You cannot delete another user’s vehicle', 'FORBIDDEN_VEHICLE');
    }

    const parkedSpace = await this.spaceRepo.findOne({ where: { vehicleId: v.id } });
    if (parkedSpace) {
      throw new AppError('VEHICLE_ALREADY_PARKED', 'Cannot delete a vehicle while it is inside the parking system');
    }
    const activeReq = await this.reqRepo.count({
      where: { vehicleId: v.id, status: In(ACTIVE_REQUEST_STATUSES) },
    });
    if (activeReq > 0) {
      throw new AppError('DUPLICATE_REQUEST', 'Cannot delete a vehicle with an active parking/retrieval request');
    }

    v.deletedAt = new Date();
    await this.vehRepo.save(v);
    this.cache.invalidatePrefix('vehicles:');
    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'VEHICLE_DELETE',
      entity: 'vehicle',
      entityId: v.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { plateNumber: v.plateNumber },
    });
  }

  private async enrichWithSpaces(vehicles: VehicleEntity[]) {
    if (!vehicles.length) return [];
    const ids = vehicles.map((v) => v.id);
    const spaces = await this.spaceRepo.find({ where: { vehicleId: In(ids) } });
    const byVeh = new Map(spaces.map((s) => [s.vehicleId!, s]));
    return vehicles.map((v) => {
      const sp = byVeh.get(v.id);
      return {
        id: v.id,
        userId: v.userId,
        ownerName: v.user?.fullName ?? null,
        plateNumber: v.plateNumber,
        vehicleType: v.vehicleType,
        brand: v.brand,
        model: v.model,
        color: v.color,
        createdAt: iso(v.createdAt),
        parked: Boolean(sp),
        parkingSpace: sp
          ? { id: sp.id, spaceNumber: sp.spaceNumber, level: sp.level, zone: sp.zone }
          : null,
      };
    });
  }
}

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}

  @Get()
  @RequireAnyPermission(Permission.VEHICLES_MANAGE_OWN, Permission.VEHICLES_MANAGE_ANY, Permission.PARKING_VIEW)
  list(@CurrentUser() user: AuthUser, @Query() q: VehicleQuery) {
    return this.service.list(user, q);
  }

  @Get(':id')
  @RequireAnyPermission(Permission.VEHICLES_MANAGE_OWN, Permission.VEHICLES_MANAGE_ANY, Permission.PARKING_VIEW)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequireAnyPermission(Permission.VEHICLES_MANAGE_OWN, Permission.VEHICLES_MANAGE_ANY)
  create(@Body() dto: CreateVehicleDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.service.create(dto, user, meta);
  }

  @Put(':id')
  @RequireAnyPermission(Permission.VEHICLES_MANAGE_OWN, Permission.VEHICLES_MANAGE_ANY)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.update(id, dto, user, meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireAnyPermission(Permission.VEHICLES_MANAGE_OWN, Permission.VEHICLES_MANAGE_ANY)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    await this.service.remove(id, user, meta);
  }
}

@Module({
  providers: [VehiclesService],
  controllers: [VehiclesController],
  exports: [VehiclesService],
})
export class VehiclesModule {}

import {
  Body, Controller, Get, Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Param, Post, Query, Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../../config/app.config';
import { AppCacheService } from '../../common/cache.module';
import {
  AuthUser, CurrentUser, ReqMeta, RequestMeta, RequireAnyPermission, RequirePermissions,
} from '../../common/decorators';
import {
  ACTIVE_REQUEST_STATUSES, AlarmSeverity, CommandStatus, EventCategory, IN_FLIGHT_COMMAND_STATUSES,
  NotificationType, PARK_STEPS, RequestSource, RequestStatus, RequestType, RETRIEVE_STEPS,
  SpaceStatus, TERMINAL_COMMAND_STATUSES,
} from '../../common/enums';
import { AppError } from '../../common/errors';
import { pageParams, paginated, PaginationQuery } from '../../common/pagination';
import { hasPermission, Permission } from '../../common/permissions';
import { datePart, iso, normalizePlate } from '../../common/utils';
import {
  AuditLogEntity, IndustrialCommandEntity, ParkingRequestEntity, ParkingSpaceEntity,
  SystemEventEntity, VehicleEntity,
} from '../../database/entities';
import { AlarmsService } from '../alarms/alarms.module';
import { AuditService } from '../audit/audit.module';
import { CommandFeedback } from '../industrial/industrial-controller.interface';
import { IndustrialIntegrationService } from '../industrial/industrial.service';
import { NotificationsService } from '../notifications/notifications.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/* ─────────────────────────── DTOs ─────────────────────────── */
export class SpacesQuery {
  @IsOptional() @Type(() => Number) @IsInt() level?: number;
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsString() status?: SpaceStatus;
}

export class CreateParkingOperationDto {
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() plateNumber?: string;
  @IsOptional() @IsIn(['MOBILE', 'ADMIN', 'API']) source?: RequestSource;
  @IsOptional() @IsBoolean() isOtherVehicle?: boolean;
  @IsOptional() @IsString() targetSpaceNumber?: string;
}

export class RequestsQuery extends PaginationQuery {
  @IsOptional() @IsString() status?: RequestStatus;
  @IsOptional() @IsString() type?: RequestType;
  @IsOptional() @IsString() active?: string;
}

export class HistoryQuery extends PaginationQuery {
  @IsOptional() @IsIn(['PARK', 'RETRIEVE', 'EVENT', 'AUDIT']) kind?: 'PARK' | 'RETRIEVE' | 'EVENT' | 'AUDIT';
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() format?: string;
}

/* ─────────────────────────── Service ─────────────────────────── */
@Injectable()
export class ParkingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ParkingService.name);
  private ackTimers = new Map<string, NodeJS.Timeout>();
  private completionTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly dataSource: DataSource,
    @InjectRepository(ParkingSpaceEntity) private readonly spaceRepo: Repository<ParkingSpaceEntity>,
    @InjectRepository(ParkingRequestEntity) private readonly reqRepo: Repository<ParkingRequestEntity>,
    @InjectRepository(IndustrialCommandEntity) private readonly cmdRepo: Repository<IndustrialCommandEntity>,
    @InjectRepository(VehicleEntity) private readonly vehRepo: Repository<VehicleEntity>,
    @InjectRepository(SystemEventEntity) private readonly eventRepo: Repository<SystemEventEntity>,
    @InjectRepository(AuditLogEntity) private readonly auditRepo: Repository<AuditLogEntity>,
    private readonly industrial: IndustrialIntegrationService,
    private readonly alarms: AlarmsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly cache: AppCacheService,
  ) {}

  private invalidateParkingCache() {
    this.cache.invalidatePrefix('parking:');
    this.cache.invalidatePrefix('vehicles:');
  }

  onModuleInit() {
    this.industrial.onCommandFeedback((fb) => this.handleCommandFeedback(fb));
  }

  onModuleDestroy() {
    for (const t of this.ackTimers.values()) clearTimeout(t);
    for (const t of this.completionTimers.values()) clearTimeout(t);
    this.ackTimers.clear();
    this.completionTimers.clear();
  }

  /* ─────────────────────────── Dashboard & Spaces ─────────────────────────── */

  async getDashboard() {
    return this.cache.getOrSet('parking:dashboard', 3000, async () => {
      const [system, spaces, alarmCounts, activeRequests] = await Promise.all([
        this.industrial.getSystemStatus(),
        this.spaceRepo.find(),
        this.alarms.countUnresolved(),
        this.reqRepo.count({ where: { status: In(ACTIVE_REQUEST_STATUSES) } }),
      ]);

      const totals = {
        total: spaces.length,
        available: 0,
        occupied: 0,
        reserved: 0,
        moving: 0,
        blocked: 0,
        maintenance: 0,
        error: 0,
      };
      const levelsSet = new Set<number>();
      const zonesSet = new Set<string>();
      for (const s of spaces) {
        levelsSet.add(s.level);
        zonesSet.add(s.zone);
        switch (s.status) {
          case SpaceStatus.AVAILABLE: totals.available++; break;
          case SpaceStatus.OCCUPIED: totals.occupied++; break;
          case SpaceStatus.RESERVED: totals.reserved++; break;
          case SpaceStatus.MOVING: totals.moving++; break;
          case SpaceStatus.BLOCKED: totals.blocked++; break;
          case SpaceStatus.MAINTENANCE: totals.maintenance++; break;
          case SpaceStatus.ERROR: totals.error++; break;
        }
      }

      let health = 100;
      if (!system.controllerConnected) health -= 60;
      if (system.emergencyStop || !system.safetyOk) health -= 50;
      if (alarmCounts.critical > 0) health -= 30;
      else if (alarmCounts.total > 0) health -= 10;
      if (totals.error > 0) health -= Math.min(20, totals.error * 5);
      health = Math.max(0, Math.min(100, health));

      return {
        system,
        totals,
        activeAlarms: alarmCounts.total,
        criticalAlarms: alarmCounts.critical,
        activeRequests,
        health,
        levels: [...levelsSet].sort((a, b) => a - b),
        zones: [...zonesSet].sort(),
      };
    });
  }

  async listSpaces(q: SpacesQuery, viewer?: AuthUser) {
    const cacheKey = `parking:spaces:${q.level ?? 'all'}:${q.zone ?? 'all'}:${q.status ?? 'all'}`;
    const rows = await this.cache.getOrSet(cacheKey, 5000, async () => {
      const qb = this.spaceRepo
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.vehicle', 'v')
        .orderBy('s.level', 'ASC')
        .addOrderBy('s.zone', 'ASC')
        .addOrderBy('s.spaceNumber', 'ASC');
      if (q.level !== undefined) qb.andWhere('s.level = :lvl', { lvl: q.level });
      if (q.zone) qb.andWhere('s.zone = :zn', { zn: q.zone });
      if (q.status) qb.andWhere('s.status = :st', { st: q.status });
      return qb.getMany();
    });
    return rows.map((s) => this.toSpaceDto(s, viewer));
  }

  async getSpace(id: string, viewer?: AuthUser) {
    const s = await this.cache.getOrSet(`parking:space:${id}`, 5000, async () => {
      const found = await this.spaceRepo.findOne({ where: { id }, relations: ['vehicle'] });
      if (!found) throw AppError.notFound('Parking space');
      return found;
    });
    return this.toSpaceDto(s, viewer);
  }

  /* ─────────────────────────── 15-Step Command Safety Workflow ─────────────────────────── */

  async requestPark(dto: CreateParkingOperationDto, user: AuthUser, meta: RequestMeta) {
    return this.executeSafetyWorkflow(RequestType.PARK, dto, user, meta);
  }

  async requestRetrieve(dto: CreateParkingOperationDto, user: AuthUser, meta: RequestMeta) {
    return this.executeSafetyWorkflow(RequestType.RETRIEVE, dto, user, meta);
  }

  private async executeSafetyWorkflow(
    type: RequestType,
    dto: CreateParkingOperationDto,
    user: AuthUser,
    meta: RequestMeta,
  ) {
    // Steps 1 & 2: User authentication & permission check
    const canAny = hasPermission(user.role, Permission.PARKING_REQUEST_ANY);
    if (!dto.vehicleId && !dto.plateNumber) {
      throw AppError.badRequest('Either vehicleId or plateNumber must be provided');
    }

    // Step 3: Input validation & vehicle lookup
    let vehicle: VehicleEntity | null = null;
    if (dto.vehicleId) {
      vehicle = await this.vehRepo.findOne({ where: { id: dto.vehicleId, deletedAt: IsNull() } });
    } else if (dto.plateNumber) {
      const norm = normalizePlate(dto.plateNumber);
      vehicle = await this.vehRepo.findOne({ where: { plateNumber: norm, deletedAt: IsNull() } });
      if (!vehicle && canAny && type === RequestType.PARK) {
        // Staff can register a walk-in visitor plate on the fly when parking
        vehicle = await this.vehRepo.save({
          userId: user.id,
          plateNumber: norm,
          vehicleType: 'SEDAN',
          brand: 'Visitor',
          model: null,
          color: null,
        });
      }
    }
    if (!vehicle) throw AppError.notFound('Vehicle', 'VEHICLE_NOT_FOUND');
    if (!canAny && vehicle.userId !== user.id) {
      throw AppError.forbidden('You are only permitted to operate your own vehicles', 'FORBIDDEN_VEHICLE');
    }

    // Step 4 & 5: System status check & safety state check
    const [sysStatus, hasBlockingAlarm, inFlightCount, runtimeCfg] = await Promise.all([
      this.industrial.getSystemStatus(),
      this.alarms.hasBlockingAlarm(),
      this.cmdRepo.count({ where: { status: In(IN_FLIGHT_COMMAND_STATUSES) } }),
      this.industrial.getRuntimeSettings(),
    ]);

    if (!sysStatus.controllerConnected || !sysStatus.plcConnected) {
      throw new AppError('SYSTEM_OFFLINE', 'Cannot execute command: industrial controller is offline');
    }
    if (sysStatus.emergencyStop) {
      throw new AppError('EMERGENCY_STOP_ACTIVE', 'Cannot execute command: Emergency Stop is active');
    }
    if (!sysStatus.safetyOk) {
      throw new AppError('SAFETY_INTERLOCK', 'Cannot execute command: safety interlock is open');
    }
    if (hasBlockingAlarm) {
      throw new AppError('CRITICAL_ALARM_ACTIVE', 'Cannot execute command while a critical/emergency alarm is active');
    }
    if (!sysStatus.systemReady) {
      throw new AppError('SYSTEM_NOT_READY', 'Industrial system reports NOT READY');
    }
    if (inFlightCount >= this.cfg.industrial.maxConcurrentCommands || sysStatus.machineState === 'BUSY') {
      throw new AppError('MACHINE_BUSY', 'Mechanical transport is currently busy with another operation');
    }
    if (runtimeCfg.settings.readOnly) {
      throw new AppError('CONTROLLER_READ_ONLY', 'Controller is configured in Read-Only monitoring mode');
    }

    // Duplicate command check for this vehicle
    const existingActive = await this.reqRepo.findOne({
      where: { vehicleId: vehicle.id, status: In(ACTIVE_REQUEST_STATUSES) },
    });
    if (existingActive) {
      throw new AppError('DUPLICATE_REQUEST', `Vehicle ${vehicle.plateNumber} already has an active request (${existingActive.requestNumber})`);
    }

    // Space validation & reservation inside a serializable transaction
    const nowIso = new Date().toISOString();
    const requestNumber = `PR-${datePart()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const commandId = `CMD-${datePart()}-${randomBytes(4).toString('hex').toUpperCase()}`;
    const sequence = this.industrial.nextSequence();

    const { reqEntity, cmdEntity, spaceEntity } = await this.dataSource.transaction(async (manager) => {
      let space: ParkingSpaceEntity | null = null;
      if (type === RequestType.PARK) {
        const already = await manager.findOne(ParkingSpaceEntity, { where: { vehicleId: vehicle!.id } });
        if (already) {
          throw new AppError('VEHICLE_ALREADY_PARKED', `Vehicle ${vehicle!.plateNumber} is already parked in space ${already.spaceNumber}`);
        }
        if (dto.targetSpaceNumber) {
          space = await manager
            .createQueryBuilder(ParkingSpaceEntity, 's')
            .setLock('pessimistic_write')
            .where('s.spaceNumber = :sn AND s.status = :st AND s.vehicle_id IS NULL', {
              sn: dto.targetSpaceNumber.trim().toUpperCase(),
              st: SpaceStatus.AVAILABLE,
            })
            .getOne();
        }
        if (!space) {
          space = await manager
            .createQueryBuilder(ParkingSpaceEntity, 's')
            .setLock('pessimistic_write')
            .where('s.status = :st AND s.vehicle_id IS NULL', { st: SpaceStatus.AVAILABLE })
            .orderBy('s.level', 'ASC')
            .addOrderBy('s.zone', 'ASC')
            .addOrderBy('s.spaceNumber', 'ASC')
            .getOne();
        }
        if (!space) {
          throw new AppError('NO_SPACE_AVAILABLE', 'No available parking space found');
        }
        space.status = SpaceStatus.RESERVED;
        space.vehicleId = vehicle!.id;
        space.parkedByUserId = user.id;
        space.parkedByUsername = user.username;
        space.isOtherVehicle = dto.isOtherVehicle !== undefined ? Boolean(dto.isOtherVehicle) : (vehicle!.userId !== user.id);
        await manager.save(ParkingSpaceEntity, space);
      } else {
        space = await manager
          .createQueryBuilder(ParkingSpaceEntity, 's')
          .setLock('pessimistic_write')
          .where('s.vehicle_id = :vid AND s.status = :st', { vid: vehicle!.id, st: SpaceStatus.OCCUPIED })
          .getOne();
        if (!space) {
          throw new AppError('VEHICLE_NOT_PARKED', `Vehicle ${vehicle!.plateNumber} is not currently parked`);
        }
      }

      // Step 6 & 7: Create Command Record & Unique Command ID
      const timeline: Record<string, string> =
        type === RequestType.PARK
          ? { CREATED: nowIso, VALIDATED: nowIso, APPROVED: nowIso }
          : { CREATED: nowIso, VALIDATED: nowIso, VEHICLE_LOCATED: nowIso, PREPARING_SYSTEM: nowIso };

      const cmd = await manager.save(IndustrialCommandEntity, {
        commandId,
        commandType: type,
        requestedBy: user.id,
        vehicleId: vehicle!.id,
        parkingSpaceId: space.id,
        status: CommandStatus.AUTHORIZED,
        payload: {
          commandId,
          sequence,
          type,
          spaceNumber: space.spaceNumber,
          level: space.level,
          zone: space.zone,
          controllerRef: space.controllerRef ?? space.spaceNumber,
          plateNumber: vehicle!.plateNumber,
        },
        progress: 0,
        sendAttempts: 0,
        validatedAt: new Date(),
        authorizedAt: new Date(),
        sentAt: null as Date | null,
        acknowledgedAt: null as Date | null,
        completedAt: null as Date | null,
        errorMessage: null as string | null,
        parkingRequestId: null as string | null,
      });

      const req = await manager.save(ParkingRequestEntity, {
        requestNumber,
        userId: vehicle!.userId,
        vehicleId: vehicle!.id,
        requestType: type,
        source: dto.source ?? RequestSource.MOBILE,
        status: RequestStatus.APPROVED,
        parkingSpaceId: space.id,
        industrialCommandId: cmd.id,
        timeline,
        activeLock: vehicle!.id as string | null,
        errorMessage: null as string | null,
        failedStep: null as string | null,
        completedAt: null as Date | null,
      });

      cmd.parkingRequestId = req.id;
      await manager.save(IndustrialCommandEntity, cmd);

      return { reqEntity: req, cmdEntity: cmd, spaceEntity: space };
    });

    // Step 8: Send Command to Industrial Integration Service
    try {
      cmdEntity.status = CommandStatus.SENT;
      cmdEntity.sentAt = new Date();
      cmdEntity.sendAttempts = 1;
      await this.cmdRepo.save(cmdEntity);

      reqEntity.status = RequestStatus.PROCESSING;
      if (type === RequestType.PARK) {
        reqEntity.timeline = { ...reqEntity.timeline, COMMAND_SENT: new Date().toISOString() };
      }
      await this.reqRepo.save(reqEntity);

      await this.industrial.dispatchCommand({
        commandId: cmdEntity.commandId,
        sequence,
        type,
        spaceNumber: spaceEntity.spaceNumber,
        level: spaceEntity.level,
        zone: spaceEntity.zone,
        controllerRef: spaceEntity.controllerRef ?? spaceEntity.spaceNumber,
        plateNumber: vehicle.plateNumber,
        vehicleId: vehicle.id,
      });

      // Step 9: Start acknowledgement & completion watchdog timers
      this.armTimers(cmdEntity.commandId, runtimeCfg.settings.ackTimeoutMs, runtimeCfg.settings.completionTimeoutMs);
    } catch (err) {
      // Dispatch failed BEFORE physical execution -> safe to roll back reservation
      const msg = (err as Error).message || 'Failed to dispatch command to controller';
      cmdEntity.status = CommandStatus.FAILED;
      cmdEntity.errorMessage = msg;
      cmdEntity.completedAt = new Date();
      await this.cmdRepo.save(cmdEntity);

      reqEntity.status = RequestStatus.FAILED;
      reqEntity.errorMessage = msg;
      reqEntity.failedStep = type === RequestType.PARK ? 'COMMAND_SENT' : 'PREPARING_SYSTEM';
      reqEntity.activeLock = null;
      reqEntity.completedAt = new Date();
      await this.reqRepo.save(reqEntity);

      if (type === RequestType.PARK) {
        spaceEntity.status = SpaceStatus.AVAILABLE;
        spaceEntity.vehicleId = null;
        await this.spaceRepo.save(spaceEntity);
      }
      throw err;
    }

    // Step 13 & 15: Broadcast & Audit
    const fullDto = await this.getRequest(reqEntity.id, user);
    this.realtime.emitToUserAndStaff(reqEntity.userId, 'parking.request.created', fullDto);
    this.realtime.emitToAll('parking.space.updated', await this.getSpace(spaceEntity.id));
    this.invalidateParkingCache();
    this.realtime.emitToStaff('command.updated', await this.industrial.getCommand(cmdEntity.id));

    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: type === RequestType.PARK ? 'PARKING_REQUEST_CREATE' : 'RETRIEVAL_REQUEST_CREATE',
      entity: 'parking_request',
      entityId: reqEntity.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: {
        requestNumber: reqEntity.requestNumber,
        commandId: cmdEntity.commandId,
        plateNumber: vehicle.plateNumber,
        spaceNumber: spaceEntity.spaceNumber,
      },
    });

    return fullDto;
  }

  /* ─────────────────────────── Controller Feedback & Timeouts ─────────────────────────── */

  private armTimers(commandId: string, ackTimeoutMs: number, completionTimeoutMs: number) {
    const ackTimer = setTimeout(() => void this.handleTimeout(commandId, 'ACK'), ackTimeoutMs);
    ackTimer.unref?.();
    this.ackTimers.set(commandId, ackTimer);

    const compTimer = setTimeout(() => void this.handleTimeout(commandId, 'COMPLETION'), completionTimeoutMs);
    compTimer.unref?.();
    this.completionTimers.set(commandId, compTimer);
  }

  private clearTimer(map: Map<string, NodeJS.Timeout>, commandId: string) {
    const t = map.get(commandId);
    if (t) {
      clearTimeout(t);
      map.delete(commandId);
    }
  }

  private async handleTimeout(commandId: string, stage: 'ACK' | 'COMPLETION') {
    this.clearTimer(this.ackTimers, commandId);
    if (stage === 'COMPLETION') this.clearTimer(this.completionTimers, commandId);

    const cmd = await this.cmdRepo.findOne({ where: { commandId } });
    if (!cmd || TERMINAL_COMMAND_STATUSES.includes(cmd.status)) return;
    if (stage === 'ACK' && cmd.status !== CommandStatus.SENT) return;

    this.clearTimer(this.completionTimers, commandId);
    const reason =
      stage === 'ACK'
        ? 'Controller did not acknowledge command within timeout (command NOT resent automatically for safety)'
        : 'Controller did not report command completion within timeout';

    cmd.status = CommandStatus.TIMEOUT;
    cmd.errorMessage = reason;
    cmd.completedAt = new Date();
    await this.cmdRepo.save(cmd);

    if (cmd.parkingRequestId) {
      const req = await this.reqRepo.findOne({ where: { id: cmd.parkingRequestId } });
      if (req && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(req.status)) {
        req.status = RequestStatus.FAILED;
        req.errorMessage = reason;
        req.failedStep = stage === 'ACK' ? 'CONTROLLER_CONFIRMED' : 'VEHICLE_MOVING';
        req.activeLock = null;
        req.completedAt = new Date();
        await this.reqRepo.save(req);

        if (cmd.parkingSpaceId) {
          const sp = await this.spaceRepo.findOne({ where: { id: cmd.parkingSpaceId } });
          if (sp) {
            if (stage === 'ACK' && req.requestType === RequestType.PARK) {
              // No acknowledgement -> vehicle has not moved, release reservation
              sp.status = SpaceStatus.AVAILABLE;
              sp.vehicleId = null;
            } else {
              // Timed out after acknowledgement -> mark space ERROR until operator inspects
              sp.status = SpaceStatus.ERROR;
              sp.statusReason = reason;
            }
            await this.spaceRepo.save(sp);
            this.invalidateParkingCache();
            this.realtime.emitToAll('parking.space.updated', await this.getSpace(sp.id));
          }
        }

        const dto = await this.loadRequestDto(req.id);
        this.realtime.emitToUserAndStaff(req.userId, 'parking.request.updated', dto);
        await this.notifications.notifyUser(
          req.userId,
          NotificationType.REQUEST_FAILED,
          'Operation Timeout',
          reason,
          { requestId: req.id, commandId: cmd.commandId },
        );
      }
    }
    this.realtime.emitToStaff('command.updated', await this.industrial.getCommand(cmd.id));
    await this.audit.recordEvent({
      eventType: 'COMMAND_TIMEOUT',
      category: EventCategory.ERROR,
      severity: AlarmSeverity.WARNING,
      message: `${cmd.commandId}: ${reason}`,
      source: 'SAFETY_WATCHDOG',
    });
  }

  private async handleCommandFeedback(fb: CommandFeedback) {
    const cmd = await this.cmdRepo.findOne({ where: { commandId: fb.commandId } });
    if (!cmd || TERMINAL_COMMAND_STATUSES.includes(cmd.status)) return;

    const now = new Date();
    const nowIso = now.toISOString();
    cmd.controllerResponse = (fb.raw ?? { status: fb.status, progress: fb.progress, phase: fb.phase }) as Record<string, unknown>;
    if (fb.progress !== undefined) cmd.progress = fb.progress;
    if (fb.phase !== undefined) cmd.phase = fb.phase;

    const req = cmd.parkingRequestId ? await this.reqRepo.findOne({ where: { id: cmd.parkingRequestId } }) : null;
    const sp = cmd.parkingSpaceId ? await this.spaceRepo.findOne({ where: { id: cmd.parkingSpaceId } }) : null;
    const veh = cmd.vehicleId ? await this.vehRepo.findOne({ where: { id: cmd.vehicleId } }) : null;

    if (fb.status === 'ACKNOWLEDGED') {
      this.clearTimer(this.ackTimers, cmd.commandId);
      cmd.status = CommandStatus.ACKNOWLEDGED;
      cmd.acknowledgedAt = cmd.acknowledgedAt ?? now;
      await this.cmdRepo.save(cmd);

      if (req) {
        req.status = RequestStatus.PROCESSING;
        req.timeline = {
          ...req.timeline,
          ...(req.requestType === RequestType.PARK
            ? { CONTROLLER_CONFIRMED: nowIso }
            : { PLATFORM_MOVING: nowIso }),
        };
        await this.reqRepo.save(req);
        this.realtime.emitToUserAndStaff(req.userId, 'parking.request.updated', await this.loadRequestDto(req.id));
      }
      this.realtime.emitToStaff('command.updated', await this.industrial.getCommand(cmd.id));
      return;
    }

    if (fb.status === 'EXECUTING') {
      this.clearTimer(this.ackTimers, cmd.commandId);
      cmd.status = CommandStatus.EXECUTING;
      cmd.acknowledgedAt = cmd.acknowledgedAt ?? now;
      await this.cmdRepo.save(cmd);

      if (sp && sp.status !== SpaceStatus.MOVING) {
        sp.status = SpaceStatus.MOVING;
        await this.spaceRepo.save(sp);
        this.invalidateParkingCache();
        this.realtime.emitToAll('parking.space.updated', await this.getSpace(sp.id));
      }

      if (req) {
        const tl = { ...req.timeline };
        if (req.requestType === RequestType.PARK) {
          tl.CONTROLLER_CONFIRMED = tl.CONTROLLER_CONFIRMED ?? nowIso;
          tl.VEHICLE_MOVING = tl.VEHICLE_MOVING ?? nowIso;
        } else {
          tl.PLATFORM_MOVING = tl.PLATFORM_MOVING ?? nowIso;
          tl.RETRIEVAL_IN_PROGRESS = tl.RETRIEVAL_IN_PROGRESS ?? nowIso;
        }
        req.status = RequestStatus.IN_PROGRESS;
        req.timeline = tl;
        await this.reqRepo.save(req);

        this.realtime.emitToUserAndStaff(req.userId, 'vehicle.moving', {
          requestId: req.id,
          requestType: req.requestType,
          plateNumber: veh?.plateNumber ?? '',
          spaceNumber: sp?.spaceNumber ?? '',
          progress: cmd.progress,
          phase: cmd.phase,
        });
        this.realtime.emitToUserAndStaff(req.userId, 'parking.request.updated', await this.loadRequestDto(req.id));
      }
      this.realtime.emitToStaff('command.updated', await this.industrial.getCommand(cmd.id));
      return;
    }

    if (fb.status === 'COMPLETED') {
      this.clearTimer(this.ackTimers, cmd.commandId);
      this.clearTimer(this.completionTimers, cmd.commandId);
      cmd.status = CommandStatus.COMPLETED;
      cmd.progress = 100;
      cmd.acknowledgedAt = cmd.acknowledgedAt ?? now;
      cmd.completedAt = now;
      await this.cmdRepo.save(cmd);

      if (sp && req) {
        if (req.requestType === RequestType.PARK) {
          sp.status = SpaceStatus.OCCUPIED;
          sp.vehicleId = req.vehicleId;
        } else {
          sp.status = SpaceStatus.AVAILABLE;
          sp.vehicleId = null;
          sp.parkedByUserId = null;
          sp.parkedByUsername = null;
          sp.isOtherVehicle = false;
        }
        sp.statusReason = null;
        await this.spaceRepo.save(sp);
        this.invalidateParkingCache();
        this.realtime.emitToAll('parking.space.updated', await this.getSpace(sp.id));
      }

      if (req) {
        const tl = { ...req.timeline };
        if (req.requestType === RequestType.PARK) {
          tl.CONTROLLER_CONFIRMED = tl.CONTROLLER_CONFIRMED ?? nowIso;
          tl.VEHICLE_MOVING = tl.VEHICLE_MOVING ?? nowIso;
          tl.PARKING_COMPLETED = nowIso;
        } else {
          tl.PLATFORM_MOVING = tl.PLATFORM_MOVING ?? nowIso;
          tl.RETRIEVAL_IN_PROGRESS = tl.RETRIEVAL_IN_PROGRESS ?? nowIso;
          tl.VEHICLE_READY = nowIso;
        }
        req.status = RequestStatus.COMPLETED;
        req.timeline = tl;
        req.activeLock = null;
        req.completedAt = now;
        await this.reqRepo.save(req);

        const dto = await this.loadRequestDto(req.id);
        this.realtime.emitToUserAndStaff(req.userId, 'parking.request.updated', dto);
        this.realtime.emitToUserAndStaff(
          req.userId,
          req.requestType === RequestType.PARK ? 'vehicle.parked' : 'vehicle.retrieved',
          dto,
        );

        await this.notifications.notifyUser(
          req.userId,
          req.requestType === RequestType.PARK
            ? NotificationType.PARKING_COMPLETED
            : NotificationType.VEHICLE_READY,
          req.requestType === RequestType.PARK ? 'Parking Completed' : 'Vehicle Ready for Pickup',
          req.requestType === RequestType.PARK
            ? `Vehicle ${veh?.plateNumber ?? ''} is safely parked in space ${sp?.spaceNumber ?? ''}.`
            : `Vehicle ${veh?.plateNumber ?? ''} has arrived at the exit bay and is ready.`,
          { requestId: req.id, requestNumber: req.requestNumber, spaceNumber: sp?.spaceNumber },
        );

        await this.audit.recordEvent({
          eventType: req.requestType === RequestType.PARK ? 'VEHICLE_PARKED' : 'VEHICLE_RETRIEVED',
          category: EventCategory.MACHINE,
          severity: AlarmSeverity.INFO,
          message: `${req.requestType} completed for ${veh?.plateNumber ?? ''} (${sp?.spaceNumber ?? ''})`,
          source: 'CONTROLLER',
        });
      }
      this.realtime.emitToStaff('command.updated', await this.industrial.getCommand(cmd.id));
      return;
    }

    if (fb.status === 'FAILED') {
      this.clearTimer(this.ackTimers, cmd.commandId);
      this.clearTimer(this.completionTimers, cmd.commandId);
      const errMsg = fb.errorMessage || 'Controller reported command failure';
      cmd.status = CommandStatus.FAILED;
      cmd.errorMessage = errMsg;
      cmd.completedAt = now;
      await this.cmdRepo.save(cmd);

      if (sp && req) {
        if (fb.noMovement) {
          sp.status = req.requestType === RequestType.PARK ? SpaceStatus.AVAILABLE : SpaceStatus.OCCUPIED;
          sp.vehicleId = req.requestType === RequestType.PARK ? null : req.vehicleId;
          if (req.requestType === RequestType.PARK) {
            sp.parkedByUserId = null;
            sp.parkedByUsername = null;
            sp.isOtherVehicle = false;
          }
        } else {
          sp.status = SpaceStatus.ERROR;
          sp.statusReason = errMsg;
        }
        await this.spaceRepo.save(sp);
        this.invalidateParkingCache();
        this.realtime.emitToAll('parking.space.updated', await this.getSpace(sp.id));
      }

      if (req) {
        req.status = RequestStatus.FAILED;
        req.errorMessage = errMsg;
        req.failedStep = req.requestType === RequestType.PARK ? 'VEHICLE_MOVING' : 'RETRIEVAL_IN_PROGRESS';
        req.activeLock = null;
        req.completedAt = now;
        await this.reqRepo.save(req);

        const dto = await this.loadRequestDto(req.id);
        this.realtime.emitToUserAndStaff(req.userId, 'parking.request.updated', dto);
        await this.notifications.notifyUser(
          req.userId,
          NotificationType.REQUEST_FAILED,
          'Operation Failed',
          errMsg,
          { requestId: req.id, commandId: cmd.commandId },
        );
      }
      this.realtime.emitToStaff('command.updated', await this.industrial.getCommand(cmd.id));
    }
  }

  /* ─────────────────────────── Requests & History Queries ─────────────────────────── */

  async cancelRequest(id: string, user: AuthUser, meta: RequestMeta) {
    const req = await this.reqRepo.findOne({ where: { id }, relations: ['command', 'parkingSpace'] });
    if (!req) throw AppError.notFound('Parking request');
    const canAny = hasPermission(user.role, Permission.PARKING_REQUEST_ANY);
    if (!canAny && req.userId !== user.id) {
      throw AppError.forbidden('You cannot cancel another user’s request');
    }
    if (req.command && IN_FLIGHT_COMMAND_STATUSES.concat([CommandStatus.COMPLETED]).includes(req.command.status)) {
      throw new AppError(
        'COMMAND_ALREADY_SENT',
        'Cannot cancel request after command has been sent to the industrial controller',
      );
    }
    req.status = RequestStatus.CANCELLED;
    req.activeLock = null;
    req.completedAt = new Date();
    await this.reqRepo.save(req);

    if (req.command) {
      req.command.status = CommandStatus.CANCELLED;
      req.command.completedAt = new Date();
      await this.cmdRepo.save(req.command);
    }
    if (req.parkingSpace && req.requestType === RequestType.PARK && req.parkingSpace.status === SpaceStatus.RESERVED) {
      req.parkingSpace.status = SpaceStatus.AVAILABLE;
      req.parkingSpace.vehicleId = null;
      req.parkingSpace.parkedByUserId = null;
      req.parkingSpace.parkedByUsername = null;
      req.parkingSpace.isOtherVehicle = false;
      await this.spaceRepo.save(req.parkingSpace);
      this.invalidateParkingCache();
      this.realtime.emitToAll('parking.space.updated', await this.getSpace(req.parkingSpace.id));
    }
    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'PARKING_REQUEST_CANCEL',
      entity: 'parking_request',
      entityId: req.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    const dto = await this.loadRequestDto(req.id);
    this.realtime.emitToUserAndStaff(req.userId, 'parking.request.updated', dto);
    return dto;
  }

  async listRequests(user: AuthUser, q: RequestsQuery) {
    const { page, limit, skip, take } = pageParams(q);
    const canAll = hasPermission(user.role, Permission.HISTORY_VIEW_ALL) || hasPermission(user.role, Permission.PARKING_REQUEST_ANY);
    const qb = this.reqRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.vehicle', 'v')
      .leftJoinAndSelect('r.user', 'u')
      .leftJoinAndSelect('r.parkingSpace', 's')
      .leftJoinAndSelect('r.command', 'c')
      .leftJoinAndSelect('c.requestedByUser', 'cu')
      .orderBy('r.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (!canAll) qb.andWhere('r.user_id = :uid', { uid: user.id });
    if (q.status) qb.andWhere('r.status = :st', { st: q.status });
    if (q.type) qb.andWhere('r.request_type = :tp', { tp: q.type });
    if (q.active === 'true') qb.andWhere('r.status IN (:...act)', { act: ACTIVE_REQUEST_STATUSES });
    const [rows, total] = await qb.getManyAndCount();
    return paginated(rows.map((r) => this.toRequestDto(r)), total, page, limit);
  }

  async getRequest(id: string, user: AuthUser) {
    const r = await this.reqRepo.findOne({
      where: { id },
      relations: ['vehicle', 'user', 'parkingSpace', 'command', 'command.requestedByUser'],
    });
    if (!r) throw AppError.notFound('Parking request');
    const canAll = hasPermission(user.role, Permission.HISTORY_VIEW_ALL) || hasPermission(user.role, Permission.PARKING_REQUEST_ANY);
    if (!canAll && r.userId !== user.id) {
      throw AppError.forbidden('You do not have access to this parking request');
    }
    return this.toRequestDto(r);
  }

  async getVehicleHistory(vehicleId: string, user: AuthUser) {
    const v = await this.vehRepo.findOne({ where: { id: vehicleId } });
    if (!v) throw AppError.notFound('Vehicle', 'VEHICLE_NOT_FOUND');
    const canAll = hasPermission(user.role, Permission.HISTORY_VIEW_ALL) || hasPermission(user.role, Permission.VEHICLES_MANAGE_ANY);
    if (!canAll && v.userId !== user.id) {
      throw AppError.forbidden('You do not have access to this vehicle', 'FORBIDDEN_VEHICLE');
    }
    const rows = await this.reqRepo.find({
      where: { vehicleId },
      relations: ['vehicle', 'user', 'parkingSpace', 'command', 'command.requestedByUser'],
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((r) => this.toRequestDto(r));
  }

  async getHistory(user: AuthUser, q: HistoryQuery) {
    const { page, limit, skip, take } = pageParams(q);
    const canAll = hasPermission(user.role, Permission.HISTORY_VIEW_ALL);
    const items: Array<{
      id: string;
      kind: 'PARK' | 'RETRIEVE' | 'EVENT' | 'AUDIT';
      title: string;
      description: string | null;
      plateNumber: string | null;
      status: string | null;
      actor: string | null;
      createdAt: string;
      refId: string | null;
    }> = [];

    if (!q.kind || q.kind === 'PARK' || q.kind === 'RETRIEVE') {
      const rqb = this.reqRepo
        .createQueryBuilder('r')
        .leftJoinAndSelect('r.vehicle', 'v')
        .leftJoinAndSelect('r.user', 'u')
        .leftJoinAndSelect('r.parkingSpace', 's')
        .orderBy('r.createdAt', 'DESC')
        .take(200);
      if (!canAll) rqb.andWhere('r.user_id = :uid', { uid: user.id });
      if (q.kind) rqb.andWhere('r.request_type = :kt', { kt: q.kind });
      if (q.from) rqb.andWhere('r.created_at >= :from', { from: new Date(q.from) });
      if (q.to) rqb.andWhere('r.created_at <= :to', { to: new Date(q.to) });
      if (q.q) rqb.andWhere('(r.request_number ILIKE :q OR v.plate_number ILIKE :q)', { q: `%${q.q}%` });
      const reqs = await rqb.getMany();
      for (const r of reqs) {
        items.push({
          id: r.id,
          kind: r.requestType,
          title: `${r.requestType} ${r.vehicle?.plateNumber ?? ''} (${r.requestNumber})`,
          description: r.parkingSpace ? `Space ${r.parkingSpace.spaceNumber}` : r.errorMessage,
          plateNumber: r.vehicle?.plateNumber ?? null,
          status: r.status,
          actor: r.user?.fullName ?? null,
          createdAt: iso(r.createdAt)!,
          refId: r.id,
        });
      }
    }

    if (canAll && (!q.kind || q.kind === 'EVENT')) {
      const eqb = this.eventRepo.createQueryBuilder('e').orderBy('e.created_at', 'DESC').take(100);
      if (q.from) eqb.andWhere('e.created_at >= :from', { from: new Date(q.from) });
      if (q.to) eqb.andWhere('e.created_at <= :to', { to: new Date(q.to) });
      if (q.q) eqb.andWhere('(e.event_type ILIKE :q OR e.message ILIKE :q)', { q: `%${q.q}%` });
      const evs = await eqb.getMany();
      for (const e of evs) {
        items.push({
          id: e.id,
          kind: 'EVENT',
          title: e.eventType,
          description: e.message,
          plateNumber: null,
          status: e.severity,
          actor: e.source,
          createdAt: iso(e.createdAt)!,
          refId: e.id,
        });
      }
    }

    if (canAll && hasPermission(user.role, Permission.AUDIT_VIEW) && (!q.kind || q.kind === 'AUDIT')) {
      const aqb = this.auditRepo.createQueryBuilder('a').orderBy('a.created_at', 'DESC').take(100);
      if (q.from) aqb.andWhere('a.created_at >= :from', { from: new Date(q.from) });
      if (q.to) aqb.andWhere('a.created_at <= :to', { to: new Date(q.to) });
      if (q.q) aqb.andWhere('(a.action ILIKE :q OR a.username ILIKE :q)', { q: `%${q.q}%` });
      const auds = await aqb.getMany();
      for (const a of auds) {
        items.push({
          id: a.id,
          kind: 'AUDIT',
          title: a.action,
          description: a.entity ? `${a.entity} ${a.entityId ?? ''}`.trim() : null,
          plateNumber: null,
          status: 'LOGGED',
          actor: a.username,
          createdAt: iso(a.createdAt)!,
          refId: a.entityId,
        });
      }
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const paged = items.slice(skip, skip + take);
    return paginated(paged, total, page, limit);
  }

  /* ─────────────────────────── Mapping Helpers ─────────────────────────── */

  private async loadRequestDto(id: string) {
    const r = await this.reqRepo.findOne({
      where: { id },
      relations: ['vehicle', 'user', 'parkingSpace', 'command', 'command.requestedByUser'],
    });
    return this.toRequestDto(r!);
  }

  private toSpaceDto(s: ParkingSpaceEntity, viewer?: AuthUser) {
    let colorCategory: 'GREEN_EMPTY' | 'YELLOW_MY_CAR' | 'PURPLE_PARKED_OTHER' | 'RED_COLLEAGUE' = 'GREEN_EMPTY';
    if (s.status !== SpaceStatus.AVAILABLE) {
      const parkedByMe = Boolean(
        viewer &&
          ((s.parkedByUserId && s.parkedByUserId === viewer.id) ||
            (s.parkedByUsername && s.parkedByUsername.toLowerCase() === viewer.username.toLowerCase())),
      );
      const ownedByMe = Boolean(viewer && s.vehicle?.userId && s.vehicle.userId === viewer.id);
      if (parkedByMe) {
        colorCategory = s.isOtherVehicle ? 'PURPLE_PARKED_OTHER' : 'YELLOW_MY_CAR';
      } else if (!s.parkedByUserId && ownedByMe) {
        colorCategory = 'YELLOW_MY_CAR';
      } else {
        colorCategory = 'RED_COLLEAGUE';
      }
    }

    return {
      id: s.id,
      spaceNumber: s.spaceNumber,
      level: s.level,
      zone: s.zone,
      status: s.status,
      vehicle: s.vehicle
        ? { id: s.vehicle.id, plateNumber: s.vehicle.plateNumber, userId: s.vehicle.userId }
        : null,
      parkedByUserId: s.parkedByUserId ?? null,
      parkedByUsername: s.parkedByUsername ?? null,
      isOtherVehicle: Boolean(s.isOtherVehicle),
      colorCategory,
      updatedAt: iso(s.updatedAt),
    };
  }

  private toRequestDto(r: ParkingRequestEntity) {
    const keys = r.requestType === RequestType.PARK ? PARK_STEPS : RETRIEVE_STEPS;
    const tl = r.timeline ?? {};
    const finalKey = keys[keys.length - 1];

    // CRITICAL SAFETY RULE: The final step is ONLY marked DONE when request.status === COMPLETED
    const steps = keys.map((key, idx) => {
      if (key === finalKey) {
        if (r.status === RequestStatus.COMPLETED) {
          return { key, status: 'DONE' as const, at: tl[key] ?? iso(r.completedAt) };
        }
        if (r.status === RequestStatus.FAILED && r.failedStep === key) {
          return { key, status: 'FAILED' as const, at: iso(r.completedAt) };
        }
        return { key, status: 'PENDING' as const, at: null };
      }
      if (r.status === RequestStatus.FAILED && r.failedStep === key) {
        return { key, status: 'FAILED' as const, at: tl[key] ?? iso(r.completedAt) };
      }
      if (tl[key]) {
        const nextKey = keys[idx + 1];
        const nextReached = nextKey === finalKey ? r.status === RequestStatus.COMPLETED : Boolean(tl[nextKey]);
        const isActive = !nextReached && ACTIVE_REQUEST_STATUSES.includes(r.status);
        return { key, status: (isActive ? 'ACTIVE' : 'DONE') as 'ACTIVE' | 'DONE', at: tl[key] };
      }
      return { key, status: 'PENDING' as const, at: null };
    });

    return {
      id: r.id,
      requestNumber: r.requestNumber,
      requestType: r.requestType,
      status: r.status,
      source: r.source,
      vehicle: {
        id: r.vehicleId,
        plateNumber: r.vehicle?.plateNumber ?? '',
        brand: r.vehicle?.brand ?? null,
        model: r.vehicle?.model ?? null,
        color: r.vehicle?.color ?? null,
      },
      user: {
        id: r.userId,
        fullName: r.user?.fullName ?? '',
      },
      parkingSpace: r.parkingSpace
        ? {
            id: r.parkingSpace.id,
            spaceNumber: r.parkingSpace.spaceNumber,
            level: r.parkingSpace.level,
            zone: r.parkingSpace.zone,
          }
        : null,
      command: r.command ? this.industrial.toCommandDto(r.command) : null,
      steps,
      errorMessage: r.errorMessage,
      createdAt: iso(r.createdAt),
      completedAt: iso(r.completedAt),
    };
  }
}

/* ─────────────────────────── Controller ─────────────────────────── */
@Controller()
export class ParkingController {
  constructor(private readonly service: ParkingService) {}

  @Get('dashboard')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  dashboard() {
    return this.service.getDashboard();
  }

  @Get('parking/spaces')
  @RequirePermissions(Permission.PARKING_VIEW)
  listSpaces(@Query() q: SpacesQuery, @CurrentUser() user: AuthUser) {
    return this.service.listSpaces(q, user);
  }

  @Get('parking/spaces/:id')
  @RequirePermissions(Permission.PARKING_VIEW)
  getSpace(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getSpace(id, user);
  }

  @Post('parking/request')
  @RequireAnyPermission(Permission.PARKING_REQUEST, Permission.PARKING_REQUEST_ANY)
  requestPark(@Body() dto: CreateParkingOperationDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.service.requestPark(dto, user, meta);
  }

  @Post('parking/retrieve')
  @RequireAnyPermission(Permission.PARKING_REQUEST, Permission.PARKING_REQUEST_ANY)
  requestRetrieve(@Body() dto: CreateParkingOperationDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.service.requestRetrieve(dto, user, meta);
  }

  @Get('parking/requests')
  @RequirePermissions(Permission.PARKING_VIEW)
  listRequests(@CurrentUser() user: AuthUser, @Query() q: RequestsQuery) {
    return this.service.listRequests(user, q);
  }

  @Get('parking/requests/:id')
  @RequirePermissions(Permission.PARKING_VIEW)
  getRequest(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getRequest(id, user);
  }

  @Post('parking/requests/:id/cancel')
  @RequireAnyPermission(Permission.PARKING_REQUEST, Permission.PARKING_REQUEST_ANY)
  cancelRequest(@Param('id') id: string, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.service.cancelRequest(id, user, meta);
  }

  @Get('vehicles/:id/history')
  @RequireAnyPermission(Permission.VEHICLES_MANAGE_OWN, Permission.VEHICLES_MANAGE_ANY, Permission.HISTORY_VIEW_ALL)
  vehicleHistory(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getVehicleHistory(id, user);
  }

  @Get('history')
  @RequireAnyPermission(Permission.HISTORY_VIEW_OWN, Permission.HISTORY_VIEW_ALL)
  history(@CurrentUser() user: AuthUser, @Query() q: HistoryQuery) {
    return this.service.getHistory(user, q);
  }

  @Get('history/export')
  @RequireAnyPermission(Permission.HISTORY_VIEW_OWN, Permission.HISTORY_VIEW_ALL)
  async exportHistory(@CurrentUser() user: AuthUser, @Query() q: HistoryQuery, @Res() res: Response) {
    const data = await this.service.getHistory(user, { ...q, page: 1, limit: 100 });
    const escapeCsv = (v: unknown) => {
      const raw = String(v ?? '');
      // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR)
      const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [
      'id,kind,title,description,plateNumber,status,actor,createdAt',
      ...data.items.map((i) =>
        [i.id, i.kind, i.title, i.description, i.plateNumber, i.status, i.actor, i.createdAt]
          .map(escapeCsv)
          .join(','),
      ),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="autopark-history.csv"');
    res.send(lines.join('\n'));
  }
}

@Module({
  providers: [ParkingService],
  controllers: [ParkingController],
  exports: [ParkingService],
})
export class ParkingModule {}

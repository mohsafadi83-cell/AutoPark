import { Controller, Get, Injectable, Module, Global, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString } from 'class-validator';
import { Repository } from 'typeorm';
import { RequireAnyPermission, RequirePermissions } from '../../common/decorators';
import { AlarmSeverity, EventCategory } from '../../common/enums';
import { Paginated, pageParams, paginated, PaginationQuery } from '../../common/pagination';
import { Permission } from '../../common/permissions';
import { iso } from '../../common/utils';
import { AuditLogEntity, SystemEventEntity } from '../../database/entities';

export class AuditFilterQuery extends PaginationQuery {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

export class EventFilterQuery extends PaginationQuery {
  @IsOptional() @IsString() category?: EventCategory;
  @IsOptional() @IsString() severity?: AlarmSeverity;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity) private readonly auditRepo: Repository<AuditLogEntity>,
    @InjectRepository(SystemEventEntity) private readonly eventRepo: Repository<SystemEventEntity>,
  ) {}

  async log(entry: {
    userId?: string | null;
    username?: string | null;
    action: string;
    entity?: string | null;
    entityId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    details?: Record<string, unknown> | null;
  }) {
    return this.auditRepo.save({
      userId: entry.userId ?? null,
      username: entry.username ?? null,
      action: entry.action,
      entity: entry.entity ?? null,
      entityId: entry.entityId ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      details: entry.details ?? null,
    });
  }

  async recordEvent(entry: {
    eventType: string;
    category: EventCategory;
    severity?: AlarmSeverity;
    message: string;
    source?: string;
    data?: Record<string, unknown> | null;
  }) {
    return this.eventRepo.save({
      eventType: entry.eventType,
      category: entry.category,
      severity: entry.severity ?? AlarmSeverity.INFO,
      message: entry.message,
      source: entry.source ?? 'BACKEND',
      data: entry.data ?? null,
    });
  }

  async findAuditLogs(q: AuditFilterQuery): Promise<Paginated<Record<string, unknown>>> {
    const { page, limit, skip, take } = pageParams(q);
    const qb = this.auditRepo.createQueryBuilder('a').orderBy('a.created_at', 'DESC').skip(skip).take(take);
    if (q.action) qb.andWhere('a.action ILIKE :action', { action: `%${q.action}%` });
    if (q.userId) qb.andWhere('a.user_id = :userId', { userId: q.userId });
    if (q.from) qb.andWhere('a.created_at >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('a.created_at <= :to', { to: new Date(q.to) });
    const [rows, total] = await qb.getManyAndCount();
    return paginated(
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.username,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        details: r.details,
        createdAt: iso(r.createdAt),
      })),
      total,
      page,
      limit,
    );
  }

  async findEvents(q: EventFilterQuery): Promise<Paginated<Record<string, unknown>>> {
    const { page, limit, skip, take } = pageParams(q);
    const qb = this.eventRepo.createQueryBuilder('e').orderBy('e.created_at', 'DESC').skip(skip).take(take);
    if (q.category) qb.andWhere('e.category = :cat', { cat: q.category });
    if (q.severity) qb.andWhere('e.severity = :sev', { sev: q.severity });
    if (q.from) qb.andWhere('e.created_at >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('e.created_at <= :to', { to: new Date(q.to) });
    const [rows, total] = await qb.getManyAndCount();
    return paginated(
      rows.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        category: e.category,
        severity: e.severity,
        message: e.message,
        source: e.source,
        data: e.data,
        createdAt: iso(e.createdAt),
      })),
      total,
      page,
      limit,
    );
  }
}

@Controller()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('audit')
  @RequirePermissions(Permission.AUDIT_VIEW)
  getAudit(@Query() q: AuditFilterQuery) {
    return this.auditService.findAuditLogs(q);
  }

  @Get('events')
  @RequireAnyPermission(Permission.HISTORY_VIEW_ALL, Permission.DIAGNOSTICS_VIEW)
  getEvents(@Query() q: EventFilterQuery) {
    return this.auditService.findEvents(q);
  }
}

@Global()
@Module({
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}

import { Body, Controller, Get, Global, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString } from 'class-validator';
import { In, Repository } from 'typeorm';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta, RequirePermissions } from '../../common/decorators';
import { AlarmSeverity, AlarmStatus, EventCategory, NotificationType } from '../../common/enums';
import { AppError } from '../../common/errors';
import { pageParams, paginated, PaginationQuery } from '../../common/pagination';
import { Permission } from '../../common/permissions';
import { iso } from '../../common/utils';
import { AlarmEntity } from '../../database/entities';
import { AuditService } from '../audit/audit.module';
import { ControllerAlarm } from '../industrial/industrial-controller.interface';
import { NotificationsService } from '../notifications/notifications.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export class AlarmQuery extends PaginationQuery {
  @IsOptional() @IsString() status?: AlarmStatus;
  @IsOptional() @IsString() severity?: AlarmSeverity;
}

export class AcknowledgeAlarmDto {
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class AlarmsService {
  constructor(
    @InjectRepository(AlarmEntity) private readonly alarmRepo: Repository<AlarmEntity>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(q: AlarmQuery) {
    const { page, limit, skip, take } = pageParams(q);
    const qb = this.alarmRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.acknowledgedByUser', 'u')
      .orderBy('a.createdAt', 'DESC')
      .skip(skip)
      .take(take);
    if (q.status) qb.andWhere('a.status = :st', { st: q.status });
    if (q.severity) qb.andWhere('a.severity = :sev', { sev: q.severity });
    const [rows, total] = await qb.getManyAndCount();
    return paginated(rows.map((r) => this.toDto(r)), total, page, limit);
  }

  async countUnresolved(): Promise<{ total: number; critical: number }> {
    const active = await this.alarmRepo.find({
      where: { status: In([AlarmStatus.ACTIVE, AlarmStatus.ACKNOWLEDGED]) },
    });
    const critical = active.filter((a) => [AlarmSeverity.CRITICAL, AlarmSeverity.EMERGENCY].includes(a.severity)).length;
    return { total: active.length, critical };
  }

  async hasBlockingAlarm(): Promise<boolean> {
    const c = await this.alarmRepo.count({
      where: {
        status: In([AlarmStatus.ACTIVE, AlarmStatus.ACKNOWLEDGED]),
        severity: In([AlarmSeverity.CRITICAL, AlarmSeverity.EMERGENCY]),
      },
    });
    return c > 0;
  }

  /**
   * Synchronize alarms reported by the industrial controller.
   * New alarms are created & broadcast; alarms no longer reported by the controller are marked RESOLVED.
   */
  async syncControllerAlarms(reported: ControllerAlarm[]) {
    const unresolved = await this.alarmRepo.find({
      where: { origin: 'CONTROLLER', status: In([AlarmStatus.ACTIVE, AlarmStatus.ACKNOWLEDGED]) },
      relations: ['acknowledgedByUser'],
    });
    const byKey = new Map(unresolved.map((a) => [a.activeKey ?? `${a.source}:${a.alarmCode}`, a]));
    const seenKeys = new Set<string>();

    for (const ca of reported) {
      const key = `${ca.source}:${ca.code}`;
      seenKeys.add(key);
      if (!byKey.has(key)) {
        const created = await this.alarmRepo.save({
          alarmCode: ca.code,
          severity: ca.severity,
          description: ca.description,
          source: ca.source,
          status: AlarmStatus.ACTIVE,
          origin: 'CONTROLLER',
          activeKey: key,
        });
        const dto = this.toDto(created);
        this.realtime.emitToAll('alarm.created', dto);
        await this.audit.recordEvent({
          eventType: 'ALARM_RAISED',
          category: EventCategory.PLC,
          severity: ca.severity,
          message: `[${ca.code}] ${ca.description}`,
          source: ca.source,
        });
        if ([AlarmSeverity.CRITICAL, AlarmSeverity.EMERGENCY].includes(ca.severity)) {
          await this.notifications.notifyStaff(
            NotificationType.CRITICAL_ALARM,
            `Critical Alarm: ${ca.code}`,
            ca.description,
            { alarmId: created.id, alarmCode: ca.code, severity: ca.severity },
          );
        }
      }
    }

    for (const [key, existing] of byKey.entries()) {
      if (!seenKeys.has(key)) {
        existing.status = AlarmStatus.RESOLVED;
        existing.resolvedAt = new Date();
        existing.activeKey = null;
        const saved = await this.alarmRepo.save(existing);
        this.realtime.emitToAll('alarm.resolved', this.toDto(saved));
        await this.audit.recordEvent({
          eventType: 'ALARM_RESOLVED',
          category: EventCategory.PLC,
          severity: AlarmSeverity.INFO,
          message: `Alarm [${existing.alarmCode}] cleared by controller`,
          source: existing.source,
        });
      }
    }
  }

  /**
   * Acknowledge an alarm.
   * SAFETY RULE: Acknowledging records operator awareness; it NEVER resets or clears a physical fault.
   */
  async acknowledge(id: string, user: AuthUser, dto: AcknowledgeAlarmDto, meta: RequestMeta) {
    const alarm = await this.alarmRepo.findOne({ where: { id }, relations: ['acknowledgedByUser'] });
    if (!alarm) throw AppError.notFound('Alarm');
    if (alarm.status === AlarmStatus.RESOLVED) return this.toDto(alarm);

    alarm.status = AlarmStatus.ACKNOWLEDGED;
    alarm.acknowledgedBy = user.id;
    alarm.acknowledgedAt = new Date();
    alarm.acknowledgeNote = dto.note ?? null;
    await this.alarmRepo.save(alarm);

    const reloaded = await this.alarmRepo.findOne({ where: { id }, relations: ['acknowledgedByUser'] });
    const out = this.toDto(reloaded!);
    this.realtime.emitToAll('alarm.acknowledged', out);
    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'ALARM_ACKNOWLEDGE',
      entity: 'alarm',
      entityId: alarm.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { alarmCode: alarm.alarmCode, note: dto.note ?? null },
    });
    return out;
  }

  toDto(a: AlarmEntity) {
    return {
      id: a.id,
      alarmCode: a.alarmCode,
      severity: a.severity,
      description: a.description,
      source: a.source,
      status: a.status,
      createdAt: iso(a.createdAt),
      acknowledgedBy: a.acknowledgedBy
        ? { id: a.acknowledgedBy, fullName: a.acknowledgedByUser?.fullName ?? 'Operator' }
        : null,
      acknowledgedAt: iso(a.acknowledgedAt),
      resolvedAt: iso(a.resolvedAt),
    };
  }
}

@Controller('alarms')
export class AlarmsController {
  constructor(private readonly service: AlarmsService) {}

  @Get()
  @RequirePermissions(Permission.ALARMS_VIEW)
  list(@Query() q: AlarmQuery) {
    return this.service.list(q);
  }

  @Post(':id/acknowledge')
  @RequirePermissions(Permission.ALARMS_ACKNOWLEDGE)
  acknowledge(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AcknowledgeAlarmDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.acknowledge(id, user, dto, meta);
  }
}

@Global()
@Module({
  providers: [AlarmsService],
  controllers: [AlarmsController],
  exports: [AlarmsService],
})
export class AlarmsModule {}

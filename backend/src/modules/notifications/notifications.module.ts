import { Body, Controller, Get, HttpCode, Injectable, Module, Global, Param, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser, AuthUser } from '../../common/decorators';
import { NotificationType, Role } from '../../common/enums';
import { pageParams, paginated, PaginationQuery } from '../../common/pagination';
import { iso } from '../../common/utils';
import { DeviceTokenEntity, NotificationEntity, UserEntity } from '../../database/entities';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export class NotificationQuery extends PaginationQuery {
  @IsOptional() @IsString() unread?: string;
}

export class RegisterDeviceTokenDto {
  @IsString() token: string;
  @IsIn(['android', 'ios', 'web']) platform: 'android' | 'ios' | 'web';
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity) private readonly notifRepo: Repository<NotificationEntity>,
    @InjectRepository(DeviceTokenEntity) private readonly tokenRepo: Repository<DeviceTokenEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    private readonly realtime: RealtimeGateway,
  ) {}

  async notifyUser(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    const entity = await this.notifRepo.save({
      userId,
      type,
      title,
      body,
      data: data ?? null,
      readAt: null,
    });
    const dto = this.toDto(entity);
    this.realtime.emitToUser(userId, 'notification', dto);
    return dto;
  }

  async notifyStaff(type: NotificationType, title: string, body: string, data?: Record<string, unknown>) {
    const staff = await this.userRepo
      .createQueryBuilder('u')
      .where('u.role != :cust AND u.status = :st', { cust: Role.CUSTOMER, st: 'ACTIVE' })
      .getMany();
    for (const u of staff) {
      await this.notifyUser(u.id, type, title, body, data);
    }
  }

  async listForUser(userId: string, q: NotificationQuery) {
    const { page, limit, skip, take } = pageParams(q);
    const qb = this.notifRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .orderBy('n.created_at', 'DESC')
      .skip(skip)
      .take(take);
    if (q.unread === 'true') qb.andWhere('n.read_at IS NULL');
    const [rows, total] = await qb.getManyAndCount();
    return paginated(rows.map((r) => this.toDto(r)), total, page, limit);
  }

  async markRead(userId: string, id: string) {
    await this.notifRepo
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('id = :id AND user_id = :userId', { id, userId })
      .execute();
  }

  async markAllRead(userId: string) {
    await this.notifRepo
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('user_id = :userId AND read_at IS NULL', { userId })
      .execute();
  }

  async registerDeviceToken(userId: string, dto: RegisterDeviceTokenDto) {
    const existing = await this.tokenRepo.findOne({ where: { token: dto.token } });
    if (existing) {
      existing.userId = userId;
      existing.platform = dto.platform;
      existing.lastSeenAt = new Date();
      await this.tokenRepo.save(existing);
    } else {
      await this.tokenRepo.save({ userId, token: dto.token, platform: dto.platform });
    }
  }

  private toDto(n: NotificationEntity) {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      read: Boolean(n.readAt),
      createdAt: iso(n.createdAt),
    };
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: NotificationQuery) {
    return this.service.listForUser(user.id, q);
  }

  @Post(':id/read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.service.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.service.markAllRead(user.id);
  }

  @Post('device-token')
  @HttpCode(204)
  async registerDevice(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceTokenDto) {
    await this.service.registerDeviceToken(user.id, dto);
  }
}

@Global()
@Module({
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}

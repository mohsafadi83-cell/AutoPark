import { Controller, Get, Global, HttpCode, Inject, Module, Post } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppCacheService, CacheModule } from './common/cache.module';
import { AuthUser, CurrentUser, Public, ReqMeta, RequestMeta, RequirePermissions } from './common/decorators';
import { Permission } from './common/permissions';
import { APP_CONFIG, AppConfig, loadConfig } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { AlarmsModule } from './modules/alarms/alarms.module';
import { AuditModule, AuditService } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { DevicesModule } from './modules/devices/devices.module';
import { IndustrialModule } from './modules/industrial/industrial.module';
import { IndustrialIntegrationService } from './modules/industrial/industrial.service';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ParkingModule } from './modules/parking/parking.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { UsersModule } from './modules/users/users.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly industrial: IndustrialIntegrationService,
    private readonly cache: AppCacheService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get()
  async check() {
    const st = await this.industrial.getSystemStatus();
    const cacheStats = this.cache.getStats();
    return {
      status: 'ok',
      mode: this.cfg.mode,
      adapter: st.adapter,
      controllerConnected: st.controllerConnected,
      cache: {
        backend: cacheStats.backend,
        redisConnected: cacheStats.redisConnected,
        entries: cacheStats.entries,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        hitRatePct: cacheStats.hitRatePct,
      },
      time: new Date().toISOString(),
    };
  }

  @Get('cache')
  @RequirePermissions(Permission.SYSTEM_MONITOR)
  cacheStats() {
    return this.cache.getStats();
  }

  @Post('cache/flush')
  @HttpCode(200)
  @RequirePermissions(Permission.CONFIG_MANAGE)
  async flushCache(@CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    const flushedEntries = this.cache.clear();
    await this.audit.log({
      userId: user.id,
      username: user.username,
      action: 'CACHE_FLUSH',
      entity: 'system_cache',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      details: { flushedEntries },
    });
    return {
      ok: true,
      flushedEntries,
      stats: this.cache.getStats(),
      time: new Date().toISOString(),
    };
  }
}

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => loadConfig(),
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigProviderModule {}

@Module({
  imports: [
    ConfigProviderModule,
    CacheModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => [
        {
          ttl: cfg.rateLimit.ttl * 1000,
          limit: cfg.isTest ? 10000 : cfg.rateLimit.max,
        },
      ],
    }),
    DatabaseModule,
    RealtimeModule,
    AuditModule,
    NotificationsModule,
    AlarmsModule,
    IndustrialModule,
    DevicesModule,
    AuthModule,
    UsersModule,
    VehiclesModule,
    ParkingModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '../../config/app.config';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => ({
        secret: cfg.auth.accessSecret,
        signOptions: { expiresIn: cfg.auth.accessTtl },
      }),
    }),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway, JwtModule],
})
export class RealtimeModule {}

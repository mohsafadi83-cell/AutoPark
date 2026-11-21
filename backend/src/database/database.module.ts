import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { buildDataSourceOptions } from './data-source';
import { ALL_ENTITIES } from './entities';
import { SeedService } from './seed.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => buildDataSourceOptions(cfg),
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  providers: [SeedService],
  exports: [TypeOrmModule, SeedService],
})
export class DatabaseModule {}

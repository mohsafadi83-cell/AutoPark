import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import * as fs from 'fs';
import helmet from 'helmet';
import * as path from 'path';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/app.config';

export async function createConfiguredApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const cfg = app.get<AppConfig>(APP_CONFIG);

  if (cfg.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.enableCors({
    origin: cfg.mode === 'SIMULATION' ? true : cfg.corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  if (cfg.swaggerEnabled) {
    const swaggerCfg = new DocumentBuilder()
      .setTitle('Auto Park Industrial API')
      .setDescription('Safety-critical Automated Parking Management System REST & WebSocket API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, swaggerCfg);
    SwaggerModule.setup('api/docs', app, doc);
  }

  // Serve bundled static UIs (Mobile App at /mobile, Web Admin at /) when built folders exist
  const expressApp = app.getHttpAdapter().getInstance() as express.Application;
  const candidateMobileDirs = [
    path.resolve(__dirname, '..', 'ui', 'mobile'),
    path.resolve(__dirname, '..', '..', 'mobile', 'build', 'web'),
  ];
  const mobileDir = candidateMobileDirs.find((d) => fs.existsSync(path.join(d, 'index.html')));
  if (mobileDir) {
    // Cache transformed mobile index.html in memory once at startup (avoids sync disk I/O per request)
    const cachedMobileHtml = fs
      .readFileSync(path.join(mobileDir, 'index.html'), 'utf8')
      .replace(/<base\s+href="[^"]*">/i, '<base href="/mobile/">');
    const sendMobileIndex = (_req: express.Request, res: express.Response) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(cachedMobileHtml);
    };
    expressApp.get('/mobile', (req, res) => {
      if (req.originalUrl === '/mobile' || req.originalUrl.startsWith('/mobile?')) {
        return res.redirect(302, `/mobile/${req.originalUrl.slice('/mobile'.length)}`);
      }
      return sendMobileIndex(req, res);
    });
    expressApp.use('/mobile', express.static(mobileDir, { index: false, maxAge: '7d' }));
    expressApp.get('/mobile/*', sendMobileIndex);
  }

  const candidateAdminDirs = [
    path.resolve(__dirname, '..', 'ui', 'admin'),
    path.resolve(__dirname, '..', '..', 'admin', 'dist'),
  ];
  const adminDir = candidateAdminDirs.find((d) => fs.existsSync(path.join(d, 'index.html')));
  if (adminDir) {
    expressApp.use(express.static(adminDir, { maxAge: '7d', index: false }));
    expressApp.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/socket.io') ||
        req.path.startsWith('/realtime') ||
        req.path.startsWith('/mobile')
      ) {
        return next();
      }
      return res.sendFile(path.join(adminDir, 'index.html'));
    });
  }

  return { app, cfg };
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const { app, cfg } = await createConfiguredApp();
  await app.listen(cfg.port, '0.0.0.0');
  logger.log(`Auto Park Backend running on http://localhost:${cfg.port}/api/v1 (mode=${cfg.mode})`);
  logger.log(`Web Admin Panel:   http://localhost:${cfg.port}/`);
  logger.log(`Flutter Mobile UI: http://localhost:${cfg.port}/mobile/`);
  if (cfg.swaggerEnabled) {
    logger.log(`Swagger OpenAPI:   http://localhost:${cfg.port}/api/docs`);
  }
}

if (require.main === module) {
  void bootstrap();
}

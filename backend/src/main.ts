// ============================================================
// NestJS 入口 - MVP
// ============================================================
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as morgan from 'morgan';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    cors: {
      origin: (origin, cb) => {
        const cfg = app.get(ConfigService);
        const whitelist = (cfg.get<string>('CORS_ORIGINS') || 'http://localhost:5173')
          .split(',').map(s => s.trim());
        if (!origin || whitelist.includes(origin) || whitelist.includes('*')) {
          cb(null, true);
        } else {
          cb(new Error(`CORS blocked origin: ${origin}`), false);
        }
      },
      credentials: true,
    },
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('APP_PORT', 3000);
  const env = process.env.NODE_ENV === 'production' ? 'production' : config.get<string>('APP_ENV', 'development');
  const proxyHops = Number(config.get('TRUST_PROXY_HOPS') || 0);
  if (proxyHops > 0) app.getHttpAdapter().getInstance().set('trust proxy', proxyHops);

  // ====== 全局中间件 ======
  app.use(helmet());
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(['/api/auth', '/api/store/recover'], rateLimit({
    windowMs: 10 * 60 * 1000, max: env === 'production' ? 30 : 1000,
    standardHeaders: true, legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again later.' },
  }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.use('/api', rateLimit({
    windowMs: 1 * 60 * 1000,
    max: env === 'production' ? 60 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, code: 429, message: 'Too many requests from this IP, please try again later.' }
  }));
  app.use(morgan(':method :url :status :response-time ms', {
    skip: (req) => req.url.includes('/store/orders/') || req.url.includes('/auth/'),
  }));
  app.setGlobalPrefix('api');

  // ====== Swagger：localhost:3000/api/docs
  const docCfg = new DocumentBuilder()
    .setTitle('Intimate Commerce API')
    .setDescription('Physical product storefront and operations')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, docCfg);
  if (env !== 'production') SwaggerModule.setup('api/docs', app, document);

  await app.listen(port, '0.0.0.0');
  Logger.log(
    `Commerce API running on http://localhost:${port}/api\n` +
    `📖 Swagger docs: http://localhost:${port}/api/docs\n` +
    `🌱 Environment: ${env}`,
    'Bootstrap'
  );
}
bootstrap();

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { buildCorsOptions } from './config/cors.config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a reverse proxy (Render, Railway, ...) set TRUST_PROXY=1 so rate limiting sees each
  // client's real IP instead of the proxy's.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const apiPrefix = process.env.API_PREFIX || 'api';

  // Global API prefix: /api
  app.setGlobalPrefix(apiPrefix);

  // Global exception filter for consistent error formatting
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe using class-validator and class-transformer
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  // CORS: only origins listed in CORS_ALLOWED_ORIGINS (see config/cors.config.ts)
  const corsOptions = buildCorsOptions(process.env);
  if (Array.isArray(corsOptions.origin) && corsOptions.origin.length === 0) {
    logger.warn('CORS_ALLOWED_ORIGINS is not set: browsers on other origins will be blocked.');
  }
  app.enableCors(corsOptions);

  // Swagger OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tenant Project Tracker API')
    .setDescription(
      'Multi-tenant project tracker REST API with JWT Authentication, Role-Based Access Control, and Tenant Scoping.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter your JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'User registration, login, and profile retrieval')
    .addTag('Organizations', 'Tenant management, member invitations, and role assignments')
    .addTag('Projects', 'Organization-scoped projects and ETB budget tracking')
    .addTag('Tasks', 'Deliverable tasks with status, priority, and ETB cost estimation')
    .addTag('Users', 'User lookup and system user accounts')
    .addTag('Health', 'System uptime and database connectivity health checks')
    .addTag('System', 'Application metadata and system info')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  logger.log(`Tenant Project Tracker API running on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger documentation available on http://localhost:${port}/api/docs`);
}

void bootstrap();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

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

  // Enable CORS for frontend application
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.listen(port);
  logger.log(`Tenant Project Tracker API running on http://localhost:${port}/${apiPrefix}`);
}

void bootstrap();

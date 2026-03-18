import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const origins = [
    frontendUrl,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
  ];
  // Auto-add www/non-www variant
  if (frontendUrl.includes('://www.')) {
    origins.push(frontendUrl.replace('://www.', '://'));
  } else if (frontendUrl.includes('://') && !frontendUrl.includes('://localhost')) {
    origins.push(frontendUrl.replace('://', '://www.'));
  }

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`Backend running on http://localhost:${port}`);
}
bootstrap();

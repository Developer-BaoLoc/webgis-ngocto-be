import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {
  AppConfig,
  validateProductionConfiguration,
} from './config/configuration';

async function bootstrap() {
  const productionWarnings = validateProductionConfiguration();
  productionWarnings.forEach((warning) =>
    Logger.warn(warning, 'ProductionConfig'),
  );

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const configService = app.get(ConfigService<AppConfig, true>);
  const project = configService.get('project', { infer: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle(project.apiDisplayName)
    .setDescription('Metadata-driven WebGIS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get('port', { infer: true });

  await app.listen(port);
}
bootstrap();

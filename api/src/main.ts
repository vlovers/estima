import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createAppValidationPipe } from './validation.pipe';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { createCorsOptions } from './cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.enableCors(createCorsOptions());

  app.setGlobalPrefix('api');

  app.useGlobalPipes(createAppValidationPipe());

  const config = new DocumentBuilder()
    .setTitle('Estima API')
    .setDescription('API for AI-powered task estimation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap().then(() => null);

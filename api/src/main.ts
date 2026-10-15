import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createAppValidationPipe } from './validation.pipe';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.enableCors({
    origin: 'http://localhost:4200',
    credentials: true,
  });

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

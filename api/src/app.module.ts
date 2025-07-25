import { EstimateFeedbackModule } from './modules/estimate-feedback/estimate-feedback.module';
import { AiEstimatorModule } from './modules/ai-estimator/ai-estimator.module';
import { EstimatesModule } from './modules/estimates/estimates.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DATABASE_HOST'),
        port: configService.get<number>('DATABASE_PORT'),
        username: configService.get<string>('DATABASE_USERNAME'),
        password: configService.get<string>('DATABASE_PASSWORD'),
        database: configService.get<string>('DATABASE_NAME'),
        autoLoadEntities: true,
        synchronize: true,
        dropSchema: true, // This will wipe the database on every restart
      }),
      inject: [ConfigService],
    }),

    ProjectsModule,
    TasksModule,
    EstimatesModule,
    UsersModule,
    EstimateFeedbackModule,
    AiEstimatorModule,
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

import { EstimateFeedbackModule } from './modules/estimate-feedback/estimate-feedback.module';
import { AccessTokenGuard } from './modules/auth/guards/access-token.guard';
import { AiEstimatorModule } from './modules/ai-estimator/ai-estimator.module';
import { EstimatesModule } from './modules/estimates/estimates.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './modules/auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { DataSource, DataSourceOptions } from 'typeorm';
import { assertRuntimeDatabaseSchema } from './database/runtime-schema.assertion';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        autoLoadEntities: true,
        synchronize: false,
        dropSchema: false,
        retryAttempts: 1,
      }),
      dataSourceFactory: async (options?: DataSourceOptions) => {
        const dataSource = new DataSource(options);
        try {
          await dataSource.initialize();
          await assertRuntimeDatabaseSchema(dataSource);
          return dataSource;
        } catch (error) {
          if (dataSource.isInitialized) {
            await dataSource.destroy();
          }
          throw error;
        }
      },
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
  providers: [
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
  ],
})
export class AppModule {}

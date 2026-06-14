import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { TenantEntity } from './entities/tenant.entity';
import { OrganizationEntity } from './entities/organization.entity';
import { UserEntity } from './entities/user.entity';
import {
  OrganizationMemberEntity,
  PermissionEntity,
  RoleAssignmentEntity,
  RoleEntity,
} from './entities/auth.entity';
import {
  FieldEntity,
  LayerEntity,
  LayerSchemaVersionEntity,
  SchemaFieldVersionEntity,
} from './entities/metadata.entity';
import { FeatureEntity } from './entities/feature.entity';
import {
  AdministrativeUnitEntity,
  DictionaryEntity,
  DictionaryItemEntity,
} from './entities/dictionary.entity';
import {
  ImportJobEntity,
  ImportTemplateEntity,
  JobExecutionEntity,
} from './entities/import.entity';
import { AttachmentEntity } from './entities/attachment.entity';
import {
  DashboardEntity,
  DashboardRevisionEntity,
  DashboardWidgetEntity,
} from './entities/analytics.entity';

const entities = [
  TenantEntity,
  OrganizationEntity,
  UserEntity,
  RoleEntity,
  PermissionEntity,
  RoleAssignmentEntity,
  OrganizationMemberEntity,
  LayerEntity,
  FieldEntity,
  LayerSchemaVersionEntity,
  SchemaFieldVersionEntity,
  FeatureEntity,
  DictionaryEntity,
  DictionaryItemEntity,
  AdministrativeUnitEntity,
  JobExecutionEntity,
  ImportJobEntity,
  ImportTemplateEntity,
  AttachmentEntity,
  DashboardEntity,
  DashboardRevisionEntity,
  DashboardWidgetEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const db = configService.get('database', { infer: true });
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,
          entities,
          synchronize: false,
          logging: db.logging,
        };
      },
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('layers')
export class LayerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'owner_organization_id', type: 'uuid', nullable: true })
  ownerOrganizationId: string | null;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'geometry_kind', type: 'varchar' })
  geometryKind: string;

  @Column({ name: 'geometry_required', type: 'boolean', default: false })
  geometryRequired: boolean;

  @Column({ name: 'render_mode', type: 'varchar', default: 'geojson' })
  renderMode: string;

  @Column({ name: 'style_config', type: 'jsonb', default: {} })
  styleConfig: Record<string, unknown>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'current_schema_version_id', type: 'uuid', nullable: true })
  currentSchemaVersionId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('fields')
export class FieldEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'layer_id', type: 'uuid' })
  layerId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 128 })
  storageKey: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('layer_schema_versions')
export class LayerSchemaVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'layer_id', type: 'uuid' })
  layerId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar' })
  status: string;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('schema_field_versions')
export class SchemaFieldVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'schema_version_id', type: 'uuid' })
  schemaVersionId: string;

  @Column({ name: 'field_id', type: 'uuid' })
  fieldId: string;

  @Column({ name: 'layer_id', type: 'uuid' })
  layerId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 128 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ name: 'field_type', type: 'varchar', length: 64 })
  fieldType: string;

  @Column({ name: 'data_schema', type: 'jsonb', default: {} })
  dataSchema: Record<string, unknown>;

  @Column({ name: 'ui_schema', type: 'jsonb', default: {} })
  uiSchema: Record<string, unknown>;

  @Column({ name: 'display_schema', type: 'jsonb', default: {} })
  displaySchema: Record<string, unknown>;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}

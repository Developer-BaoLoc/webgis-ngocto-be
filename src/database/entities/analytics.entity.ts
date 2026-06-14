import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dashboards')
export class DashboardEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @Column({ name: 'owner_organization_id', type: 'uuid', nullable: true })
  ownerOrganizationId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', default: 'private' })
  scope: string;

  @Column({ type: 'varchar', default: 'draft' })
  status: string;

  @Column({ name: 'current_revision_id', type: 'uuid', nullable: true })
  currentRevisionId: string | null;

  @Column({ name: 'row_version', type: 'int', default: 1 })
  rowVersion: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('dashboard_revisions')
export class DashboardRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dashboard_id', type: 'uuid' })
  dashboardId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ name: 'layout_config', type: 'jsonb', default: {} })
  layoutConfig: Record<string, unknown>;

  @Column({ name: 'filter_config', type: 'jsonb', default: [] })
  filterConfig: unknown[];

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'published_by', type: 'uuid', nullable: true })
  publishedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('dashboard_widgets')
export class DashboardWidgetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dashboard_revision_id', type: 'uuid' })
  dashboardRevisionId: string;

  @Column({ name: 'widget_type', type: 'varchar', length: 64 })
  widgetType: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'layout_config', type: 'jsonb' })
  layoutConfig: Record<string, unknown>;

  @Column({ name: 'data_source_config', type: 'jsonb' })
  dataSourceConfig: Record<string, unknown>;

  @Column({ name: 'display_config', type: 'jsonb', default: {} })
  displayConfig: Record<string, unknown>;

  @Column({ name: 'interaction_config', type: 'jsonb', default: {} })
  interactionConfig: Record<string, unknown>;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('job_executions')
export class JobExecutionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'job_type', type: 'varchar', length: 64 })
  jobType: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status: string;

  @Column({ type: 'jsonb', default: {} })
  progress: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('import_jobs')
export class ImportJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_execution_id', type: 'uuid' })
  jobExecutionId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'file_storage_key', type: 'varchar', length: 512 })
  fileStorageKey: string;

  @Column({ name: 'sheet_name', type: 'varchar', length: 128, nullable: true })
  sheetName: string | null;

  @Column({ type: 'jsonb', default: {} })
  stats: Record<string, unknown>;
}

@Entity('import_templates')
export class ImportTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'root_layer_id', type: 'uuid', nullable: true })
  rootLayerId: string | null;

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

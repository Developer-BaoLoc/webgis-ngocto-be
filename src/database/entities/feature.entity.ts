import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('features')
export class FeatureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'layer_id', type: 'uuid' })
  layerId: string;

  @Column({ name: 'schema_version_id', type: 'uuid' })
  schemaVersionId: string;

  @Column({ name: 'owner_organization_id', type: 'uuid', nullable: true })
  ownerOrganizationId: string | null;

  @Column({ name: 'administrative_unit_id', type: 'uuid', nullable: true })
  administrativeUnitId: string | null;

  @Column({ type: 'jsonb', default: {} })
  properties: Record<string, unknown>;

  @Column({ type: 'varchar', default: 'draft' })
  status: string;

  @Column({ name: 'location_status', type: 'varchar', default: 'unlocated' })
  locationStatus: string;

  @Column({ name: 'geometry_source', type: 'varchar', nullable: true })
  geometrySource: string | null;

  @Column({ name: 'row_version', type: 'int', default: 1 })
  rowVersion: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

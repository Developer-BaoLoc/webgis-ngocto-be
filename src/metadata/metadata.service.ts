import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import {
  FieldEntity,
  LayerEntity,
  LayerSchemaVersionEntity,
  SchemaFieldVersionEntity,
} from '../database/entities/metadata.entity';
import { CreateLayerDto } from './dto/create-layer.dto';
import { UpdateLayerDto } from './dto/update-layer.dto';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { FIELD_TYPES, GEOMETRY_KINDS } from './constants/metadata.constants';

export type LayerSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  geometryKind: string;
  geometryRequired: boolean;
  sortOrder: number;
  endpoint: string;
};

@Injectable()
export class MetadataService {
  constructor(
    @InjectRepository(LayerEntity)
    private readonly layersRepository: Repository<LayerEntity>,
    @InjectRepository(FieldEntity)
    private readonly fieldsRepository: Repository<FieldEntity>,
    @InjectRepository(LayerSchemaVersionEntity)
    private readonly schemaVersionsRepository: Repository<LayerSchemaVersionEntity>,
    @InjectRepository(SchemaFieldVersionEntity)
    private readonly schemaFieldsRepository: Repository<SchemaFieldVersionEntity>,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly dataSource: DataSource,
  ) {}

  getProjectInfo() {
    const ward = this.configService.get('ward', { infer: true });
    return {
      name: 'GIS Long Bình',
      description: 'Hệ thống thông tin địa lý phường Long Bình, Cần Thơ',
      ward: ward.name,
      district: ward.district,
      province: ward.province,
      center: ward.center,
      defaultZoom: ward.defaultZoom,
    };
  }

  getFieldTypeCatalog() {
    return FIELD_TYPES.map((type) => ({ type }));
  }

  getGeometryKindCatalog() {
    return GEOMETRY_KINDS.map((kind) => ({ kind }));
  }

  async listLayers(tenantId: string): Promise<LayerSummary[]> {
    const layers = await this.layersRepository.find({
      where: { tenantId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return layers.map((layer) => this.toLayerSummary(layer));
  }

  async listLayersAdmin(tenantId: string) {
    const layers = await this.layersRepository.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return layers.map((layer) => this.toLayerDetail(layer));
  }

  async createLayer(tenantId: string, userId: string, dto: CreateLayerDto) {
    const existing = await this.layersRepository.findOne({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Layer code đã tồn tại: ${dto.code}`);
    }

    const layer = await this.layersRepository.save(
      this.layersRepository.create({
        tenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        geometryKind: dto.geometryKind,
        geometryRequired: dto.geometryRequired ?? false,
        sortOrder: dto.sortOrder ?? 0,
      }),
    );

    const draft = await this.createSchemaDraftInternal(
      tenantId,
      layer.id,
      userId,
      'Schema ban đầu',
    );

    return {
      ...this.toLayerDetail(layer),
      draftSchemaId: draft.id,
    };
  }

  async updateLayer(tenantId: string, layerId: string, dto: UpdateLayerDto) {
    const layer = await this.findLayer(tenantId, layerId, false);

    if (dto.name !== undefined) layer.name = dto.name;
    if (dto.description !== undefined) layer.description = dto.description;
    if (dto.geometryKind !== undefined) layer.geometryKind = dto.geometryKind;
    if (dto.geometryRequired !== undefined) {
      layer.geometryRequired = dto.geometryRequired;
    }
    if (dto.sortOrder !== undefined) layer.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) layer.isActive = dto.isActive;

    await this.layersRepository.save(layer);
    return this.toLayerDetail(layer);
  }

  async deleteLayer(tenantId: string, layerId: string) {
    const layer = await this.findLayer(tenantId, layerId, false);
    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS cnt FROM features WHERE tenant_id = $1 AND layer_id = $2 AND deleted_at IS NULL`,
      [tenantId, layerId],
    );
    if (countRows[0]?.cnt > 0) {
      throw new BadRequestException(
        'Không thể xóa layer đang có bản ghi. Xóa records trước.',
      );
    }

    layer.isActive = false;
    await this.layersRepository.save(layer);
    return { id: layerId, deleted: true };
  }

  async getLayerById(tenantId: string, layerId: string) {
    const layer = await this.findLayer(tenantId, layerId);
    return this.toLayerDetail(layer);
  }

  async getLayerByCode(tenantId: string, code: string) {
    const layer = await this.layersRepository.findOne({
      where: { tenantId, code, isActive: true },
    });
    if (!layer) {
      throw new NotFoundException(`Layer không tồn tại: ${code}`);
    }
    return this.toLayerDetail(layer);
  }

  async getPublishedSchema(tenantId: string, layerId: string) {
    const layer = await this.findLayer(tenantId, layerId);
    if (!layer.currentSchemaVersionId) {
      throw new NotFoundException('Layer chưa có schema published');
    }
    return this.getSchemaById(tenantId, layerId, layer.currentSchemaVersionId);
  }

  async getDraftSchema(tenantId: string, layerId: string) {
    await this.findLayer(tenantId, layerId, false);
    const draft = await this.schemaVersionsRepository.findOne({
      where: { tenantId, layerId, status: 'draft' },
      order: { version: 'DESC' },
    });
    if (!draft) {
      throw new NotFoundException('Không có schema draft');
    }
    return this.getSchemaById(tenantId, layerId, draft.id);
  }

  async createSchemaDraft(tenantId: string, layerId: string, userId: string) {
    await this.findLayer(tenantId, layerId, false);

    const existingDraft = await this.schemaVersionsRepository.findOne({
      where: { tenantId, layerId, status: 'draft' },
    });
    if (existingDraft) {
      return this.getSchemaById(tenantId, layerId, existingDraft.id);
    }

    const draft = await this.createSchemaDraftInternal(
      tenantId,
      layerId,
      userId,
      'Draft mới từ published schema',
    );
    return this.getSchemaById(tenantId, layerId, draft.id);
  }

  async updateSchemaDraft(
    tenantId: string,
    schemaId: string,
    changeSummary?: string,
  ) {
    const schema = await this.findDraftSchema(tenantId, schemaId);
    if (changeSummary !== undefined) {
      await this.dataSource.query(
        `UPDATE layer_schema_versions SET change_summary = $2 WHERE id = $1`,
        [schema.id, changeSummary],
      );
    }
    return this.getSchemaById(tenantId, schema.layerId, schema.id);
  }

  async publishSchema(tenantId: string, schemaId: string, userId: string) {
    const schema = await this.findDraftSchema(tenantId, schemaId);
    const layer = await this.findLayer(tenantId, schema.layerId, false);

    const activeFields = await this.schemaFieldsRepository.count({
      where: { schemaVersionId: schema.id, isActive: true },
    });
    if (activeFields === 0) {
      throw new BadRequestException('Schema draft phải có ít nhất 1 field');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE layer_schema_versions SET status = 'archived'
         WHERE layer_id = $1 AND tenant_id = $2 AND status = 'published'`,
        [layer.id, tenantId],
      );

      await manager.query(
        `UPDATE layer_schema_versions
         SET status = 'published', published_at = NOW(), published_by = $2
         WHERE id = $1`,
        [schema.id, userId],
      );

      await manager.query(
        `UPDATE layers SET current_schema_version_id = $2 WHERE id = $1`,
        [layer.id, schema.id],
      );
    });

    return this.getSchemaById(tenantId, schema.layerId, schema.id);
  }

  async addFieldToDraft(
    tenantId: string,
    schemaId: string,
    dto: CreateFieldDto,
  ) {
    const schema = await this.findDraftSchema(tenantId, schemaId);

    const dupField = await this.fieldsRepository.findOne({
      where: { layerId: schema.layerId, storageKey: dto.code },
    });
    if (dupField) {
      throw new ConflictException(`Field code đã tồn tại: ${dto.code}`);
    }

    const dupSchemaField = await this.schemaFieldsRepository.findOne({
      where: { schemaVersionId: schema.id, code: dto.code },
    });
    if (dupSchemaField) {
      throw new ConflictException(`Field code đã có trong draft: ${dto.code}`);
    }

    const field = await this.fieldsRepository.save(
      this.fieldsRepository.create({
        layerId: schema.layerId,
        tenantId,
        storageKey: dto.code,
      }),
    );

    const maxOrder = await this.schemaFieldsRepository
      .createQueryBuilder('sf')
      .select('COALESCE(MAX(sf.sort_order), 0)', 'max')
      .where('sf.schema_version_id = :schemaId', { schemaId: schema.id })
      .getRawOne<{ max: string }>();

    await this.schemaFieldsRepository.save(
      this.schemaFieldsRepository.create({
        schemaVersionId: schema.id,
        fieldId: field.id,
        layerId: schema.layerId,
        tenantId,
        code: dto.code,
        label: dto.label,
        fieldType: dto.fieldType,
        dataSchema: dto.dataSchema ?? {},
        uiSchema: dto.uiSchema ?? {},
        displaySchema: dto.displaySchema ?? {},
        sortOrder: dto.sortOrder ?? parseInt(maxOrder?.max ?? '0', 10) + 1,
      }),
    );

    return this.getSchemaById(tenantId, schema.layerId, schema.id);
  }

  async updateFieldInDraft(
    tenantId: string,
    schemaId: string,
    fieldId: string,
    dto: UpdateFieldDto,
  ) {
    const schema = await this.findDraftSchema(tenantId, schemaId);
    const schemaField = await this.schemaFieldsRepository.findOne({
      where: { schemaVersionId: schema.id, fieldId, layerId: schema.layerId },
    });
    if (!schemaField) {
      throw new NotFoundException('Field không tồn tại trong draft');
    }

    if (dto.label !== undefined) schemaField.label = dto.label;
    if (dto.fieldType !== undefined) schemaField.fieldType = dto.fieldType;
    if (dto.dataSchema !== undefined) schemaField.dataSchema = dto.dataSchema;
    if (dto.uiSchema !== undefined) schemaField.uiSchema = dto.uiSchema;
    if (dto.displaySchema !== undefined) {
      schemaField.displaySchema = dto.displaySchema;
    }
    if (dto.sortOrder !== undefined) schemaField.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) schemaField.isActive = dto.isActive;

    await this.schemaFieldsRepository.save(schemaField);
    return this.getSchemaById(tenantId, schema.layerId, schema.id);
  }

  async deleteFieldFromDraft(
    tenantId: string,
    schemaId: string,
    fieldId: string,
  ) {
    const schema = await this.findDraftSchema(tenantId, schemaId);
    const schemaField = await this.schemaFieldsRepository.findOne({
      where: { schemaVersionId: schema.id, fieldId },
    });
    if (!schemaField) {
      throw new NotFoundException('Field không tồn tại trong draft');
    }

    schemaField.isActive = false;
    await this.schemaFieldsRepository.save(schemaField);
    return this.getSchemaById(tenantId, schema.layerId, schema.id);
  }

  async getSchemaFieldsForVersion(schemaVersionId: string, layerId: string) {
    return this.schemaFieldsRepository.find({
      where: { schemaVersionId, layerId, isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  private async createSchemaDraftInternal(
    tenantId: string,
    layerId: string,
    userId: string,
    changeSummary: string,
  ) {
    const layer = await this.findLayer(tenantId, layerId, false);

    const maxVersionRow = await this.schemaVersionsRepository
      .createQueryBuilder('sv')
      .select('COALESCE(MAX(sv.version), 0)', 'max')
      .where('sv.layer_id = :layerId', { layerId })
      .getRawOne<{ max: string }>();

    const nextVersion = parseInt(maxVersionRow?.max ?? '0', 10) + 1;

    const draft = await this.schemaVersionsRepository.save(
      this.schemaVersionsRepository.create({
        layerId,
        tenantId,
        version: nextVersion,
        status: 'draft',
      }),
    );

    await this.dataSource.query(
      `UPDATE layer_schema_versions SET change_summary = $2, created_by = $3 WHERE id = $1`,
      [draft.id, changeSummary, userId],
    );

    if (layer.currentSchemaVersionId) {
      const publishedFields = await this.schemaFieldsRepository.find({
        where: {
          schemaVersionId: layer.currentSchemaVersionId,
          isActive: true,
        },
        order: { sortOrder: 'ASC' },
      });

      for (const pf of publishedFields) {
        await this.schemaFieldsRepository.save(
          this.schemaFieldsRepository.create({
            schemaVersionId: draft.id,
            fieldId: pf.fieldId,
            layerId,
            tenantId,
            code: pf.code,
            label: pf.label,
            fieldType: pf.fieldType,
            dataSchema: pf.dataSchema,
            uiSchema: pf.uiSchema,
            displaySchema: pf.displaySchema,
            sortOrder: pf.sortOrder,
          }),
        );
      }
    }

    return draft;
  }

  private async getSchemaById(
    tenantId: string,
    layerId: string,
    schemaVersionId: string,
  ) {
    const layer = await this.layersRepository.findOne({
      where: { id: layerId, tenantId },
    });
    if (!layer) {
      throw new NotFoundException('Layer không tồn tại');
    }

    const schema = await this.schemaVersionsRepository.findOne({
      where: { id: schemaVersionId, layerId, tenantId },
    });
    if (!schema) {
      throw new NotFoundException('Schema không tồn tại');
    }

    const fields = await this.schemaFieldsRepository.find({
      where: { schemaVersionId: schema.id, isActive: true },
      order: { sortOrder: 'ASC' },
    });

    return {
      layerId: layer.id,
      layerCode: layer.code,
      schemaVersionId: schema.id,
      version: schema.version,
      status: schema.status,
      fields: fields.map((f) => ({
        fieldId: f.fieldId,
        code: f.code,
        label: f.label,
        fieldType: f.fieldType,
        dataSchema: f.dataSchema,
        uiSchema: f.uiSchema,
        displaySchema: f.displaySchema,
        sortOrder: f.sortOrder,
      })),
    };
  }

  private async findDraftSchema(tenantId: string, schemaId: string) {
    const schema = await this.schemaVersionsRepository.findOne({
      where: { id: schemaId, tenantId, status: 'draft' },
    });
    if (!schema) {
      throw new NotFoundException('Schema draft không tồn tại');
    }
    return schema;
  }

  private async findLayer(
    tenantId: string,
    layerId: string,
    activeOnly = true,
  ) {
    const layer = await this.layersRepository.findOne({
      where: activeOnly
        ? { id: layerId, tenantId, isActive: true }
        : { id: layerId, tenantId },
    });
    if (!layer) {
      throw new NotFoundException('Layer không tồn tại');
    }
    return layer;
  }

  private toLayerSummary(layer: LayerEntity): LayerSummary {
    return {
      id: layer.id,
      code: layer.code,
      name: layer.name,
      description: layer.description,
      geometryKind: layer.geometryKind,
      geometryRequired: layer.geometryRequired,
      sortOrder: layer.sortOrder,
      endpoint: `/api/layers/${layer.id}/geojson`,
    };
  }

  private toLayerDetail(layer: LayerEntity) {
    return {
      ...this.toLayerSummary(layer),
      renderMode: layer.renderMode,
      isActive: layer.isActive,
      currentSchemaVersionId: layer.currentSchemaVersionId,
    };
  }
}

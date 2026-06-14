import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import {
  FieldEntity,
  LayerEntity,
  LayerSchemaVersionEntity,
  SchemaFieldVersionEntity,
} from '../database/entities/metadata.entity';
import { CreateLayerDto, LayerStyleInput } from './dto/create-layer.dto';
import { UpdateLayerDto } from './dto/update-layer.dto';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { FIELD_TYPE_CATALOG } from './constants/metadata.constants';
import { FIELD_DISPLAY_SCHEMA_OPTIONS, MAP_POPUP_DISPLAY_GROUP } from './constants/field-display.constants';
import {
  GEOMETRY_KIND_TO_TYPE,
  GEOMETRY_TYPE_TO_KIND,
  LAYER_GEOMETRY_TYPE_CATALOG,
  LAYER_ICON_UPLOAD,
  LayerGeometryType,
  LayerStyleConfig,
} from './constants/layer-geometry.constants';
import {
  buildStyleConfig,
  generateUniqueLayerCode,
  parseStoredStyleConfig,
} from './utils/layer-code.util';
import { generateUniqueFieldCode } from './utils/field-code.util';
import {
  resolveDictionaryCode,
  validateFieldDataSchema,
} from './utils/field-schema.validator';
import { AssetsService } from '../assets/assets.service';
import { DictionariesService } from '../dictionaries/dictionaries.service';
import { WardBoundaryService } from '../ward-boundary/ward-boundary.service';

export type LayerSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  geometryType: LayerGeometryType | null;
  geometryKind: string;
  geometryRequired: boolean;
  sortOrder: number;
  style: ReturnType<typeof parseStoredStyleConfig>;
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
    private readonly assetsService: AssetsService,
    private readonly dictionariesService: DictionariesService,
    private readonly wardBoundaryService: WardBoundaryService,
  ) {}

  getProjectInfo() {
    const ward = this.configService.get('ward', { infer: true });
    const mapView = this.wardBoundaryService.getMapView();

    return {
      name: 'GIS Long Bình',
      description: 'Hệ thống thông tin địa lý phường Long Bình, Cần Thơ',
      ward: ward.name,
      district: ward.district,
      province: ward.province,
      center: mapView.center,
      defaultZoom: mapView.defaultZoom,
      mapView,
    };
  }

  getMapView() {
    return this.wardBoundaryService.getMapView();
  }

  getFieldTypeCatalog() {
    return FIELD_TYPE_CATALOG;
  }

  getFieldDisplaySchemaOptions() {
    return {
      groups: [MAP_POPUP_DISPLAY_GROUP],
      options: FIELD_DISPLAY_SCHEMA_OPTIONS,
    };
  }

  getLayerGeometryTypeCatalog() {
    return LAYER_GEOMETRY_TYPE_CATALOG;
  }

  getLayerIconUploadConfig() {
    return LAYER_ICON_UPLOAD;
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
    const draftMap = await this.resolveDraftSchemaIdMap(
      tenantId,
      layers.map((layer) => layer.id),
    );
    return layers.map((layer) =>
      this.toLayerDetail(layer, draftMap.get(layer.id) ?? null),
    );
  }

  async createLayer(tenantId: string, userId: string, dto: CreateLayerDto) {
    const code = await generateUniqueLayerCode(
      this.layersRepository,
      tenantId,
      dto.name,
    );
    const resolvedStyle = await this.resolveStyleInput(
      tenantId,
      dto.geometryType,
      dto.style,
    );
    const styleConfig = buildStyleConfig(dto.geometryType, resolvedStyle);
    const geometryKind = GEOMETRY_TYPE_TO_KIND[dto.geometryType];

    const layer = await this.layersRepository.save(
      this.layersRepository.create({
        tenantId,
        code,
        name: dto.name,
        description: dto.description ?? null,
        geometryKind,
        geometryRequired: false,
        sortOrder: dto.sortOrder ?? 0,
        styleConfig: styleConfig as unknown as Record<string, unknown>,
      }),
    );

    const draft = await this.createSchemaDraftInternal(
      tenantId,
      layer.id,
      userId,
      'Schema ban đầu',
    );

    await this.publishSchema(tenantId, draft.id, userId, { allowEmpty: true });

    const publishedLayer = await this.layersRepository.findOne({
      where: { id: layer.id, tenantId },
    });
    if (!publishedLayer) {
      throw new NotFoundException('Layer không tồn tại');
    }

    return this.enrichLayerDetail(tenantId, publishedLayer);
  }

  async updateLayer(tenantId: string, layerId: string, dto: UpdateLayerDto) {
    const layer = await this.findLayer(tenantId, layerId, false);

    if (dto.name !== undefined) layer.name = dto.name;
    if (dto.description !== undefined) layer.description = dto.description;
    if (dto.sortOrder !== undefined) layer.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) layer.isActive = dto.isActive;

    if (dto.geometryType !== undefined || dto.style !== undefined) {
      const currentStyle = parseStoredStyleConfig(
        layer.geometryKind,
        layer.styleConfig ?? {},
      );
      const geometryType =
        dto.geometryType ??
        currentStyle?.geometryType ??
        GEOMETRY_KIND_TO_TYPE[layer.geometryKind];

      if (!geometryType) {
        throw new BadRequestException('Không xác định được geometryType');
      }

      const mergedStyle = {
        ...this.flattenStyleForInput(currentStyle),
        ...(dto.style ?? {}),
      };
      const resolvedStyle = await this.resolveStyleInput(
        tenantId,
        geometryType,
        mergedStyle,
      );
      const styleConfig = buildStyleConfig(
        geometryType,
        resolvedStyle,
      );

      if (dto.geometryType !== undefined) {
        const countRows = await this.dataSource.query(
          `SELECT COUNT(*)::int AS cnt FROM features
           WHERE tenant_id = $1 AND layer_id = $2 AND deleted_at IS NULL AND geometry IS NOT NULL`,
          [tenantId, layerId],
        );
        if (countRows[0]?.cnt > 0) {
          throw new BadRequestException(
            'Không đổi loại geometry khi layer đã có bản ghi có tọa độ',
          );
        }
        layer.geometryKind = GEOMETRY_TYPE_TO_KIND[dto.geometryType];
      }

      layer.styleConfig = styleConfig as unknown as Record<string, unknown>;
    }

    await this.layersRepository.save(layer);
    return this.enrichLayerDetail(tenantId, layer);
  }

  async deleteLayer(tenantId: string, layerId: string, _userId: string) {
    await this.findLayer(tenantId, layerId, false);

    return this.dataSource.transaction(async (manager) => {
      const countRows = await manager.query(
        `SELECT COUNT(*)::int AS cnt FROM features
         WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );
      const recordsDeleted = countRows[0]?.cnt ?? 0;

      await manager.query(
        `DELETE FROM feature_relations
         WHERE tenant_id = $1
         AND (
           relation_definition_id IN (
             SELECT id FROM relation_definitions
             WHERE tenant_id = $1
             AND (source_layer_id = $2 OR target_layer_id = $2)
           )
           OR source_feature_id IN (
             SELECT id FROM features WHERE tenant_id = $1 AND layer_id = $2
           )
           OR target_feature_id IN (
             SELECT id FROM features WHERE tenant_id = $1 AND layer_id = $2
           )
         )`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM features WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM relation_definitions
         WHERE tenant_id = $1 AND (source_layer_id = $2 OR target_layer_id = $2)`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM import_template_targets
         WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `UPDATE import_templates SET root_layer_id = NULL
         WHERE tenant_id = $1 AND root_layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM schema_migration_jobs
         WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM datasets WHERE tenant_id = $1 AND source_layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM layer_permissions WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM schema_field_versions WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `UPDATE layers SET current_schema_version_id = NULL
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM layer_schema_versions WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM fields WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM layer_views WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM layer_map_styles WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `UPDATE role_assignments SET layer_id = NULL
         WHERE tenant_id = $1 AND layer_id = $2`,
        [tenantId, layerId],
      );

      await manager.query(
        `DELETE FROM layers WHERE tenant_id = $1 AND id = $2`,
        [tenantId, layerId],
      );

      return { id: layerId, deleted: true, recordsDeleted };
    });
  }

  async getLayerById(tenantId: string, layerId: string) {
    const layer = await this.findLayer(tenantId, layerId);
    return this.enrichLayerDetail(tenantId, layer);
  }

  async getLayerByCode(tenantId: string, code: string) {
    const layer = await this.layersRepository.findOne({
      where: { tenantId, code, isActive: true },
    });
    if (!layer) {
      throw new NotFoundException(`Layer không tồn tại: ${code}`);
    }
    return this.enrichLayerDetail(tenantId, layer);
  }

  async getPublishedSchema(tenantId: string, layerId: string) {
    const layer = await this.findLayer(tenantId, layerId);
    if (!layer.currentSchemaVersionId) {
      throw new NotFoundException('Layer chưa có schema published');
    }
    return this.getSchemaById(tenantId, layerId, layer.currentSchemaVersionId);
  }

  /**
   * Schema cho FE: published nếu có, không thì trả draft (layer mới chưa có field).
   * `status=draft` | `status=published` để ép một loại cụ thể.
   */
  async getLayerSchema(tenantId: string, layerId: string, status?: string) {
    if (status === 'draft') {
      return this.getDraftSchema(tenantId, layerId);
    }

    if (status === 'published') {
      return this.getPublishedSchema(tenantId, layerId);
    }

    const layer = await this.findLayer(tenantId, layerId, false);
    if (layer.currentSchemaVersionId) {
      return this.getSchemaById(
        tenantId,
        layerId,
        layer.currentSchemaVersionId,
      );
    }

    const draft = await this.schemaVersionsRepository.findOne({
      where: { tenantId, layerId, status: 'draft' },
      order: { version: 'DESC' },
    });
    if (draft) {
      return this.getSchemaById(tenantId, layerId, draft.id);
    }

    throw new NotFoundException(
      'Layer chưa có schema. Hãy thêm ít nhất một trường dữ liệu.',
    );
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

  async getSchemaDraftById(tenantId: string, schemaId: string) {
    const schema = await this.findDraftSchema(tenantId, schemaId);
    return this.getSchemaById(tenantId, schema.layerId, schema.id);
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

  async publishSchema(
    tenantId: string,
    schemaId: string,
    userId: string,
    options?: { allowEmpty?: boolean },
  ) {
    const schema = await this.findDraftSchema(tenantId, schemaId);
    const layer = await this.findLayer(tenantId, schema.layerId, false);

    const activeFields = await this.schemaFieldsRepository.count({
      where: { schemaVersionId: schema.id, isActive: true },
    });
    if (activeFields === 0 && !options?.allowEmpty) {
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
    userId: string,
    dto: CreateFieldDto,
  ) {
    const schema = await this.resolveDraftSchemaForEdit(
      tenantId,
      schemaId,
      userId,
    );
    const code = await generateUniqueFieldCode(
      this.fieldsRepository,
      schema.layerId,
      dto.label,
    );

    const dupSchemaField = await this.schemaFieldsRepository.findOne({
      where: { schemaVersionId: schema.id, code },
    });
    if (dupSchemaField) {
      throw new ConflictException(`Field code đã có trong draft: ${code}`);
    }

    await this.assertFieldDataSchema(tenantId, dto.fieldType, dto.dataSchema ?? {});

    const field = await this.fieldsRepository.save(
      this.fieldsRepository.create({
        layerId: schema.layerId,
        tenantId,
        storageKey: code,
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
        code,
        label: dto.label,
        fieldType: dto.fieldType,
        dataSchema: dto.dataSchema ?? {},
        uiSchema: dto.uiSchema ?? {},
        displaySchema: dto.displaySchema ?? {},
        sortOrder: dto.sortOrder ?? parseInt(maxOrder?.max ?? '0', 10) + 1,
      }),
    );

    return this.autoPublishDraftAfterFieldChange(tenantId, schema.id, userId);
  }

  async updateFieldInDraft(
    tenantId: string,
    schemaId: string,
    fieldId: string,
    userId: string,
    dto: UpdateFieldDto,
  ) {
    const schema = await this.resolveDraftSchemaForEdit(
      tenantId,
      schemaId,
      userId,
    );
    const schemaField = await this.schemaFieldsRepository.findOne({
      where: { schemaVersionId: schema.id, fieldId, layerId: schema.layerId },
    });
    if (!schemaField) {
      throw new NotFoundException('Field không tồn tại trong draft');
    }

    const nextFieldType = dto.fieldType ?? schemaField.fieldType;
    const nextDataSchema =
      dto.dataSchema !== undefined ? dto.dataSchema : schemaField.dataSchema;
    await this.assertFieldDataSchema(tenantId, nextFieldType, nextDataSchema ?? {});

    if (dto.label !== undefined) schemaField.label = dto.label;
    if (dto.fieldType !== undefined) schemaField.fieldType = dto.fieldType;
    if (dto.dataSchema !== undefined) schemaField.dataSchema = dto.dataSchema;
    if (dto.uiSchema !== undefined) schemaField.uiSchema = dto.uiSchema;
    if (dto.displaySchema !== undefined) {
      schemaField.displaySchema = {
        ...schemaField.displaySchema,
        ...dto.displaySchema,
      };
    }
    if (dto.sortOrder !== undefined) schemaField.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) schemaField.isActive = dto.isActive;

    await this.schemaFieldsRepository.save(schemaField);
    return this.autoPublishDraftAfterFieldChange(tenantId, schema.id, userId);
  }

  async reorderFieldsInDraft(
    tenantId: string,
    schemaId: string,
    userId: string,
    fieldIds: string[],
  ) {
    const schema = await this.resolveDraftSchemaForEdit(
      tenantId,
      schemaId,
      userId,
    );
    const fields = await this.schemaFieldsRepository.find({
      where: {
        schemaVersionId: schema.id,
        layerId: schema.layerId,
        isActive: true,
      },
    });

    if (fields.length === 0) {
      throw new BadRequestException('Schema draft chưa có field');
    }

    const uniqueIds = new Set(fieldIds);
    if (uniqueIds.size !== fieldIds.length) {
      throw new BadRequestException('fieldIds không được trùng lặp');
    }

    if (fieldIds.length !== fields.length) {
      throw new BadRequestException(
        `Phải gửi đủ ${fields.length} fieldId theo thứ tự hiển thị`,
      );
    }

    const activeFieldIds = new Set(fields.map((field) => field.fieldId));
    for (const fieldId of fieldIds) {
      if (!activeFieldIds.has(fieldId)) {
        throw new BadRequestException(`Field không thuộc draft: ${fieldId}`);
      }
    }

    await this.dataSource.transaction(async (manager) => {
      for (let index = 0; index < fieldIds.length; index += 1) {
        await manager.query(
          `UPDATE schema_field_versions
           SET sort_order = $4
           WHERE schema_version_id = $1 AND layer_id = $2 AND field_id = $3`,
          [schema.id, schema.layerId, fieldIds[index], index + 1],
        );
      }
    });

    return this.autoPublishDraftAfterFieldChange(tenantId, schema.id, userId);
  }

  async deleteFieldFromDraft(
    tenantId: string,
    schemaId: string,
    fieldId: string,
    userId: string,
  ) {
    const schema = await this.resolveDraftSchemaForEdit(
      tenantId,
      schemaId,
      userId,
    );
    const schemaField = await this.schemaFieldsRepository.findOne({
      where: { schemaVersionId: schema.id, fieldId },
    });
    if (!schemaField) {
      throw new NotFoundException('Field không tồn tại trong draft');
    }

    schemaField.isActive = false;
    await this.schemaFieldsRepository.save(schemaField);
    return this.autoPublishDraftAfterFieldChange(tenantId, schema.id, userId);
  }

  private async autoPublishDraftAfterFieldChange(
    tenantId: string,
    schemaId: string,
    userId: string,
  ) {
    const activeFields = await this.schemaFieldsRepository.count({
      where: { schemaVersionId: schemaId, isActive: true },
    });
    return this.publishSchema(tenantId, schemaId, userId, {
      allowEmpty: activeFields === 0,
    });
  }

  async getSchemaFieldsForVersion(schemaVersionId: string, layerId: string) {
    return this.schemaFieldsRepository.find({
      where: { schemaVersionId, layerId, isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  private async resolveStyleInput(
    tenantId: string,
    geometryType: LayerGeometryType,
    style: LayerStyleInput,
  ): Promise<Record<string, unknown>> {
    const input: Record<string, unknown> = { ...style };

    const attachmentId = String(style.iconAttachmentId ?? '').trim();
    if (attachmentId) {
      const attachment = await this.assetsService.getAttachment(
        tenantId,
        attachmentId,
      );
      input.iconUrl = this.assetsService.buildPublicUrl(attachment.id);
      input.iconAttachmentId = attachment.id;
    }

    return input;
  }

  private flattenStyleForInput(
    stored: LayerStyleConfig | null,
  ): Record<string, unknown> {
    if (!stored) return {};

    if (stored.geometryType === 'point') {
      const icon = stored.icon;
      if (icon.source === 'upload') {
        return {
          iconAttachmentId: icon.attachmentId,
          iconUrl: icon.url,
        };
      }
      return { icon: icon.name };
    }

    if (stored.geometryType === 'line') {
      const base = {
        lineColor: stored.lineColor,
        lineWidth: stored.lineWidth,
      };
      if (!stored.icon) return base;
      if (stored.icon.source === 'upload') {
        return {
          ...base,
          iconAttachmentId: stored.icon.attachmentId,
          iconUrl: stored.icon.url,
        };
      }
      return { ...base, icon: stored.icon.name };
    }

    const base = {
      fillColor: stored.fillColor,
      strokeColor: stored.strokeColor,
    };
    if (!stored.icon) return base;
    if (stored.icon.source === 'upload') {
      return {
        ...base,
        iconAttachmentId: stored.icon.attachmentId,
        iconUrl: stored.icon.url,
      };
    }
    return { ...base, icon: stored.icon.name };
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
      id: schema.id,
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

  /**
   * Cho phép thêm/sửa field qua schemaId draft hoặc published (current).
   * Nếu là published → tự tạo draft copy trước khi chỉnh.
   */
  private async resolveDraftSchemaForEdit(
    tenantId: string,
    schemaId: string,
    userId: string,
  ) {
    const schema = await this.schemaVersionsRepository.findOne({
      where: { id: schemaId, tenantId },
    });
    if (!schema) {
      throw new NotFoundException('Schema không tồn tại');
    }

    if (schema.status === 'draft') {
      return schema;
    }

    if (schema.status === 'published') {
      const existingDraft = await this.schemaVersionsRepository.findOne({
        where: { tenantId, layerId: schema.layerId, status: 'draft' },
        order: { version: 'DESC' },
      });
      if (existingDraft) {
        return existingDraft;
      }

      return this.createSchemaDraftInternal(
        tenantId,
        schema.layerId,
        userId,
        'Draft từ published schema',
      );
    }

    throw new BadRequestException('Schema không thể chỉnh sửa');
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
    const style = parseStoredStyleConfig(
      layer.geometryKind,
      layer.styleConfig ?? {},
    );
    return {
      id: layer.id,
      code: layer.code,
      name: layer.name,
      description: layer.description,
      geometryType:
        style?.geometryType ?? GEOMETRY_KIND_TO_TYPE[layer.geometryKind],
      geometryKind: layer.geometryKind,
      geometryRequired: layer.geometryRequired,
      sortOrder: layer.sortOrder,
      style,
      endpoint: `/api/layers/${layer.id}/geojson`,
    };
  }

  private toLayerDetail(layer: LayerEntity, draftSchemaId: string | null = null) {
    const schemaStatus = layer.currentSchemaVersionId
      ? draftSchemaId
        ? 'draft'
        : 'published'
      : 'draft';

    return {
      ...this.toLayerSummary(layer),
      renderMode: layer.renderMode,
      isActive: layer.isActive,
      currentSchemaVersionId: layer.currentSchemaVersionId,
      draftSchemaId,
      schemaStatus,
    };
  }

  private async enrichLayerDetail(tenantId: string, layer: LayerEntity) {
    const draftSchemaId = await this.findDraftSchemaId(tenantId, layer.id);
    return this.toLayerDetail(layer, draftSchemaId);
  }

  private async findDraftSchemaId(
    tenantId: string,
    layerId: string,
  ): Promise<string | null> {
    const draft = await this.schemaVersionsRepository.findOne({
      where: { tenantId, layerId, status: 'draft' },
      order: { version: 'DESC' },
      select: { id: true },
    });
    return draft?.id ?? null;
  }

  private async resolveDraftSchemaIdMap(tenantId: string, layerIds: string[]) {
    const map = new Map<string, string>();
    if (layerIds.length === 0) {
      return map;
    }

    const drafts = await this.schemaVersionsRepository.find({
      where: {
        tenantId,
        layerId: In(layerIds),
        status: 'draft',
      },
      order: { version: 'DESC' },
      select: { id: true, layerId: true },
    });

    for (const draft of drafts) {
      if (!map.has(draft.layerId)) {
        map.set(draft.layerId, draft.id);
      }
    }

    return map;
  }

  private async assertFieldDataSchema(
    tenantId: string,
    fieldType: string,
    dataSchema: Record<string, unknown>,
  ) {
    validateFieldDataSchema(fieldType, dataSchema);

    if (['category', 'multi_category'].includes(fieldType)) {
      const dictionaryCode = resolveDictionaryCode(dataSchema);
      const exists = await this.dictionariesService.exists(
        tenantId,
        dictionaryCode,
      );
      if (!exists) {
        throw new BadRequestException(
          `Danh mục không tồn tại: ${dictionaryCode}. Tạo danh mục trước khi gắn vào field.`,
        );
      }
    }
  }
}

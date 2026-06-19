import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LayerEntity } from '../database/entities/metadata.entity';
import { SavedViewEntity } from '../database/entities/saved-view.entity';
import { MetadataService } from '../metadata/metadata.service';
import {
  CreateSavedViewDto,
  PreviewSavedViewDto,
  SavedViewConfigDto,
  SavedViewFilterDto,
  UpdateSavedViewDto,
} from './dto/saved-view.dto';

const FIELD_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const TECHNICAL_FIELDS = new Set([
  'id',
  'geom',
  'geometry',
  'entity_id',
  'created_at',
  'updated_at',
  'deleted_at',
]);
const NUMERIC_FIELD_TYPES = new Set([
  'integer',
  'number',
  'decimal',
  'money',
  'measurement',
  'quantity',
]);
const DATE_FIELD_TYPES = new Set(['date', 'datetime', 'timestamp']);

type SchemaField = {
  code: string;
  label: string;
  fieldType: string;
  dataSchema: Record<string, unknown>;
};

@Injectable()
export class SavedViewsService {
  constructor(
    @InjectRepository(SavedViewEntity)
    private readonly savedViewsRepository: Repository<SavedViewEntity>,
    @InjectRepository(LayerEntity)
    private readonly layersRepository: Repository<LayerEntity>,
    private readonly metadataService: MetadataService,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    tenantId: string,
    userId: string,
    isAdmin: boolean,
    layerId?: string,
  ) {
    if (layerId) {
      await this.metadataService.getLayerById(tenantId, layerId);
    }

    const query = this.savedViewsRepository
      .createQueryBuilder('view')
      .where('view.tenant_id = :tenantId', { tenantId });
    if (!isAdmin) {
      query.andWhere('(view.is_public = TRUE OR view.created_by = :userId)', {
        userId,
      });
    }
    if (layerId) {
      query.andWhere('view.layer_id = :layerId', { layerId });
    }
    const views = await query
      .orderBy('view.updated_at', 'DESC')
      .addOrderBy('view.name', 'ASC')
      .getMany();

    return this.withLayerNames(tenantId, views);
  }

  async get(tenantId: string, id: string, userId: string, isAdmin: boolean) {
    const view = await this.getForQuery(tenantId, id);
    this.assertCanView(view, userId, isAdmin);
    const [result] = await this.withLayerNames(tenantId, [view]);
    return result;
  }

  async create(tenantId: string, userId: string, dto: CreateSavedViewDto) {
    await this.metadataService.getLayerById(tenantId, dto.layerId);
    await this.validateConfig(tenantId, dto.layerId, dto.config);

    const saved = await this.savedViewsRepository.save(
      this.savedViewsRepository.create({
        tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        layerId: dto.layerId,
        viewType: dto.viewType ?? 'table',
        config: this.normalizeConfig(dto.config),
        isPublic: dto.isPublic ?? false,
        createdBy: userId,
      }),
    );

    return this.get(tenantId, saved.id, userId, false);
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    isAdmin: boolean,
    dto: UpdateSavedViewDto,
  ) {
    const view = await this.getForQuery(tenantId, id);
    this.assertCanEdit(view, userId, isAdmin);
    const layerId = dto.layerId ?? view.layerId;
    const config = dto.config ?? view.config;

    await this.metadataService.getLayerById(tenantId, layerId);
    await this.validateConfig(tenantId, layerId, config);

    if (dto.name !== undefined) view.name = dto.name.trim();
    if (dto.description !== undefined) {
      view.description = dto.description?.trim() || null;
    }
    if (dto.layerId !== undefined) view.layerId = dto.layerId;
    if (dto.viewType !== undefined) view.viewType = dto.viewType;
    if (dto.config !== undefined) {
      view.config = this.normalizeConfig(dto.config);
    }
    if (dto.isPublic !== undefined) view.isPublic = dto.isPublic;

    await this.savedViewsRepository.save(view);
    return this.get(tenantId, id, userId, isAdmin);
  }

  async duplicate(
    tenantId: string,
    id: string,
    userId: string,
    isAdmin: boolean,
  ) {
    const source = await this.getForQuery(tenantId, id);
    this.assertCanView(source, userId, isAdmin);
    const duplicated = await this.savedViewsRepository.save(
      this.savedViewsRepository.create({
        tenantId,
        name: `${source.name} - Copy`,
        description: source.description,
        layerId: source.layerId,
        viewType: source.viewType,
        config: this.normalizeConfig(source.config),
        isPublic: source.isPublic,
        createdBy: userId,
      }),
    );
    return this.get(tenantId, duplicated.id, userId, isAdmin);
  }

  async usage(tenantId: string, id: string) {
    await this.getForQuery(tenantId, id);
    const rows = await this.dataSource.query<
      Array<{ id: string; name: string; widget_count: string }>
    >(
      `
      SELECT d.id, d.name, COUNT(w.id)::text AS widget_count
      FROM dashboard_widgets w
      JOIN dashboard_revisions r ON r.id = w.dashboard_revision_id
      JOIN dashboards d ON d.id = r.dashboard_id AND d.tenant_id = r.tenant_id
      WHERE r.tenant_id = $1
        AND w.data_source_config->>'viewId' = $2
      GROUP BY d.id, d.name
      ORDER BY d.name ASC
      `,
      [tenantId, id],
    );
    return {
      widgetCount: rows.reduce(
        (total, row) => total + Number(row.widget_count),
        0,
      ),
      dashboards: rows.map((row) => ({ id: row.id, name: row.name })),
    };
  }

  async remove(tenantId: string, id: string, userId: string, isAdmin: boolean) {
    const view = await this.getForQuery(tenantId, id);
    this.assertCanEdit(view, userId, isAdmin);
    const usage = await this.usage(tenantId, id);
    if (usage.widgetCount > 0) {
      throw new ConflictException(
        `View này đang được sử dụng bởi ${usage.widgetCount} widget trong ${usage.dashboards.length} dashboard. Vui lòng đổi nguồn dữ liệu widget trước khi xóa.`,
      );
    }
    await this.savedViewsRepository.remove(view);
    return { id, deleted: true };
  }

  async preview(tenantId: string, dto: PreviewSavedViewDto) {
    await this.metadataService.getLayerById(tenantId, dto.layerId);
    const fields = await this.validateConfig(tenantId, dto.layerId, dto.config);
    const fieldMap = new Map(fields.map((field) => [field.code, field]));
    const config = this.normalizeConfig(dto.config);
    const selectedFields = this.resolveVisibleFields(
      fields,
      config.visibleFields,
    );
    const params: unknown[] = [tenantId, dto.layerId];
    const whereParts = [
      'f.tenant_id = $1',
      'f.layer_id = $2',
      'f.deleted_at IS NULL',
    ];
    this.appendFilters(whereParts, params, config.filters, fieldMap);

    const totalRows = await this.dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total FROM features f WHERE ${whereParts.join(' AND ')}`,
      params,
    );
    const sortClause = this.buildSortClause(config.sorts, fieldMap);
    const rowLimit = config.previewLimit;
    const records = await this.dataSource.query<
      Array<{ id: string; properties: Record<string, unknown> }>
    >(
      `
      SELECT f.id, f.properties
      FROM features f
      WHERE ${whereParts.join(' AND ')}
      ${sortClause}
      LIMIT ${rowLimit}
      `,
      params,
    );

    return {
      total: Number(totalRows[0]?.total ?? 0),
      previewLimit: rowLimit,
      fields: selectedFields.map((field) => ({
        code: field.code,
        label: field.label,
        fieldType: field.fieldType,
      })),
      rows: records.map((record) =>
        Object.fromEntries(
          selectedFields.map((field) => [
            field.code,
            record.properties[field.code] ?? null,
          ]),
        ),
      ),
    };
  }

  async getForQuery(tenantId: string, id: string): Promise<SavedViewEntity> {
    const view = await this.savedViewsRepository.findOne({
      where: { id, tenantId },
    });
    if (!view) {
      throw new NotFoundException('Saved View không tồn tại');
    }
    return view;
  }

  private async validateConfig(
    tenantId: string,
    layerId: string,
    config: SavedViewConfigDto,
  ): Promise<SchemaField[]> {
    const fields = await this.getSchemaFields(tenantId, layerId);
    const fieldMap = new Map(fields.map((field) => [field.code, field]));
    const referencedFields = [
      ...(config.filters ?? []).map((filter) => filter.field),
      ...(config.sorts ?? []).map((sort) => sort.field),
      ...(config.visibleFields ?? []),
    ];

    for (const field of referencedFields) {
      if (!FIELD_CODE_PATTERN.test(field) || !fieldMap.has(field)) {
        throw new BadRequestException(
          `Field "${field}" không tồn tại trong layer đã chọn`,
        );
      }
    }

    for (const filter of config.filters ?? []) {
      const field = fieldMap.get(filter.field)!;
      const allowed = this.allowedOperators(field.fieldType);
      if (!allowed.has(filter.operator)) {
        throw new BadRequestException(
          `Operator ${filter.operator} không phù hợp với field ${filter.field} (${field.fieldType})`,
        );
      }
      if (
        !['empty', 'not_empty'].includes(filter.operator) &&
        (filter.value === undefined || filter.value === null)
      ) {
        throw new BadRequestException(
          `Filter ${filter.field}: value là bắt buộc`,
        );
      }
    }

    return fields;
  }

  private async getSchemaFields(
    tenantId: string,
    layerId: string,
  ): Promise<SchemaField[]> {
    try {
      return (await this.metadataService.getPublishedSchema(tenantId, layerId))
        .fields;
    } catch {
      return (await this.metadataService.getDraftSchema(tenantId, layerId))
        .fields;
    }
  }

  private allowedOperators(fieldType: string) {
    if (NUMERIC_FIELD_TYPES.has(fieldType) || DATE_FIELD_TYPES.has(fieldType)) {
      return new Set([
        'eq',
        'neq',
        'gt',
        'gte',
        'lt',
        'lte',
        'empty',
        'not_empty',
      ]);
    }
    if (fieldType === 'boolean') {
      return new Set(['eq', 'neq', 'empty', 'not_empty']);
    }
    if (fieldType === 'category' || fieldType === 'multi_category') {
      return new Set(['eq', 'neq', 'empty', 'not_empty']);
    }
    return new Set([
      'eq',
      'neq',
      'contains',
      'not_contains',
      'empty',
      'not_empty',
    ]);
  }

  private appendFilters(
    whereParts: string[],
    params: unknown[],
    filters: SavedViewFilterDto[],
    fieldMap: Map<string, SchemaField>,
  ) {
    for (const filter of filters) {
      const field = fieldMap.get(filter.field)!;
      const textExtract = this.textExtract(filter.field);
      if (filter.operator === 'empty') {
        whereParts.push(
          field.fieldType === 'multi_category'
            ? `(f.properties->'${filter.field}' IS NULL OR f.properties->'${filter.field}' = '[]'::jsonb)`
            : `${textExtract} IS NULL`,
        );
        continue;
      }
      if (filter.operator === 'not_empty') {
        whereParts.push(
          field.fieldType === 'multi_category'
            ? `(f.properties->'${filter.field}' IS NOT NULL AND f.properties->'${filter.field}' <> '[]'::jsonb)`
            : `${textExtract} IS NOT NULL`,
        );
        continue;
      }

      const parameter = `$${params.length + 1}`;
      if (field.fieldType === 'multi_category') {
        const expression = `(f.properties->'${filter.field}') ? ${parameter}`;
        whereParts.push(
          filter.operator === 'neq' ? `NOT (${expression})` : expression,
        );
        params.push(this.scalarToString(filter.value, filter.field));
        continue;
      }
      if (
        filter.operator === 'contains' ||
        filter.operator === 'not_contains'
      ) {
        whereParts.push(
          `${textExtract} ${filter.operator === 'not_contains' ? 'NOT ILIKE' : 'ILIKE'} ${parameter}`,
        );
        params.push(`%${this.scalarToString(filter.value, filter.field)}%`);
        continue;
      }

      const comparison = {
        eq: '=',
        neq: '<>',
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<=',
      }[filter.operator];
      const extract = NUMERIC_FIELD_TYPES.has(field.fieldType)
        ? this.numericExtract(filter.field, field)
        : textExtract;
      whereParts.push(`${extract} ${comparison} ${parameter}`);
      params.push(
        NUMERIC_FIELD_TYPES.has(field.fieldType)
          ? this.numericValue(filter.value, filter.field)
          : this.scalarToString(filter.value, filter.field),
      );
    }
  }

  private buildSortClause(
    sorts: Array<{ field: string; direction: 'asc' | 'desc' }>,
    fieldMap: Map<string, SchemaField>,
  ) {
    if (sorts.length === 0) return 'ORDER BY f.created_at DESC';
    const expressions = sorts.map((sort) => {
      const field = fieldMap.get(sort.field)!;
      const extract = NUMERIC_FIELD_TYPES.has(field.fieldType)
        ? this.numericExtract(sort.field, field)
        : this.textExtract(sort.field);
      return `${extract} ${sort.direction.toUpperCase()} NULLS LAST`;
    });
    return `ORDER BY ${expressions.join(', ')}, f.id ASC`;
  }

  private textExtract(fieldCode: string) {
    return `NULLIF(TRIM(f.properties->>'${fieldCode}'), '')`;
  }

  private numericExtract(fieldCode: string, field: SchemaField) {
    const jsonPath = `f.properties->'${fieldCode}'`;
    if (field.fieldType === 'money') {
      return `COALESCE((${jsonPath}->>'sourceValue')::numeric, (${jsonPath}->>'amount')::numeric, (f.properties->>'${fieldCode}')::numeric)`;
    }
    if (field.fieldType === 'measurement' || field.fieldType === 'quantity') {
      return `COALESCE((${jsonPath}->>'normalizedValue')::numeric, (${jsonPath}->>'value')::numeric, (f.properties->>'${fieldCode}')::numeric)`;
    }
    return `(f.properties->>'${fieldCode}')::numeric`;
  }

  private numericValue(value: unknown, fieldCode: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(
        `Filter ${fieldCode}: value phải là một số hợp lệ`,
      );
    }
    return parsed;
  }

  private scalarToString(value: unknown, fieldCode: string) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return `${value}`;
    }
    throw new BadRequestException(`Filter ${fieldCode}: value không hợp lệ`);
  }

  private resolveVisibleFields(fields: SchemaField[], requested: string[]) {
    const selectable = fields.filter(
      (field) => !TECHNICAL_FIELDS.has(field.code),
    );
    if (requested.length === 0) return selectable.slice(0, 6);
    const requestedSet = new Set(requested);
    return selectable.filter((field) => requestedSet.has(field.code));
  }

  private normalizeConfig(config: SavedViewConfigDto) {
    return {
      filterMode: 'and' as const,
      filters: config.filters ?? [],
      sorts: config.sorts ?? [],
      visibleFields: config.visibleFields ?? [],
      limit: config.limit ?? 100,
      previewLimit: config.previewLimit ?? 20,
    };
  }

  private assertCanView(
    view: SavedViewEntity,
    userId: string,
    isAdmin: boolean,
  ) {
    if (isAdmin || view.isPublic || view.createdBy === userId) return;
    throw new NotFoundException('Saved View không tồn tại');
  }

  private assertCanEdit(
    view: SavedViewEntity,
    userId: string,
    isAdmin: boolean,
  ) {
    if (isAdmin || view.createdBy === userId) return;
    throw new ForbiddenException('Không có quyền chỉnh sửa Saved View này');
  }

  private async withLayerNames(tenantId: string, views: SavedViewEntity[]) {
    const layerIds = [...new Set(views.map((view) => view.layerId))];
    const layers = layerIds.length
      ? await this.layersRepository
          .createQueryBuilder('layer')
          .where('layer.tenant_id = :tenantId', { tenantId })
          .andWhere('layer.id IN (:...layerIds)', { layerIds })
          .getMany()
      : [];
    const layerNames = new Map(layers.map((layer) => [layer.id, layer.name]));

    return views.map((view) => ({
      id: view.id,
      name: view.name,
      description: view.description,
      layerId: view.layerId,
      layerName: layerNames.get(view.layerId) ?? 'Layer không tồn tại',
      viewType: view.viewType,
      config: this.normalizeConfig(view.config),
      isPublic: view.isPublic,
      createdBy: view.createdBy,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    }));
  }
}

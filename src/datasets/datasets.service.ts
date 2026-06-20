import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DatasetEntity } from '../database/entities/dataset.entity';
import { slugifyLayerCode } from '../metadata/utils/layer-code.util';
import { SavedViewsService } from '../saved-views/saved-views.service';
import {
  CreateDatasetDto,
  DatasetConfigDto,
  DatasetFieldDto,
  PreviewDatasetDto,
  UpdateDatasetDto,
} from './dto/dataset.dto';

const NUMERIC_TYPES = new Set(['number', 'integer', 'decimal', 'currency']);

export type ResolvedDataset = {
  fields: DatasetFieldDto[];
  rows: Array<Record<string, unknown>>;
};

@Injectable()
export class DatasetsService {
  constructor(
    @InjectRepository(DatasetEntity)
    private readonly repository: Repository<DatasetEntity>,
    private readonly savedViewsService: SavedViewsService,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, userId: string, isAdmin: boolean) {
    const query = this.repository
      .createQueryBuilder('dataset')
      .where('dataset.tenant_id = :tenantId', { tenantId })
      .andWhere('dataset.is_active = TRUE');
    if (!isAdmin) {
      query.andWhere(
        '(dataset.is_public = TRUE OR dataset.created_by = :userId)',
        { userId },
      );
    }
    const rows = await query
      .orderBy('dataset.updated_at', 'DESC')
      .addOrderBy('dataset.name', 'ASC')
      .getMany();
    return rows.map((dataset) => this.toResponse(dataset));
  }

  async get(tenantId: string, id: string, userId: string, isAdmin: boolean) {
    const dataset = await this.getForQuery(tenantId, id);
    this.assertCanView(dataset, userId, isAdmin);
    return this.toResponse(dataset);
  }

  async create(tenantId: string, userId: string, dto: CreateDatasetDto) {
    await this.resolveConfig(tenantId, dto.config);
    const dataset = await this.repository.save(
      this.repository.create({
        tenantId,
        code: await this.uniqueCode(tenantId, dto.name),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        config: this.normalizeConfig(dto.config),
        isPublic: dto.isPublic ?? false,
        createdBy: userId,
        sourceLayerId: null,
        isActive: true,
      }),
    );
    return this.toResponse(dataset);
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    isAdmin: boolean,
    dto: UpdateDatasetDto,
  ) {
    const dataset = await this.getForQuery(tenantId, id);
    this.assertCanEdit(dataset, userId, isAdmin);
    if (dto.config) {
      await this.resolveConfig(tenantId, dto.config);
      dataset.config = this.normalizeConfig(dto.config);
    }
    if (dto.name !== undefined) dataset.name = dto.name.trim();
    if (dto.description !== undefined) {
      dataset.description = dto.description?.trim() || null;
    }
    if (dto.isPublic !== undefined) dataset.isPublic = dto.isPublic;
    return this.toResponse(await this.repository.save(dataset));
  }

  async preview(tenantId: string, dto: PreviewDatasetDto) {
    const resolved = await this.resolveConfig(tenantId, dto.config);
    const limit = dto.config.previewLimit ?? 20;
    return {
      total: resolved.rows.length,
      rows: resolved.rows.slice(0, limit),
      fields: resolved.fields,
      previewLimit: limit,
    };
  }

  async resolveDataset(tenantId: string, id: string) {
    const dataset = await this.getForQuery(tenantId, id);
    return this.resolveConfig(tenantId, dataset.config);
  }

  async duplicate(
    tenantId: string,
    id: string,
    userId: string,
    isAdmin: boolean,
  ) {
    const source = await this.getForQuery(tenantId, id);
    this.assertCanView(source, userId, isAdmin);
    const copy = await this.repository.save(
      this.repository.create({
        tenantId,
        code: await this.uniqueCode(tenantId, `${source.name} copy`),
        name: `${source.name} - Copy`,
        description: source.description,
        config: this.normalizeConfig(source.config),
        isPublic: source.isPublic,
        createdBy: userId,
        sourceLayerId: null,
        isActive: true,
      }),
    );
    return this.toResponse(copy);
  }

  async usage(tenantId: string, id: string) {
    await this.getForQuery(tenantId, id);
    const rows = await this.dataSource.query<
      Array<{ id: string; name: string; widget_count: string }>
    >(
      `SELECT d.id, d.name, COUNT(w.id)::text AS widget_count
       FROM dashboard_widgets w
       JOIN dashboard_revisions r ON r.id = w.dashboard_revision_id
       JOIN dashboards d ON d.id = r.dashboard_id AND d.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1 AND w.data_source_config->>'datasetId' = $2
       GROUP BY d.id, d.name ORDER BY d.name`,
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
    const dataset = await this.getForQuery(tenantId, id);
    this.assertCanEdit(dataset, userId, isAdmin);
    const usage = await this.usage(tenantId, id);
    if (usage.widgetCount > 0) {
      throw new ConflictException(
        `Dataset này đang được sử dụng bởi ${usage.widgetCount} widget trong ${usage.dashboards.length} dashboard.`,
      );
    }
    await this.repository.remove(dataset);
    return { id, deleted: true };
  }

  async getForQuery(tenantId: string, id: string) {
    const dataset = await this.repository.findOne({
      where: { id, tenantId, isActive: true },
    });
    if (!dataset) throw new NotFoundException('Dataset không tồn tại');
    return dataset;
  }

  private async resolveConfig(
    tenantId: string,
    rawConfig: DatasetConfigDto | Record<string, unknown>,
  ): Promise<ResolvedDataset> {
    const config = this.normalizeConfig(rawConfig);
    if (config.fields.length === 0) {
      throw new BadRequestException('Dataset phải có ít nhất 1 field chuẩn');
    }
    if (config.sources.length === 0) {
      throw new BadRequestException('Dataset phải có ít nhất 1 source');
    }
    const fieldKeys = new Set<string>();
    for (const field of config.fields) {
      if (fieldKeys.has(field.key)) {
        throw new BadRequestException(`Dataset field bị trùng: ${field.key}`);
      }
      fieldKeys.add(field.key);
    }

    const resultRows: Array<Record<string, unknown>> = [];
    for (const source of config.sources) {
      const resolved = await this.savedViewsService.resolveRowsForDataset(
        tenantId,
        source.viewId,
      );
      const sourceFields = new Map(
        resolved.fields.map((field) => [field.code, field]),
      );
      for (const field of config.fields) {
        const mapping = source.mapping[field.key];
        if (!mapping || typeof mapping !== 'string') {
          throw new BadRequestException(
            `Source ${source.sourceLabel}: thiếu mapping cho ${field.key}`,
          );
        }
        if (!mapping.startsWith('__constant:') && !sourceFields.has(mapping)) {
          throw new BadRequestException(
            `Source ${source.sourceLabel}: field ${mapping} không tồn tại`,
          );
        }
      }
      for (const properties of resolved.rows) {
        const row: Record<string, unknown> = {};
        for (const field of config.fields) {
          const mapping = source.mapping[field.key];
          const raw = mapping.startsWith('__constant:')
            ? mapping.slice('__constant:'.length)
            : properties[mapping];
          row[field.key] = this.castValue(raw, field);
        }
        resultRows.push(row);
      }
    }
    return { fields: config.fields, rows: resultRows };
  }

  private castValue(value: unknown, field: DatasetFieldDto) {
    if (value === null || value === undefined || value === '') return null;
    const scalar = this.unwrapValue(value);
    if (NUMERIC_TYPES.has(field.type)) {
      const parsed = Number(scalar);
      if (!Number.isFinite(parsed)) return null;
      return field.type === 'integer' ? Math.trunc(parsed) : parsed;
    }
    if (field.type === 'boolean') {
      if (typeof scalar === 'boolean') return scalar;
      return ['true', '1', 'yes', 'có'].includes(String(scalar).toLowerCase());
    }
    if (field.type === 'date') return String(scalar);
    if (Array.isArray(scalar)) return scalar.join(', ');
    return String(scalar);
  }

  private unwrapValue(value: unknown): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value;
    }
    const item = value as Record<string, unknown>;
    return (
      item.sourceValue ??
      item.normalizedValue ??
      item.amount ??
      item.value ??
      value
    );
  }

  private normalizeConfig(raw: DatasetConfigDto | Record<string, unknown>) {
    const config = raw as Partial<DatasetConfigDto>;
    return {
      fields: config.fields ?? [],
      sources: config.sources ?? [],
      previewLimit: config.previewLimit ?? 20,
    };
  }

  private toResponse(dataset: DatasetEntity) {
    return {
      id: dataset.id,
      code: dataset.code,
      name: dataset.name,
      description: dataset.description,
      config: this.normalizeConfig(dataset.config),
      isPublic: dataset.isPublic,
      createdBy: dataset.createdBy,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
    };
  }

  private assertCanView(
    dataset: DatasetEntity,
    userId: string,
    isAdmin: boolean,
  ) {
    if (isAdmin || dataset.isPublic || dataset.createdBy === userId) return;
    throw new NotFoundException('Dataset không tồn tại');
  }

  private assertCanEdit(
    dataset: DatasetEntity,
    userId: string,
    isAdmin: boolean,
  ) {
    if (isAdmin || dataset.createdBy === userId) return;
    throw new ForbiddenException('Không có quyền chỉnh sửa Dataset này');
  }

  private async uniqueCode(tenantId: string, name: string) {
    const base = slugifyLayerCode(name);
    let code = base;
    let suffix = 2;
    while (await this.repository.findOne({ where: { tenantId, code } })) {
      code = `${base}_${suffix++}`;
    }
    return code;
  }
}

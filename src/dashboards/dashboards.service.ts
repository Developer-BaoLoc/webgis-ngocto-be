import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import {
  DashboardEntity,
  DashboardRevisionEntity,
  DashboardWidgetEntity,
} from '../database/entities/analytics.entity';
import { MetadataService } from '../metadata/metadata.service';
import { slugifyLayerCode } from '../metadata/utils/layer-code.util';
import {
  CreateDashboardDto,
  DashboardWidgetInputDto,
  UpdateDashboardDraftDto,
} from './dto/dashboard.dto';

export type DashboardWidgetSummary = {
  id: string;
  widgetType: string;
  title: string | null;
  layoutConfig: Record<string, unknown>;
  dataSourceConfig: Record<string, unknown>;
  displayConfig: Record<string, unknown>;
  interactionConfig: Record<string, unknown>;
  sortOrder: number;
};

@Injectable()
export class DashboardsService {
  constructor(
    @InjectRepository(DashboardEntity)
    private readonly dashboardsRepository: Repository<DashboardEntity>,
    @InjectRepository(DashboardRevisionEntity)
    private readonly revisionsRepository: Repository<DashboardRevisionEntity>,
    @InjectRepository(DashboardWidgetEntity)
    private readonly widgetsRepository: Repository<DashboardWidgetEntity>,
    private readonly metadataService: MetadataService,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, userId: string) {
    const items = await this.dashboardsRepository.find({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
    });

    const revisions = items.length
      ? await this.revisionsRepository.find({
          where: { dashboardId: In(items.map((item) => item.id)), tenantId },
        })
      : [];
    const dashboardIdsWithDraft = new Set(
      revisions
        .filter((revision) => revision.publishedAt === null)
        .map((revision) => revision.dashboardId),
    );

    const activePublishedId = items.find(
      (item) => item.status === 'published',
    )?.id;

    return items
      .filter(
        (item) =>
          item.scope === 'public' ||
          item.ownerUserId === userId ||
          item.scope === 'organization',
      )
      .map((item) => ({
        ...this.toSummary(item),
        hasDraft: dashboardIdsWithDraft.has(item.id),
        hasPublished: item.id === activePublishedId,
      }));
  }

  async create(tenantId: string, userId: string, dto: CreateDashboardDto) {
    const scope = dto.scope ?? 'private';
    const code = await this.generateUniqueCode(tenantId, dto.name);

    const dashboardId = await this.dataSource.transaction(async (manager) => {
      const dashboard = await manager.getRepository(DashboardEntity).save(
        manager.getRepository(DashboardEntity).create({
          tenantId,
          ownerUserId: scope === 'private' ? userId : null,
          code,
          name: dto.name,
          description: dto.description ?? null,
          scope,
          status: 'draft',
        }),
      );

      const revision = await manager
        .getRepository(DashboardRevisionEntity)
        .save(
          manager.getRepository(DashboardRevisionEntity).create({
            dashboardId: dashboard.id,
            tenantId,
            version: 1,
            layoutConfig: { columns: 12 },
            filterConfig: [],
          }),
        );

      dashboard.currentRevisionId = revision.id;
      await manager.getRepository(DashboardEntity).save(dashboard);

      return dashboard.id;
    });

    return this.getDetail(tenantId, dashboardId, userId, 'draft');
  }

  async getDetail(
    tenantId: string,
    dashboardId: string,
    userId: string,
    mode: 'draft' | 'published' = 'published',
  ) {
    const dashboard = await this.findDashboard(tenantId, dashboardId);
    this.assertCanView(dashboard, userId);

    const revision = await this.resolveRevision(dashboard, mode);
    if (mode === 'published' && !revision) {
      throw new BadRequestException('Dashboard này chưa được xuất bản.');
    }
    if (mode === 'draft' && !revision) {
      throw new BadRequestException('Dashboard chưa có bản nháp.');
    }
    const widgets = revision
      ? await this.widgetsRepository.find({
          where: { dashboardRevisionId: revision.id },
          order: { sortOrder: 'ASC', createdAt: 'ASC' },
        })
      : [];

    return {
      ...this.toSummary(dashboard),
      description: dashboard.description,
      layoutConfig: revision?.layoutConfig ?? { columns: 12 },
      filterConfig: revision?.filterConfig ?? [],
      revision: revision
        ? {
            id: revision.id,
            version: revision.version,
            publishedAt: revision.publishedAt,
          }
        : null,
      revisionStatus: revision?.publishedAt ? 'published' : 'draft',
      version: revision?.version,
      widgets: widgets.map((widget) => this.toWidgetSummary(widget)),
    };
  }

  async updateDraft(
    tenantId: string,
    dashboardId: string,
    userId: string,
    dto: UpdateDashboardDraftDto,
  ) {
    const dashboard = await this.findDashboard(tenantId, dashboardId);
    this.assertCanEdit(dashboard, userId);

    const revision = await this.getEditableRevision(dashboard);
    if (!revision) {
      throw new BadRequestException('Không có bản draft để chỉnh sửa');
    }

    if (dto.name !== undefined) dashboard.name = dto.name;
    if (dto.description !== undefined) {
      dashboard.description = dto.description ?? null;
    }
    if (dto.layoutConfig !== undefined) {
      revision.layoutConfig = dto.layoutConfig;
    }
    if (dto.filterConfig !== undefined) {
      revision.filterConfig = dto.filterConfig;
    }

    await this.dashboardsRepository.save(dashboard);
    await this.revisionsRepository.save(revision);

    if (dto.widgets !== undefined) {
      await this.replaceWidgets(revision.id, dto.widgets);
    }

    return this.getDetail(tenantId, dashboardId, userId, 'draft');
  }

  async publish(tenantId: string, dashboardId: string, userId: string) {
    const dashboard = await this.findDashboard(tenantId, dashboardId);
    this.assertCanEdit(dashboard, userId);

    if (dashboard.status === 'published' && dashboard.currentRevisionId) {
      const activeRevision = await this.revisionsRepository.findOne({
        where: {
          id: dashboard.currentRevisionId,
          dashboardId: dashboard.id,
          publishedAt: Not(IsNull()),
        },
      });
      const pendingDraft = await this.revisionsRepository.findOne({
        where: { dashboardId: dashboard.id, tenantId, publishedAt: IsNull() },
      });
      const publishedCount = await this.dashboardsRepository.count({
        where: { tenantId, status: 'published' },
      });
      if (activeRevision && !pendingDraft && publishedCount === 1) {
        return this.getDetail(tenantId, dashboardId, userId, 'published');
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const dashboardRepo = manager.getRepository(DashboardEntity);
      const revisionRepo = manager.getRepository(DashboardRevisionEntity);
      const widgetRepo = manager.getRepository(DashboardWidgetEntity);
      const dashboards = await dashboardRepo
        .createQueryBuilder('dashboard')
        .where('dashboard.tenant_id = :tenantId', { tenantId })
        .orderBy('dashboard.id', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      const target = dashboards.find((item) => item.id === dashboardId);
      if (!target) throw new NotFoundException('Dashboard không tồn tại');

      let revision = await revisionRepo.findOne({
        where: { dashboardId: target.id, tenantId, publishedAt: IsNull() },
        order: { version: 'DESC' },
      });
      if (
        !revision &&
        target.status === 'published' &&
        target.currentRevisionId
      ) {
        revision = await revisionRepo.findOne({
          where: {
            id: target.currentRevisionId,
            dashboardId: target.id,
            tenantId,
            publishedAt: Not(IsNull()),
          },
        });
      }
      if (!revision) {
        throw new BadRequestException('Không có bản draft để publish');
      }
      const widgetCount = await widgetRepo.count({
        where: { dashboardRevisionId: revision.id },
      });
      if (widgetCount === 0) {
        throw new BadRequestException('Dashboard phải có ít nhất 1 widget');
      }

      for (const other of dashboards) {
        if (other.id === target.id || other.status !== 'published') continue;
        let editable = await revisionRepo.findOne({
          where: {
            dashboardId: other.id,
            tenantId,
            publishedAt: IsNull(),
          },
          order: { version: 'DESC' },
        });
        if (!editable && other.currentRevisionId) {
          const published = await revisionRepo.findOne({
            where: {
              id: other.currentRevisionId,
              dashboardId: other.id,
              tenantId,
            },
          });
          if (published) {
            const maxVersion = await revisionRepo
              .createQueryBuilder('revision')
              .select('COALESCE(MAX(revision.version), 0)', 'max')
              .where('revision.dashboard_id = :dashboardId', {
                dashboardId: other.id,
              })
              .getRawOne<{ max: string }>();
            editable = await revisionRepo.save(
              revisionRepo.create({
                dashboardId: other.id,
                tenantId,
                version: Number(maxVersion?.max ?? 0) + 1,
                layoutConfig: published.layoutConfig,
                filterConfig: published.filterConfig,
              }),
            );
            const publishedWidgets = await widgetRepo.find({
              where: { dashboardRevisionId: published.id },
              order: { sortOrder: 'ASC', createdAt: 'ASC' },
            });
            await widgetRepo.save(
              publishedWidgets.map((widget) =>
                widgetRepo.create({
                  dashboardRevisionId: editable!.id,
                  widgetType: widget.widgetType,
                  title: widget.title,
                  layoutConfig: widget.layoutConfig,
                  dataSourceConfig: widget.dataSourceConfig,
                  displayConfig: widget.displayConfig,
                  interactionConfig: widget.interactionConfig,
                  sortOrder: widget.sortOrder,
                }),
              ),
            );
          }
        }
        other.status = 'draft';
        other.currentRevisionId = editable?.id ?? other.currentRevisionId;
        await dashboardRepo.save(other);
      }

      if (!revision.publishedAt) {
        revision.publishedAt = new Date();
        revision.publishedBy = userId;
      }
      target.status = 'published';
      target.currentRevisionId = revision.id;
      await revisionRepo.save(revision);
      await dashboardRepo.save(target);
    });

    return this.getDetail(tenantId, dashboardId, userId, 'published');
  }

  async getCurrentPublished(tenantId: string, userId: string) {
    const dashboard = await this.dashboardsRepository.findOne({
      where: { tenantId, status: 'published' },
      order: { updatedAt: 'DESC' },
    });
    if (!dashboard) return null;
    return this.getDetail(tenantId, dashboard.id, userId, 'published');
  }

  async createDraftFromPublished(
    tenantId: string,
    dashboardId: string,
    userId: string,
  ) {
    const dashboard = await this.findDashboard(tenantId, dashboardId);
    this.assertCanEdit(dashboard, userId);

    if (dashboard.status !== 'published' || !dashboard.currentRevisionId) {
      throw new BadRequestException('Dashboard chưa publish');
    }

    const existingDraft = await this.revisionsRepository.findOne({
      where: {
        dashboardId: dashboard.id,
        tenantId,
        publishedAt: IsNull(),
      },
      order: { version: 'DESC' },
    });
    if (existingDraft) {
      return this.getDetail(tenantId, dashboardId, userId, 'draft');
    }

    const published = await this.revisionsRepository.findOne({
      where: { id: dashboard.currentRevisionId, dashboardId: dashboard.id },
    });
    if (!published) {
      throw new NotFoundException('Revision không tồn tại');
    }

    const maxVersion = await this.revisionsRepository
      .createQueryBuilder('r')
      .select('COALESCE(MAX(r.version), 0)', 'max')
      .where('r.dashboard_id = :dashboardId', { dashboardId: dashboard.id })
      .getRawOne<{ max: string }>();

    const draft = await this.revisionsRepository.save(
      this.revisionsRepository.create({
        dashboardId: dashboard.id,
        tenantId,
        version: parseInt(maxVersion?.max ?? '0', 10) + 1,
        layoutConfig: published.layoutConfig,
        filterConfig: published.filterConfig,
      }),
    );

    const widgets = await this.widgetsRepository.find({
      where: { dashboardRevisionId: published.id },
      order: { sortOrder: 'ASC' },
    });

    for (const widget of widgets) {
      await this.widgetsRepository.save(
        this.widgetsRepository.create({
          dashboardRevisionId: draft.id,
          widgetType: widget.widgetType,
          title: widget.title,
          layoutConfig: widget.layoutConfig,
          dataSourceConfig: widget.dataSourceConfig ?? {},
          displayConfig: widget.displayConfig,
          interactionConfig: widget.interactionConfig,
          sortOrder: widget.sortOrder,
        }),
      );
    }

    return this.getDetail(tenantId, dashboardId, userId, 'draft');
  }

  async getLayerFieldOptions(tenantId: string) {
    const layers = await this.metadataService.listLayersAdmin(tenantId);
    const result: Array<{
      layerId: string;
      layerCode: string;
      layerName: string;
      geometryType: string | null;
      fields: Array<{
        code: string;
        label: string;
        fieldType: string;
        dataSchema: Record<string, unknown>;
      }>;
    }> = [];

    for (const layer of layers) {
      let fields: Array<{
        code: string;
        label: string;
        fieldType: string;
        dataSchema: Record<string, unknown>;
      }> = [];
      try {
        const schema = await this.metadataService.getPublishedSchema(
          tenantId,
          layer.id,
        );
        fields = schema.fields.map((field) => ({
          code: field.code,
          label: field.label,
          fieldType: field.fieldType,
          dataSchema: field.dataSchema,
        }));
      } catch {
        try {
          const draft = await this.metadataService.getDraftSchema(
            tenantId,
            layer.id,
          );
          fields = draft.fields.map((field) => ({
            code: field.code,
            label: field.label,
            fieldType: field.fieldType,
            dataSchema: field.dataSchema,
          }));
        } catch {
          fields = [];
        }
      }

      result.push({
        layerId: layer.id,
        layerCode: layer.code,
        layerName: layer.name,
        geometryType: layer.geometryType,
        fields,
      });
    }

    return result;
  }

  private async replaceWidgets(
    revisionId: string,
    widgets: DashboardWidgetInputDto[],
  ) {
    await this.widgetsRepository.delete({ dashboardRevisionId: revisionId });

    for (const [index, widget] of widgets.entries()) {
      await this.widgetsRepository.save(
        this.widgetsRepository.create({
          dashboardRevisionId: revisionId,
          widgetType: widget.widgetType,
          title: widget.title ?? null,
          layoutConfig: widget.layoutConfig,
          dataSourceConfig: widget.dataSourceConfig ?? {},
          displayConfig: widget.displayConfig ?? {},
          interactionConfig: widget.interactionConfig ?? {},
          sortOrder: widget.sortOrder ?? index + 1,
        }),
      );
    }
  }

  private async getEditableRevision(dashboard: DashboardEntity) {
    const draftRevision = await this.revisionsRepository.findOne({
      where: {
        dashboardId: dashboard.id,
        tenantId: dashboard.tenantId,
        publishedAt: IsNull(),
      },
      order: { version: 'DESC' },
    });

    if (draftRevision) {
      return draftRevision;
    }

    if (dashboard.status === 'draft') {
      return dashboard.currentRevisionId
        ? await this.revisionsRepository.findOne({
            where: { id: dashboard.currentRevisionId },
          })
        : null;
    }

    return null;
  }

  private async resolveRevision(
    dashboard: DashboardEntity,
    mode: 'draft' | 'published',
  ) {
    if (mode === 'draft') {
      return this.getEditableRevision(dashboard);
    }

    if (dashboard.status !== 'published' || !dashboard.currentRevisionId) {
      return null;
    }
    return this.revisionsRepository.findOne({
      where: {
        id: dashboard.currentRevisionId,
        dashboardId: dashboard.id,
        tenantId: dashboard.tenantId,
        publishedAt: Not(IsNull()),
      },
      order: { version: 'DESC' },
    });
  }

  private async findDashboard(tenantId: string, dashboardId: string) {
    const dashboard = await this.dashboardsRepository.findOne({
      where: { id: dashboardId, tenantId },
    });
    if (!dashboard) {
      throw new NotFoundException('Dashboard không tồn tại');
    }
    return dashboard;
  }

  private assertCanView(dashboard: DashboardEntity, userId: string) {
    if (dashboard.scope === 'public') return;
    if (dashboard.scope === 'private' && dashboard.ownerUserId !== userId) {
      throw new NotFoundException('Dashboard không tồn tại');
    }
  }

  private assertCanEdit(dashboard: DashboardEntity, userId: string) {
    this.assertCanView(dashboard, userId);
    if (dashboard.scope === 'private' && dashboard.ownerUserId !== userId) {
      throw new BadRequestException('Không có quyền sửa dashboard');
    }
  }

  private toSummary(dashboard: DashboardEntity) {
    return {
      id: dashboard.id,
      code: dashboard.code,
      name: dashboard.name,
      description: dashboard.description,
      scope: dashboard.scope,
      status: dashboard.status,
      currentRevisionId: dashboard.currentRevisionId,
      updatedAt: dashboard.updatedAt,
    };
  }

  private toWidgetSummary(
    widget: DashboardWidgetEntity,
  ): DashboardWidgetSummary {
    return {
      id: widget.id,
      widgetType: widget.widgetType,
      title: widget.title,
      layoutConfig: widget.layoutConfig,
      dataSourceConfig: widget.dataSourceConfig,
      displayConfig: widget.displayConfig,
      interactionConfig: widget.interactionConfig,
      sortOrder: widget.sortOrder,
    };
  }

  private async generateUniqueCode(tenantId: string, name: string) {
    const base = slugifyLayerCode(name);
    let code = base;
    let suffix = 2;

    while (
      await this.dashboardsRepository.findOne({
        where: { tenantId, code },
      })
    ) {
      code = `${base}_${suffix}`;
      suffix += 1;
    }

    return code;
  }
}

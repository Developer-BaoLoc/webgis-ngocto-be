import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  ImportJobEntity,
  ImportTemplateEntity,
  JobExecutionEntity,
} from '../database/entities/import.entity';
import { LayerEntity } from '../database/entities/metadata.entity';
import { ImportTemplateConfig, parseSheetRows } from './excel.parser';
import { RecordsService } from '../records/records.service';
import { MetadataService } from '../metadata/metadata.service';
import { DictionariesService } from '../dictionaries/dictionaries.service';
import {
  normalizeCategory,
  normalizeKhuVuc,
  normalizeLoaiBom,
  normalizeNganhNghe,
  normalizeTinhTrang,
  normalizeXepHang,
} from './import-normalizer';
import { normalizeProperties } from '../records/field-types/field-type.registry';
import { DictionaryItemEntity } from '../database/entities/dictionary.entity';

export const IMPORT_QUEUE = 'import';

@Injectable()
export class ImportService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'imports');

  constructor(
    @InjectRepository(ImportJobEntity)
    private readonly importJobsRepository: Repository<ImportJobEntity>,
    @InjectRepository(JobExecutionEntity)
    private readonly jobsRepository: Repository<JobExecutionEntity>,
    @InjectRepository(ImportTemplateEntity)
    private readonly templatesRepository: Repository<ImportTemplateEntity>,
    @InjectRepository(LayerEntity)
    private readonly layersRepository: Repository<LayerEntity>,
    @InjectQueue(IMPORT_QUEUE)
    private readonly importQueue: Queue,
    private readonly recordsService: RecordsService,
    private readonly metadataService: MetadataService,
    private readonly dictionariesService: DictionariesService,
  ) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  async upload(tenantId: string, userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Thiếu file Excel');
    }

    const storageKey = `${randomUUID()}${path.extname(file.originalname) || '.xlsx'}`;
    const filePath = path.join(this.uploadDir, storageKey);
    fs.writeFileSync(filePath, file.buffer);

    const job = this.jobsRepository.create({
      tenantId,
      jobType: 'import',
      status: 'pending',
      progress: { processed: 0, total: 0, errors: 0 },
      payload: { originalName: file.originalname },
      createdBy: userId,
    });
    const savedJob = await this.jobsRepository.save(job);

    const importJob = this.importJobsRepository.create({
      jobExecutionId: savedJob.id,
      tenantId,
      fileStorageKey: storageKey,
      stats: {},
    });
    const savedImport = await this.importJobsRepository.save(importJob);

    return {
      importId: savedImport.id,
      jobId: savedJob.id,
      fileName: file.originalname,
      status: savedJob.status,
    };
  }

  async preview(tenantId: string, importId: string, templateCode: string) {
    const { importJob, template } = await this.loadImportContext(
      tenantId,
      importId,
      templateCode,
    );
    const config = template.config as ImportTemplateConfig;
    const filePath = this.resolveFilePath(importJob.fileStorageKey);
    const parsed = parseSheetRows(filePath, config, 20);

    const previewRows = await Promise.all(
      parsed.rows.map(async (row) => ({
        rowNumber: row.rowNumber,
        properties: await this.normalizeProperties(
          tenantId,
          config,
          row.properties,
        ),
        warnings: [],
      })),
    );

    return {
      importId,
      templateCode,
      sheetName: config.sheetName,
      headers: parsed.headers,
      previewRows,
      totalPreviewRows: previewRows.length,
    };
  }

  async execute(
    tenantId: string,
    userId: string,
    importId: string,
    templateCode: string,
  ) {
    const { importJob, job, template } = await this.loadImportContext(
      tenantId,
      importId,
      templateCode,
    );

    if (job.status === 'running' || job.status === 'queued') {
      throw new BadRequestException('Import đang chạy');
    }

    await this.jobsRepository.update(job.id, {
      status: 'queued',
      payload: {
        ...(job.payload ?? {}),
        templateCode,
        importId,
        userId,
      },
    });

    await this.importQueue.add('execute', {
      tenantId,
      userId,
      importId,
      jobId: job.id,
      templateCode,
    });

    return {
      importId,
      jobId: job.id,
      status: 'queued',
    };
  }

  async getImport(tenantId: string, importId: string) {
    const importJob = await this.importJobsRepository.findOne({
      where: { id: importId, tenantId },
    });
    if (!importJob) {
      throw new NotFoundException('Import không tồn tại');
    }

    const job = await this.jobsRepository.findOne({
      where: { id: importJob.jobExecutionId, tenantId },
    });
    if (!job) {
      throw new NotFoundException('Job không tồn tại');
    }

    return {
      importId: importJob.id,
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      stats: importJob.stats,
      result: job.result,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  async getJob(tenantId: string, jobId: string) {
    const job = await this.jobsRepository.findOne({
      where: { id: jobId, tenantId },
    });
    if (!job) {
      throw new NotFoundException('Job không tồn tại');
    }
    return {
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  async listTemplates(tenantId: string) {
    const templates = await this.templatesRepository.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      code: (t.config as ImportTemplateConfig).code,
      targetLayer: (t.config as ImportTemplateConfig).targetLayer,
      sheetName: (t.config as ImportTemplateConfig).sheetName,
    }));
  }

  async processImportJob(payload: {
    tenantId: string;
    userId: string;
    importId: string;
    jobId: string;
    templateCode: string;
  }) {
    const { tenantId, userId, importId, jobId, templateCode } = payload;
    const { importJob, template } = await this.loadImportContext(
      tenantId,
      importId,
      templateCode,
    );
    const config = template.config as ImportTemplateConfig;
    const filePath = this.resolveFilePath(importJob.fileStorageKey);
    const parsed = parseSheetRows(filePath, config);

    await this.jobsRepository.update(jobId, {
      status: 'running',
      startedAt: new Date(),
      progress: { processed: 0, total: parsed.rows.length, errors: 0 },
    });

    let processed = 0;
    let errors = 0;
    let created = 0;
    let duplicates = 0;
    let currentParentId: string | null = null;

    const layer = await this.layersRepository.findOne({
      where: {
        tenantId,
        code:
          config.mode === 'parent_child'
            ? config.parentLayer!
            : config.targetLayer!,
      },
    });
    if (!layer) {
      throw new NotFoundException('Layer target không tồn tại');
    }

    const childLayer =
      config.mode === 'parent_child'
        ? await this.layersRepository.findOne({
            where: { tenantId, code: config.childLayer! },
          })
        : null;

    for (const row of parsed.rows) {
      processed += 1;
      try {
        if (config.mode === 'parent_child' && childLayer) {
          if (row.isParent && row.parentProperties) {
            const parentProps = await this.normalizeProperties(
              tenantId,
              { ...config, targetLayer: config.parentLayer },
              row.parentProperties,
            );
            const dup = await this.findDuplicate(
              tenantId,
              layer.id,
              parentProps,
              ['ten_chu_the'],
            );
            if (dup) {
              currentParentId = dup;
              duplicates += 1;
            } else {
              const createdParent = await this.recordsService.createRecord(
                tenantId,
                layer.id,
                userId,
                { properties: parentProps },
              );
              currentParentId = createdParent.id;
              created += 1;
            }
          }

          if (row.childProperties && currentParentId) {
            const childProps = await this.normalizeProperties(
              tenantId,
              { ...config, targetLayer: config.childLayer },
              row.childProperties,
            );
            const childRecord = await this.recordsService.createRecord(
              tenantId,
              childLayer.id,
              userId,
              { properties: childProps },
            );
            await this.linkOcopRelation(
              tenantId,
              currentParentId,
              childRecord.id,
            );
            created += 1;
          }
        } else {
          const properties = await this.normalizeProperties(
            tenantId,
            config,
            row.properties,
          );
          const dup = await this.findDuplicate(
            tenantId,
            layer.id,
            properties,
            config.dedupKey ?? ['ten_chu_the', 'ten_tram_bom', 'ten_vung'],
          );
          if (dup) {
            duplicates += 1;
          } else {
            await this.recordsService.createRecord(tenantId, layer.id, userId, {
              properties,
            });
            created += 1;
          }
        }
      } catch {
        errors += 1;
      }

      if (processed % 5 === 0 || processed === parsed.rows.length) {
        await this.jobsRepository.update(jobId, {
          progress: { processed, total: parsed.rows.length, errors },
        });
      }
    }

    const stats = {
      processed,
      created,
      duplicates,
      errors,
      total: parsed.rows.length,
    };
    await this.importJobsRepository.update(importJob.id, { stats });
    await this.jobsRepository.update(jobId, {
      status: errors > 0 && created === 0 ? 'failed' : 'completed',
      completedAt: new Date(),
      progress: { processed, total: parsed.rows.length, errors },
      result: stats,
    });

    return stats;
  }

  private async loadImportContext(
    tenantId: string,
    importId: string,
    templateCode: string,
  ) {
    const importJob = await this.importJobsRepository.findOne({
      where: { id: importId, tenantId },
    });
    if (!importJob) {
      throw new NotFoundException('Import không tồn tại');
    }

    const job = await this.jobsRepository.findOne({
      where: { id: importJob.jobExecutionId, tenantId },
    });
    if (!job) {
      throw new NotFoundException('Job không tồn tại');
    }

    const templates = await this.templatesRepository.find({
      where: { tenantId },
    });
    const template = templates.find(
      (t) => (t.config as ImportTemplateConfig).code === templateCode,
    );
    if (!template) {
      throw new NotFoundException(`Template không tồn tại: ${templateCode}`);
    }

    return { importJob, job, template };
  }

  private resolveFilePath(storageKey: string) {
    const filePath = path.join(this.uploadDir, storageKey);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File upload không tồn tại');
    }
    return filePath;
  }

  private async normalizeProperties(
    tenantId: string,
    config: ImportTemplateConfig,
    properties: Record<string, unknown>,
  ) {
    const result = { ...properties };
    const khuVucItems = await this.getDictionaryItems(tenantId, 'khu_vuc');

    if ('khu_vuc' in result) {
      result.khu_vuc = normalizeKhuVuc(result.khu_vuc, khuVucItems);
    }
    if ('tinh_trang' in result) {
      const items = await this.getDictionaryItems(
        tenantId,
        'tinh_trang_hoat_dong',
      );
      result.tinh_trang =
        normalizeTinhTrang(result.tinh_trang) ??
        normalizeCategory(result.tinh_trang, items);
    }
    if ('loai_bom' in result) {
      const items = await this.getDictionaryItems(tenantId, 'loai_bom');
      result.loai_bom =
        normalizeLoaiBom(result.loai_bom) ??
        normalizeCategory(result.loai_bom, items);
    }
    if ('xep_hang' in result) {
      const items = await this.getDictionaryItems(tenantId, 'xep_hang_ocop');
      result.xep_hang =
        normalizeXepHang(result.xep_hang) ??
        normalizeCategory(result.xep_hang, items);
    }
    if ('nganh_nghe' in result) {
      result.nganh_nghe = normalizeNganhNghe(result.nganh_nghe);
    }

    const layerCode =
      config.targetLayer ?? config.parentLayer ?? config.childLayer;
    if (!layerCode) return result;

    const layer = await this.layersRepository.findOne({
      where: { tenantId, code: layerCode },
    });
    if (!layer) return result;

    const schema = await this.metadataService.getPublishedSchema(
      tenantId,
      layer.id,
    );
    return normalizeProperties(schema.fields, result, config.unitHints ?? {});
  }

  private async getDictionaryItems(tenantId: string, code: string) {
    try {
      const items = await this.dictionariesService.listItems(tenantId, code);
      return items.map(
        (item) =>
          ({
            code: item.code,
            label: item.label,
          }) as DictionaryItemEntity,
      );
    } catch {
      return [];
    }
  }

  private async findDuplicate(
    tenantId: string,
    layerId: string,
    properties: Record<string, unknown>,
    keys: string[],
  ) {
    for (const key of keys) {
      const value = properties[key];
      if (!value) continue;
      const rows = await this.recordsService.findByProperty(
        tenantId,
        layerId,
        key,
        String(value),
      );
      if (rows.length > 0) return rows[0].id;
    }
    return null;
  }

  private async linkOcopRelation(
    tenantId: string,
    parentId: string,
    childId: string,
  ) {
    await this.recordsService.createFeatureRelation(
      tenantId,
      'ocop_owns',
      parentId,
      childId,
    );
  }
}

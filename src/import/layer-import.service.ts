import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { MetadataService } from '../metadata/metadata.service';
import { DictionariesService } from '../dictionaries/dictionaries.service';
import { RecordsService } from '../records/records.service';
import { DictionaryItemEntity } from '../database/entities/dictionary.entity';
import {
  buildTemplateFileName,
  generateLayerImportWorkbook,
} from './layer-excel.generator';
import { parseLayerImportWorkbook } from './layer-excel.parser';
import { LAYER_EXCEL_STT_CODE } from './layer-excel.constants';
import { IMPORT_ERROR_CODES, LayerImportError } from './layer-import.errors';
import {
  augmentDictionaryItemsWithVirtualLabels,
  collectDictionaryLabelsFromImportRows,
  collectLayerImportRowErrors,
  normalizeLayerImportProperties,
  resolveDedupFieldCodes,
} from './layer-import-normalizer';
import { findMissingCategoryLabels } from './import-normalizer';
import { generateUniqueCodeInSet } from '../metadata/utils/layer-code.util';

type DictionaryItemsCreated = {
  dictionaryCode: string;
  labels: string[];
};

type ValidatedImportRow = {
  rowNumber: number;
  rawProperties: Record<string, unknown>;
  properties: Record<string, unknown>;
  errors: LayerImportError[];
  valid: boolean;
};

@Injectable()
export class LayerImportService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'imports');

  constructor(
    private readonly metadataService: MetadataService,
    private readonly dictionariesService: DictionariesService,
    private readonly recordsService: RecordsService,
  ) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  async generateTemplate(tenantId: string, layerId: string) {
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    const schema = await this.metadataService.getPublishedSchema(
      tenantId,
      layerId,
    );

    const dictionaryCodes = new Set<string>();
    for (const field of schema.fields) {
      if (
        (field.fieldType === 'category' || field.fieldType === 'multi_category') &&
        field.dataSchema.dictionary
      ) {
        dictionaryCodes.add(String(field.dataSchema.dictionary));
      }
    }

    const dictionaryLabels: Record<
      string,
      Array<{ code: string; label: string }>
    > = {};

    for (const code of dictionaryCodes) {
      try {
        const items = await this.dictionariesService.listItems(tenantId, code);
        dictionaryLabels[code] = items.map((item) => ({
          code: item.code,
          label: item.label,
        }));
      } catch {
        dictionaryLabels[code] = [];
      }
    }

    const buffer = generateLayerImportWorkbook({
      layerId: layer.id,
      layerCode: layer.code,
      layerName: layer.name,
      schemaVersionId: schema.schemaVersionId,
      fields: schema.fields,
      dictionaryLabels,
    });

    return {
      buffer,
      fileName: buildTemplateFileName(layer.code),
      layerId: layer.id,
      layerName: layer.name,
      fieldCount: schema.fields.length,
    };
  }

  async upload(
    tenantId: string,
    layerId: string,
    file: Express.Multer.File,
  ) {
    await this.metadataService.getLayerById(tenantId, layerId);

    if (!file) {
      throw new BadRequestException('Thiếu file Excel');
    }

    const storageKey = `${randomUUID()}${path.extname(file.originalname) || '.xlsx'}`;
    const filePath = path.join(this.uploadDir, storageKey);
    fs.writeFileSync(filePath, file.buffer);

    try {
      const { meta, rows } = parseLayerImportWorkbook(filePath, 1);
      if (meta.layerId !== layerId) {
        throw new BadRequestException(
          'File mẫu không thuộc lớp dữ liệu này. Hãy tải lại file mẫu đúng lớp.',
        );
      }

      const parsedAll = parseLayerImportWorkbook(filePath);
      return {
        importId: storageKey,
        fileName: file.originalname,
        layerId,
        totalRows: parsedAll.rows.length,
        schemaVersionId: meta.schemaVersionId,
      };
    } catch (error) {
      fs.unlinkSync(filePath);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'File Excel không hợp lệ',
      );
    }
  }

  async preview(
    tenantId: string,
    layerId: string,
    importId: string,
    previewLimit = 20,
  ) {
    const { validatedRows, summary, meta, dictionaryItemsCreated } =
      await this.validateImportFile(tenantId, layerId, importId, {
        persistDictionaryItems: false,
      });

    const previewRows = validatedRows.slice(0, previewLimit).map((row) => ({
      rowNumber: row.rowNumber,
      properties: row.properties,
      rawProperties: row.rawProperties,
      errors: row.errors,
      valid: row.valid,
    }));

    return {
      importId,
      layerId,
      ...summary,
      errorCount: summary.errors.length,
      dictionaryItemsCreated,
      columns: meta.columns
        .filter((col) => col.fieldCode !== LAYER_EXCEL_STT_CODE)
        .map((col) => ({
          fieldCode: col.fieldCode,
          label: col.label,
          required: col.required,
        })),
      previewRows,
      previewCount: previewRows.length,
      message: summary.canImport
        ? dictionaryItemsCreated.length > 0
          ? `Sẽ tự thêm ${dictionaryItemsCreated.reduce((n, item) => n + item.labels.length, 0)} giá trị mới vào danh mục. File hợp lệ, có thể import.`
          : 'File hợp lệ, có thể import.'
        : 'File có lỗi — sửa các dòng bên dưới rồi upload lại.',
    };
  }

  async execute(
    tenantId: string,
    layerId: string,
    userId: string,
    importId: string,
  ) {
    const { validatedRows, summary, schema, dedupKeys, dictionaryItemsCreated } =
      await this.validateImportFile(tenantId, layerId, importId, {
        persistDictionaryItems: true,
      });

    if (!summary.canImport) {
      throw new BadRequestException({
        code: 'IMPORT_VALIDATION_FAILED',
        message:
          'Không thể import vì file còn lỗi. Sửa Excel theo danh sách errors rồi upload lại.',
        ...summary,
        errors: summary.errors,
      });
    }

    let created = 0;
    let duplicates = 0;
    const duplicateRows: LayerImportError[] = [];

    for (const row of validatedRows) {
      const duplicateId = await this.findDuplicate(
        tenantId,
        layerId,
        row.properties,
        dedupKeys,
      );
      if (duplicateId) {
        duplicates += 1;
        const dedupField = dedupKeys[0];
        const fieldMeta = schema.fields.find((f) => f.code === dedupField);
        duplicateRows.push({
          rowNumber: row.rowNumber,
          field: dedupField ?? '',
          fieldLabel: fieldMeta?.label ?? dedupField ?? '',
          rawValue: dedupField
            ? String(row.rawProperties[dedupField] ?? '')
            : null,
          code: IMPORT_ERROR_CODES.DUPLICATE,
          message: `Dòng ${row.rowNumber}: bản ghi đã tồn tại (trùng ${fieldMeta?.label ?? dedupField}). Bản ghi này đã bỏ qua.`,
        });
        continue;
      }

      await this.recordsService.createRecordFromImport(
        tenantId,
        layerId,
        userId,
        { properties: row.properties },
      );
      created += 1;
    }

    return {
      importId,
      layerId,
      processed: validatedRows.length,
      created,
      duplicates,
      total: validatedRows.length,
      canImport: true,
      validRows: created,
      errorRows: 0,
      errors: [] as LayerImportError[],
      duplicateRows,
      dictionaryItemsCreated,
      message:
        duplicates > 0
          ? `Import xong: ${created} bản ghi mới, ${duplicates} dòng trùng đã bỏ qua.${this.formatDictionaryCreatedNote(dictionaryItemsCreated)}`
          : `Import thành công ${created} bản ghi.${this.formatDictionaryCreatedNote(dictionaryItemsCreated)}`,
    };
  }

  private formatDictionaryCreatedNote(items: DictionaryItemsCreated[]): string {
    const count = items.reduce((n, item) => n + item.labels.length, 0);
    if (count === 0) return '';
    return ` Đã thêm ${count} giá trị mới vào danh mục dùng chung.`;
  }

  private async validateImportFile(
    tenantId: string,
    layerId: string,
    importId: string,
    options: { persistDictionaryItems?: boolean } = {},
  ) {
    const schema = await this.metadataService.getPublishedSchema(
      tenantId,
      layerId,
    );
    const filePath = this.resolveFilePath(importId);
    const { meta, rows } = parseLayerImportWorkbook(filePath);

    if (meta.layerId !== layerId) {
      throw new BadRequestException('File không thuộc lớp dữ liệu này');
    }

    if (meta.schemaVersionId !== schema.schemaVersionId) {
      throw new BadRequestException(
        'Schema lớp dữ liệu đã thay đổi. Tải file mẫu mới trước khi import.',
      );
    }

    const dictionaryItems = await this.loadDictionaryItems(
      tenantId,
      schema.fields,
    );
    const { dictionaryItems: resolvedItems, dictionaryItemsCreated } =
      await this.resolveDictionaryItemsForImport(
        tenantId,
        rows,
        schema.fields,
        dictionaryItems,
        options.persistDictionaryItems ?? false,
      );
    const dedupKeys = resolveDedupFieldCodes(schema.fields);

    const validatedRows: ValidatedImportRow[] = [];
    const allErrors: LayerImportError[] = [];

    for (const row of rows) {
      const normalized = await normalizeLayerImportProperties(
        schema.fields,
        row.properties,
        resolvedItems,
      );
      const errors = collectLayerImportRowErrors({
        rowNumber: row.rowNumber,
        rawProperties: row.raw,
        normalizedProperties: normalized,
        fields: schema.fields,
        dictionaryItemsByCode: resolvedItems,
      });

      if (errors.length > 0) {
        allErrors.push(...errors);
      }

      validatedRows.push({
        rowNumber: row.rowNumber,
        rawProperties: row.raw,
        properties: normalized,
        errors,
        valid: errors.length === 0,
      });
    }

    const errorRowNumbers = new Set(
      validatedRows.filter((row) => !row.valid).map((row) => row.rowNumber),
    );

    const summary = {
      totalRows: rows.length,
      validRows: validatedRows.filter((row) => row.valid).length,
      errorRows: errorRowNumbers.size,
      canImport: allErrors.length === 0 && rows.length > 0,
      errors: allErrors,
    };

    return {
      validatedRows,
      summary,
      schema,
      dictionaryItems: resolvedItems,
      dictionaryItemsCreated,
      dedupKeys,
      meta,
    };
  }

  private async resolveDictionaryItemsForImport(
    tenantId: string,
    rows: Array<{ properties: Record<string, unknown>; raw: Record<string, unknown> }>,
    fields: Array<{
      fieldType: string;
      dataSchema: Record<string, unknown>;
      code: string;
    }>,
    dictionaryItems: Record<string, DictionaryItemEntity[]>,
    persist: boolean,
  ): Promise<{
    dictionaryItems: Record<string, DictionaryItemEntity[]>;
    dictionaryItemsCreated: DictionaryItemsCreated[];
  }> {
    const labelsByDict = collectDictionaryLabelsFromImportRows(rows, fields);
    const dictionaryItemsCreated: DictionaryItemsCreated[] = [];
    let resolvedItems = { ...dictionaryItems };

    for (const [dictCode, labels] of Object.entries(labelsByDict)) {
      const missing = findMissingCategoryLabels(
        labels,
        resolvedItems[dictCode] ?? [],
      );
      if (missing.length === 0) continue;

      dictionaryItemsCreated.push({ dictionaryCode: dictCode, labels: missing });

      if (persist) {
        const created = await this.dictionariesService.ensureItemsByLabels(
          tenantId,
          dictCode,
          missing,
        );
        resolvedItems[dictCode] = [
          ...(resolvedItems[dictCode] ?? []),
          ...created.map(
            (item) =>
              ({
                code: item.code,
                label: item.label,
              }) as DictionaryItemEntity,
          ),
        ];
      } else {
        const existingCodes = new Set(
          (resolvedItems[dictCode] ?? []).map((item) => item.code),
        );
        const virtualItems = missing.map((label) => ({
          label,
          code: generateUniqueCodeInSet(label, existingCodes),
        }));
        resolvedItems = augmentDictionaryItemsWithVirtualLabels(resolvedItems, {
          [dictCode]: virtualItems,
        });
      }
    }

    return { dictionaryItems: resolvedItems, dictionaryItemsCreated };
  }

  private resolveFilePath(importId: string) {
    const filePath = path.join(this.uploadDir, importId);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File import không tồn tại hoặc đã hết hạn');
    }
    return filePath;
  }

  private async loadDictionaryItems(
    tenantId: string,
    fields: Array<{ fieldType: string; dataSchema: Record<string, unknown> }>,
  ) {
    const dictionaryItems: Record<string, DictionaryItemEntity[]> = {};
    const codes = new Set<string>();

    for (const field of fields) {
      if (
        (field.fieldType === 'category' || field.fieldType === 'multi_category') &&
        field.dataSchema.dictionary
      ) {
        codes.add(String(field.dataSchema.dictionary));
      }
    }

    for (const code of codes) {
      try {
        const items = await this.dictionariesService.listItems(tenantId, code);
        dictionaryItems[code] = items.map(
          (item) =>
            ({
              code: item.code,
              label: item.label,
            }) as DictionaryItemEntity,
        );
      } catch {
        dictionaryItems[code] = [];
      }
    }

    return dictionaryItems;
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
}

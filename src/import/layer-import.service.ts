import {
  BadRequestException,
  Injectable,
  Logger,
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
  buildImportColumns,
  buildTemplateFileName,
  generateLayerImportWorkbook,
} from './layer-excel.generator';
import {
  estimateLayerImportWorkbookRowCount,
  inspectLayerImportWorkbookColumns,
  parseLayerImportWorkbook,
  parseLayerImportWorkbookWithMeta,
} from './layer-excel.parser';
import {
  LAYER_EXCEL_FORMAT_VERSION,
  LAYER_EXCEL_STT_CODE,
} from './layer-excel.constants';
import { LayerExcelMeta, LayerExcelParsedRow } from './layer-excel.types';
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
import { ImportNewFieldsDto } from './dto/import-new-field.dto';
import {
  buildImportColumnAnalysis,
  ImportColumnAnalysis,
} from './import-column-discovery';
import { RelationshipService } from '../metadata/relationship.service';
import {
  IMPORT_UPLOAD_DIR,
  resolveImportFilePath,
  safeDeleteImportFile,
} from './import-file.util';

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
  private readonly logger = new Logger(LayerImportService.name);
  private readonly uploadDir = IMPORT_UPLOAD_DIR;

  constructor(
    private readonly metadataService: MetadataService,
    private readonly dictionariesService: DictionariesService,
    private readonly recordsService: RecordsService,
    private readonly relationshipService: RelationshipService,
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
        (field.fieldType === 'category' ||
          field.fieldType === 'multi_category') &&
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
      geometryType: layer.geometryKind,
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

  async upload(tenantId: string, layerId: string, file: Express.Multer.File) {
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    const schema = await this.metadataService.getPublishedSchema(
      tenantId,
      layerId,
    );

    if (!file) {
      throw new BadRequestException('Thiếu file Excel');
    }

    const storageKey = `${randomUUID()}${path.extname(file.originalname) || '.xlsx'}`;
    const filePath = path.join(this.uploadDir, storageKey);
    fs.writeFileSync(filePath, file.buffer);

    try {
      const columnAnalysis = this.analyzeImportColumns(filePath, schema);
      const { meta } = this.parseImportWorkbook(filePath, { layer, schema }, 1);
      if (meta.layerId !== layerId) {
        throw new BadRequestException(
          'File mẫu không thuộc lớp dữ liệu này. Hãy tải lại file mẫu đúng lớp.',
        );
      }

      const parsedAll = this.parseImportWorkbook(filePath, { layer, schema });
      return {
        importId: storageKey,
        fileName: file.originalname,
        layerId,
        totalRows: parsedAll.rows.length,
        schemaVersionId: meta.schemaVersionId,
        ...columnAnalysis,
      };
    } catch (error) {
      const columnAnalysis = this.safeAnalyzeImportColumns(filePath, schema);
      if (
        columnAnalysis.unknownColumns.length > 0 &&
        this.canFallbackToCurrentSchema(error)
      ) {
        return {
          importId: storageKey,
          fileName: file.originalname,
          layerId,
          totalRows: estimateLayerImportWorkbookRowCount(filePath),
          schemaVersionId: schema.schemaVersionId,
          ...columnAnalysis,
        };
      }

      this.logRetainedImportFile(filePath, error);
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
    const schema = await this.metadataService.getPublishedSchema(
      tenantId,
      layerId,
    );
    const filePath = this.resolveFilePath(importId);
    const columnAnalysis = this.analyzeImportColumns(filePath, schema);

    let validated: Awaited<
      ReturnType<LayerImportService['validateImportFile']>
    > | null = null;

    try {
      validated = await this.validateImportFile(tenantId, layerId, importId, {
        persistDictionaryItems: false,
      });
    } catch (error) {
      if (
        columnAnalysis.unknownColumns.length === 0 ||
        !this.canFallbackToCurrentSchema(error)
      ) {
        throw error;
      }

      return {
        importId,
        layerId,
        ...columnAnalysis,
        totalRows: estimateLayerImportWorkbookRowCount(filePath),
        validRows: 0,
        errorRows: 0,
        canImport: false,
        errors: [],
        errorCount: 0,
        dictionaryItemsCreated: [],
        columns: [],
        previewRows: [],
        previewCount: 0,
        message:
          'File có cột chưa có trong schema. Chọn các cột cần tạo field mới rồi import.',
      };
    }

    const { validatedRows, summary, meta, dictionaryItemsCreated } = validated;

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
      ...columnAnalysis,
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
    dto: ImportNewFieldsDto = {},
  ) {
    const filePath = this.resolveFilePath(importId);

    try {
      const newFields = dto.newFields ?? [];
      if (newFields.length > 0) {
        await this.metadataService.addFieldsToLayerSchema(
          tenantId,
          layerId,
          userId,
          newFields.map((field) => ({
            code: field.code,
            label: field.label,
            fieldType: field.fieldType,
            required: field.required,
            dataSchema: field.dataSchema,
            uiSchema: field.uiSchema,
            displaySchema: field.displaySchema,
          })),
        );
      }

      const {
        validatedRows,
        summary,
        schema,
        dedupKeys,
        dictionaryItemsCreated,
      } = await this.validateImportFile(tenantId, layerId, importId, {
        persistDictionaryItems: true,
        forceCurrentSchemaMeta: newFields.length > 0,
        allowSchemaVersionMismatch: newFields.length > 0,
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

      const result = {
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

      await safeDeleteImportFile(filePath, this.logger);
      return result;
    } catch (error) {
      this.logRetainedImportFile(filePath, error);
      throw error;
    }
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
    options: {
      persistDictionaryItems?: boolean;
      forceCurrentSchemaMeta?: boolean;
      allowSchemaVersionMismatch?: boolean;
    } = {},
  ) {
    const schema = await this.metadataService.getPublishedSchema(
      tenantId,
      layerId,
    );
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    const filePath = this.resolveFilePath(importId);
    const { meta, rows } = this.parseImportWorkbook(
      filePath,
      { layer, schema },
      undefined,
      {
        forceCurrentSchemaMeta: options.forceCurrentSchemaMeta ?? false,
      },
    );

    if (meta.layerId !== layerId) {
      throw new BadRequestException('File không thuộc lớp dữ liệu này');
    }

    if (
      meta.schemaVersionId !== schema.schemaVersionId &&
      !options.allowSchemaVersionMismatch
    ) {
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
    const { rows: relationshipRows, errors: relationshipErrors } =
      await this.relationshipService.normalizeImportRows(
        tenantId,
        schema.fields,
        rows,
      );
    const relationshipErrorsByRow = new Map<number, LayerImportError[]>();
    for (const error of relationshipErrors) {
      relationshipErrorsByRow.set(error.rowNumber, [
        ...(relationshipErrorsByRow.get(error.rowNumber) ?? []),
        error,
      ]);
    }
    const dedupKeys = resolveDedupFieldCodes(schema.fields);

    const validatedRows: ValidatedImportRow[] = [];
    const allErrors: LayerImportError[] = [];

    for (const row of relationshipRows) {
      const normalized = await normalizeLayerImportProperties(
        schema.fields,
        row.properties,
        resolvedItems,
      );
      const errors = [
        ...(relationshipErrorsByRow.get(row.rowNumber) ?? []),
        ...collectLayerImportRowErrors({
          rowNumber: row.rowNumber,
          rawProperties: row.raw,
          normalizedProperties: normalized,
          fields: schema.fields,
          dictionaryItemsByCode: resolvedItems,
        }),
      ];

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

  private parseImportWorkbook(
    filePath: string,
    context: {
      layer: { id: string; code: string; name: string };
      schema: {
        schemaVersionId: string;
        fields: Array<{
          code: string;
          label: string;
          fieldType: string;
          dataSchema: Record<string, unknown>;
        }>;
      };
    },
    limit?: number,
    options: { forceCurrentSchemaMeta?: boolean } = {},
  ): { meta: LayerExcelMeta; rows: LayerExcelParsedRow[] } {
    if (options.forceCurrentSchemaMeta) {
      const meta = this.buildCurrentLayerImportMeta(context);
      return parseLayerImportWorkbookWithMeta(filePath, meta, limit);
    }

    try {
      const parsed = parseLayerImportWorkbook(filePath, limit);
      const importColumns = parsed.meta.columns.filter(
        (column) => column.fieldCode !== LAYER_EXCEL_STT_CODE,
      );
      if (importColumns.length > 0) {
        return parsed;
      }
    } catch (error) {
      if (!this.canFallbackToCurrentSchema(error)) {
        throw error;
      }
    }

    const meta = this.buildCurrentLayerImportMeta(context);
    return parseLayerImportWorkbookWithMeta(filePath, meta, limit);
  }

  private analyzeImportColumns(
    filePath: string,
    schema: {
      fields: Array<{ code: string; label: string }>;
    },
  ): ImportColumnAnalysis {
    return buildImportColumnAnalysis(
      inspectLayerImportWorkbookColumns(filePath),
      schema.fields,
    );
  }

  private safeAnalyzeImportColumns(
    filePath: string,
    schema: {
      fields: Array<{ code: string; label: string }>;
    },
  ): ImportColumnAnalysis {
    try {
      return this.analyzeImportColumns(filePath, schema);
    } catch {
      return {
        detectedColumns: [],
        existingFields: schema.fields.map((field) => field.code),
        unknownColumns: [],
        columnSuggestions: [],
      };
    }
  }

  private buildCurrentLayerImportMeta(context: {
    layer: { id: string; code: string; name: string };
    schema: {
      schemaVersionId: string;
      fields: Array<{
        code: string;
        label: string;
        fieldType: string;
        dataSchema: Record<string, unknown>;
      }>;
    };
  }): LayerExcelMeta {
    return {
      formatVersion: LAYER_EXCEL_FORMAT_VERSION,
      layerId: context.layer.id,
      layerCode: context.layer.code,
      layerName: context.layer.name,
      schemaVersionId: context.schema.schemaVersionId,
      headerRow: 1,
      fieldCodeRow: null,
      dataStartRow: 2,
      columns: buildImportColumns(context.schema.fields),
    };
  }

  private canFallbackToCurrentSchema(error: unknown) {
    return (
      error instanceof Error &&
      (error.message.includes('thiếu sheet _meta') ||
        error.message.includes('File mẫu không có cột dữ liệu'))
    );
  }

  private async resolveDictionaryItemsForImport(
    tenantId: string,
    rows: Array<{
      properties: Record<string, unknown>;
      raw: Record<string, unknown>;
    }>,
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

      dictionaryItemsCreated.push({
        dictionaryCode: dictCode,
        labels: missing,
      });

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
    let filePath: string;
    try {
      filePath = resolveImportFilePath(importId);
    } catch {
      throw new BadRequestException('Đường dẫn file import không hợp lệ');
    }
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File import không tồn tại hoặc đã hết hạn');
    }
    return filePath;
  }

  private logRetainedImportFile(filePath: string, error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `[layer-import] Import lỗi, giữ lại file để debug: ${filePath}. Lỗi: ${detail}`,
    );
  }

  private async loadDictionaryItems(
    tenantId: string,
    fields: Array<{ fieldType: string; dataSchema: Record<string, unknown> }>,
  ) {
    const dictionaryItems: Record<string, DictionaryItemEntity[]> = {};
    const codes = new Set<string>();

    for (const field of fields) {
      if (
        (field.fieldType === 'category' ||
          field.fieldType === 'multi_category') &&
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

import * as XLSX from 'xlsx';
import {
  LAYER_EXCEL_DATA_SHEET,
  LAYER_EXCEL_FORMAT_VERSION,
  LAYER_EXCEL_GUIDE_SHEET,
  LAYER_EXCEL_META_SHEET,
  LAYER_EXCEL_SKIP_FIELD_TYPES,
  LAYER_EXCEL_STT_CODE,
} from './layer-excel.constants';
import { LayerExcelFieldColumn, LayerExcelMeta } from './layer-excel.types';
import { getMoneyUnitLabel } from '../metadata/constants/field-units.constants';

export type LayerSchemaField = {
  code: string;
  label: string;
  fieldType: string;
  dataSchema: Record<string, unknown>;
};

function isFieldRequired(field: LayerSchemaField): boolean {
  return field.dataSchema.required === true;
}

function buildFieldHint(field: LayerSchemaField): string {
  const parts: string[] = [];
  parts.push(`Kiểu: ${field.fieldType}`);

  if (field.fieldType === 'money' && field.dataSchema.unit) {
    const unitLabel = getMoneyUnitLabel(String(field.dataSchema.unit));
    parts.push(
      `Đơn vị: ${unitLabel} — nhập số theo đơn vị (VD: 2420, không nhập VNĐ đầy đủ)`,
    );
  }
  if (field.fieldType === 'measurement') {
    parts.push(`Đơn vị: ${field.dataSchema.unit ?? 'ha'}`);
  }
  if (field.fieldType === 'quantity' && field.dataSchema.unit) {
    parts.push(`Đơn vị: ${field.dataSchema.unit}`);
  }
  if (
    (field.fieldType === 'category' || field.fieldType === 'multi_category') &&
    field.dataSchema.dictionary
  ) {
    parts.push(`Danh mục: ${field.dataSchema.dictionary}`);
  }
  if (field.fieldType === 'lat_lng') {
    parts.push('Định dạng: "lat, lng" (có thể để trống, vẽ bản đồ sau)');
  }
  if (field.fieldType === 'area_polygon') {
    parts.push('Định dạng: "lat,lng; lat,lng; ..." (≥3 điểm) hoặc JSON coordinates');
  }
  if (field.fieldType === 'multi_category') {
    parts.push('Nhiều giá trị: mỗi giá trị trên một dòng (Alt+Enter trong Excel)');
  }

  return parts.join(' · ');
}

export function buildImportColumns(
  fields: LayerSchemaField[],
): LayerExcelFieldColumn[] {
  const columns: LayerExcelFieldColumn[] = [
    {
      fieldCode: LAYER_EXCEL_STT_CODE,
      label: 'STT',
      fieldType: 'stt',
      required: false,
      hint: 'Chỉ để theo dõi, không lưu vào hệ thống',
    },
  ];

  for (const field of fields) {
    if (LAYER_EXCEL_SKIP_FIELD_TYPES.has(field.fieldType)) {
      continue;
    }

    columns.push({
      fieldCode: field.code,
      label: field.label,
      fieldType: field.fieldType,
      required: isFieldRequired(field),
      dictionary:
        typeof field.dataSchema.dictionary === 'string'
          ? field.dataSchema.dictionary
          : undefined,
      unitHint:
        typeof field.dataSchema.unit === 'string'
          ? field.dataSchema.unit
          : undefined,
      hint: buildFieldHint(field),
    });
  }

  return columns;
}

export function generateLayerImportWorkbook(input: {
  layerId: string;
  layerCode: string;
  layerName: string;
  schemaVersionId: string;
  fields: LayerSchemaField[];
  dictionaryLabels?: Record<string, Array<{ code: string; label: string }>>;
}): Buffer {
  const columns = buildImportColumns(input.fields);
  const headerRow = 2;
  const fieldCodeRow = 3;
  const dataStartRow = 4;

  const meta: LayerExcelMeta = {
    formatVersion: LAYER_EXCEL_FORMAT_VERSION,
    layerId: input.layerId,
    layerCode: input.layerCode,
    layerName: input.layerName,
    schemaVersionId: input.schemaVersionId,
    headerRow,
    fieldCodeRow,
    dataStartRow,
    columns,
  };

  const dataSheetRows: unknown[][] = [];
  dataSheetRows[0] = [`Mẫu import — ${input.layerName}`];
  dataSheetRows[1] = columns.map((col) =>
    col.required && col.fieldCode !== LAYER_EXCEL_STT_CODE
      ? `${col.label}*`
      : col.label,
  );
  dataSheetRows[2] = columns.map((col) => col.fieldCode);

  const guideRows: unknown[][] = [
    ['Hướng dẫn import'],
    [''],
    ['1. Chỉ sửa dữ liệu từ dòng 4 trở đi trong sheet Du_lieu'],
    ['2. Không đổi tên sheet, không xóa dòng tiêu đề / mã field (dòng 2–3)'],
    ['3. Cột có dấu * là bắt buộc'],
    ['4. Ảnh/tệp đính kèm: upload trong màn chi tiết bản ghi sau khi import'],
    ['5. Toạ độ có thể để trống — gán trên bản đồ sau'],
    [''],
    ['Field', 'Bắt buộc', 'Ghi chú', 'Giá trị hợp lệ (danh mục)'],
  ];

  for (const col of columns) {
    if (col.fieldCode === LAYER_EXCEL_STT_CODE) continue;

    let allowed = '';
    if (col.dictionary && input.dictionaryLabels?.[col.dictionary]) {
      allowed = input.dictionaryLabels[col.dictionary]
        .map((item) => item.label)
        .join('; ');
    }

    guideRows.push([
      col.label,
      col.required ? 'Có' : 'Không',
      col.hint ?? '',
      allowed,
    ]);
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(dataSheetRows),
    LAYER_EXCEL_DATA_SHEET,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(guideRows),
    LAYER_EXCEL_GUIDE_SHEET,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([[JSON.stringify(meta)]]),
    LAYER_EXCEL_META_SHEET,
  );

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function buildTemplateFileName(layerCode: string): string {
  const safe = layerCode.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
  return `mau_import_${safe}.xlsx`;
}

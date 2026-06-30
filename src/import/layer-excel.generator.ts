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

type TemplateGeometryType = 'point' | 'line' | 'polygon' | 'sub_layer' | string;

const MIN_REAL_FIELDS_FOR_SCHEMA_ONLY_TEMPLATE = 3;

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
    parts.push(
      'Định dạng: "lat,lng; lat,lng; ..." (≥3 điểm) hoặc JSON coordinates',
    );
  }
  if (field.fieldType === 'line') {
    parts.push(
      'Định dạng: "lat,lng; lat,lng; ..." (≥2 điểm) hoặc GeoJSON LineString/MultiLineString',
    );
  }
  if (field.fieldType === 'relationship') {
    parts.push(
      `Nhập giá trị theo field hiển thị/match: ${field.dataSchema.matchField ?? field.dataSchema.targetDisplayField ?? 'id'}`,
    );
  }
  if (field.fieldType === 'multi_category') {
    parts.push(
      'Nhiều giá trị: mỗi giá trị trên một dòng (Alt+Enter trong Excel)',
    );
  }

  return parts.join(' · ');
}

function firstAllowedLabel(
  field: LayerSchemaField,
  dictionaryLabels?: Record<string, Array<{ code: string; label: string }>>,
  offset = 0,
): string | null {
  const dictionary =
    typeof field.dataSchema.dictionary === 'string'
      ? field.dataSchema.dictionary
      : null;
  const items = dictionary ? dictionaryLabels?.[dictionary] : undefined;
  if (items?.length) {
    return items[Math.min(offset, items.length - 1)]?.label ?? null;
  }

  const options = field.dataSchema.options;
  if (Array.isArray(options) && options.length > 0) {
    const option = options[Math.min(offset, options.length - 1)] as unknown;
    if (typeof option === 'string' || typeof option === 'number') {
      return String(option);
    }
    if (option && typeof option === 'object') {
      const value = option as Record<string, unknown>;
      return String(value.label ?? value.name ?? value.value ?? value.code ?? '');
    }
  }

  return null;
}

function buildExampleValue(
  column: LayerExcelFieldColumn,
  fields: LayerSchemaField[],
  rowIndex: number,
  dictionaryLabels?: Record<string, Array<{ code: string; label: string }>>,
): string | number {
  if (column.fieldCode === LAYER_EXCEL_STT_CODE) {
    return rowIndex;
  }

  const field = fields.find((item) => item.code === column.fieldCode);
  const fieldType = column.fieldType;
  const sampleNo = rowIndex === 1 ? 1 : 2;
  const allowed = field
    ? firstAllowedLabel(field, dictionaryLabels, rowIndex - 1)
    : null;

  if (allowed) return allowed;

  const lowerLabel = column.label.toLowerCase();
  if (lowerLabel.includes('kinh độ')) {
    return sampleNo === 1 ? 105.9195 : 105.9202;
  }
  if (lowerLabel.includes('vĩ độ')) {
    return sampleNo === 1 ? 9.4772 : 9.4781;
  }
  if (lowerLabel.includes('srid')) {
    return 4326;
  }

  switch (fieldType) {
    case 'integer':
    case 'number':
    case 'decimal':
    case 'float':
    case 'double':
    case 'numeric':
    case 'real':
    case 'bigint':
    case 'smallint':
      return sampleNo === 1 ? 120 : 245;
    case 'money':
      return sampleNo === 1 ? 2420 : 3150;
    case 'measurement':
      return sampleNo === 1 ? 12.5 : 33.5;
    case 'quantity':
      return sampleNo === 1 ? 25 : 40;
    case 'boolean':
      return sampleNo === 1 ? 'Có' : 'Không';
    case 'date':
      return sampleNo === 1 ? '2026-06-01' : '2026-06-15';
    case 'datetime':
      return sampleNo === 1 ? '2026-06-01 08:00' : '2026-06-15 14:30';
    case 'email':
      return sampleNo === 1 ? 'lienhe@example.com' : 'hotro@example.com';
    case 'phone':
      return sampleNo === 1 ? '0900000001' : '0900000002';
    case 'url':
      return sampleNo === 1
        ? 'https://example.com/cong-trinh-1'
        : 'https://example.com/cong-trinh-2';
    case 'lat_lng':
      return sampleNo === 1 ? '9.4772, 105.9195' : '9.4781, 105.9202';
    case 'line':
      return sampleNo === 1
        ? '10.01,105.78; 10.02,105.79'
        : '10.03,105.80; 10.04,105.81';
    case 'area_polygon':
      return sampleNo === 1
        ? '10.01,105.78; 10.02,105.79; 10.03,105.80'
        : '10.04,105.81; 10.05,105.82; 10.06,105.83';
    case 'multi_category':
      return sampleNo === 1 ? 'Giá trị A\nGiá trị B' : 'Giá trị C';
    case 'category':
    case 'select':
    case 'status':
    case 'relationship':
      return sampleNo === 1 ? 'Giá trị mẫu A' : 'Giá trị mẫu B';
    case 'textarea':
      return sampleNo === 1 ? 'Ghi chú mẫu dòng 1' : 'Ghi chú mẫu dòng 2';
    default:
      if (lowerLabel.includes('mã')) {
        return sampleNo === 1 ? 'CT-001' : 'CT-002';
      }
      if (lowerLabel.includes('tên')) {
        return sampleNo === 1 ? 'Công trình mẫu 1' : 'Công trình mẫu 2';
      }
      return sampleNo === 1 ? 'Dữ liệu mẫu 1' : 'Dữ liệu mẫu 2';
  }
}

function setColumnWidths(sheet: XLSX.WorkSheet, rows: unknown[][]) {
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  sheet['!cols'] = Array.from({ length: maxColumns }, (_, columnIndex) => {
    const width = rows.reduce((max, row) => {
      const text = String(row[columnIndex] ?? '');
      return Math.max(max, text.length);
    }, 10);
    return { wch: Math.min(Math.max(width + 2, 10), 36) };
  });
}

function styleHeaderRow(sheet: XLSX.WorkSheet, columnCount: number) {
  for (let index = 0; index < columnCount; index += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c: index });
    const cell = sheet[address];
    if (!cell) continue;
    cell.s = {
      font: { bold: true },
      fill: { fgColor: { rgb: 'EAF2FF' } },
      alignment: { vertical: 'center', wrapText: true },
    };
  }
}

function sampleField(
  code: string,
  label: string,
  fieldType: string,
  dataSchema: Record<string, unknown> = {},
): LayerSchemaField {
  return { code, label, fieldType, dataSchema };
}

function normalizeGeometryType(value?: TemplateGeometryType | null) {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('point')) return 'point';
  if (text.includes('line')) return 'line';
  if (text.includes('polygon')) return 'polygon';
  return text || 'point';
}

export function buildDefaultSampleFieldsForGeometry(
  geometryType?: TemplateGeometryType | null,
): LayerSchemaField[] {
  const fields: LayerSchemaField[] = [
    sampleField('ma_doi_tuong', 'Mã đối tượng', 'text'),
    sampleField('ten_doi_tuong', 'Tên đối tượng', 'text'),
    sampleField('loai_doi_tuong', 'Loại đối tượng', 'category'),
    sampleField('tp_tinh', 'TP/Tỉnh', 'text'),
    sampleField('ten_xa', 'Tên xã', 'text'),
    sampleField('ma_ap', 'Mã ấp', 'text'),
    sampleField('ten_ap', 'Tên ấp', 'text'),
    sampleField('dia_chi', 'Địa chỉ', 'text'),
    sampleField('nguon_du_lieu', 'Nguồn dữ liệu', 'text'),
    sampleField('ngay_cap_nhat', 'Ngày cập nhật', 'date'),
    sampleField('trang_thai_xac_minh', 'Trạng thái xác minh', 'category'),
    sampleField('ghi_chu', 'Ghi chú', 'textarea'),
  ];

  const geometry = normalizeGeometryType(geometryType);
  if (geometry === 'line') {
    fields.push(
      sampleField('toa_do_tuyen', 'Tọa độ tuyến', 'line'),
      sampleField('chieu_dai', 'Chiều dài', 'measurement', { unit: 'm' }),
      sampleField('srid', 'SRID', 'integer'),
    );
    return fields;
  }

  if (geometry === 'polygon') {
    fields.push(
      sampleField('toa_do_vung', 'Tọa độ vùng', 'area_polygon'),
      sampleField('dien_tich', 'Diện tích', 'measurement', { unit: 'ha' }),
      sampleField('srid', 'SRID', 'integer'),
    );
    return fields;
  }

  fields.push(
    sampleField('kinh_do', 'Kinh độ', 'decimal'),
    sampleField('vi_do', 'Vĩ độ', 'decimal'),
    sampleField('toa_do', 'Geometry WKT hoặc Tọa độ', 'lat_lng'),
    sampleField('srid', 'SRID', 'integer'),
  );
  return fields;
}

function hasFieldLike(fields: LayerSchemaField[], candidates: string[]) {
  const normalized = fields.map((field) =>
    `${field.code} ${field.label} ${field.fieldType}`.toLowerCase(),
  );
  return candidates.some((candidate) =>
    normalized.some((value) => value.includes(candidate)),
  );
}

function buildGeometryHelperFields(
  fields: LayerSchemaField[],
  geometryType?: TemplateGeometryType | null,
): LayerSchemaField[] {
  const geometry = normalizeGeometryType(geometryType);
  if (geometry === 'line') {
    const helpers: LayerSchemaField[] = [];
    if (!hasFieldLike(fields, ['toa_do_tuyen', 'tuyến', 'line'])) {
      helpers.push(sampleField('toa_do_tuyen', 'Tọa độ tuyến', 'line'));
    }
    if (!hasFieldLike(fields, ['chieu_dai', 'chiều dài', 'length'])) {
      helpers.push(
        sampleField('chieu_dai', 'Chiều dài', 'measurement', { unit: 'm' }),
      );
    }
    if (!hasFieldLike(fields, ['srid'])) {
      helpers.push(sampleField('srid', 'SRID', 'integer'));
    }
    return helpers;
  }

  if (geometry === 'polygon') {
    const helpers: LayerSchemaField[] = [];
    if (!hasFieldLike(fields, ['toa_do_vung', 'tọa độ vùng', 'polygon'])) {
      helpers.push(sampleField('toa_do_vung', 'Tọa độ vùng', 'area_polygon'));
    }
    if (!hasFieldLike(fields, ['dien_tich', 'diện tích', 'area'])) {
      helpers.push(
        sampleField('dien_tich', 'Diện tích', 'measurement', { unit: 'ha' }),
      );
    }
    if (!hasFieldLike(fields, ['srid'])) {
      helpers.push(sampleField('srid', 'SRID', 'integer'));
    }
    return helpers;
  }

  const helpers: LayerSchemaField[] = [];
  if (!hasFieldLike(fields, ['kinh_do', 'kinh độ', 'longitude', 'lng'])) {
    helpers.push(sampleField('kinh_do', 'Kinh độ', 'decimal'));
  }
  if (!hasFieldLike(fields, ['vi_do', 'vĩ độ', 'latitude', 'lat'])) {
    helpers.push(sampleField('vi_do', 'Vĩ độ', 'decimal'));
  }
  if (!hasFieldLike(fields, ['toa_do', 'tọa độ', 'lat_lng'])) {
    helpers.push(sampleField('toa_do', 'Geometry WKT hoặc Tọa độ', 'lat_lng'));
  }
  if (!hasFieldLike(fields, ['srid'])) {
    helpers.push(sampleField('srid', 'SRID', 'integer'));
  }
  return helpers;
}

function buildTemplateFields(input: {
  fields: LayerSchemaField[];
  geometryType?: TemplateGeometryType | null;
}) {
  const importableFields = input.fields.filter(
    (field) => !LAYER_EXCEL_SKIP_FIELD_TYPES.has(field.fieldType),
  );
  const useDefaultSamples =
    importableFields.length < MIN_REAL_FIELDS_FOR_SCHEMA_ONLY_TEMPLATE;
  const baseFields = useDefaultSamples
    ? buildDefaultSampleFieldsForGeometry(input.geometryType)
    : importableFields;
  const helperFields = useDefaultSamples
    ? []
    : buildGeometryHelperFields(baseFields, input.geometryType);
  const seen = new Set<string>();

  return [...baseFields, ...helperFields].filter((field) => {
    const key = `${field.code}::${field.label}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  geometryType?: TemplateGeometryType | null;
  dictionaryLabels?: Record<string, Array<{ code: string; label: string }>>;
}): Buffer {
  const templateFields = buildTemplateFields({
    fields: input.fields,
    geometryType: input.geometryType,
  });
  const columns = buildImportColumns(templateFields);
  const headerRow = 1;
  const fieldCodeRow = null;
  const dataStartRow = 2;

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
  dataSheetRows[0] = columns.map((col) =>
    col.required && col.fieldCode !== LAYER_EXCEL_STT_CODE
      ? `${col.label}*`
      : col.label,
  );
  dataSheetRows[1] = columns.map((col) =>
    buildExampleValue(col, templateFields, 1, input.dictionaryLabels),
  );
  dataSheetRows[2] = columns.map((col) =>
    buildExampleValue(col, templateFields, 2, input.dictionaryLabels),
  );

  const isSuggestedTemplate =
    input.fields.filter(
      (field) => !LAYER_EXCEL_SKIP_FIELD_TYPES.has(field.fieldType),
    ).length < MIN_REAL_FIELDS_FOR_SCHEMA_ONLY_TEMPLATE;
  const guideRows: unknown[][] = [
    [`Hướng dẫn import - ${input.layerName}`],
    [''],
    ['1. Không đổi tên sheet Du_lieu và Huong_dan.'],
    ['2. Hàng 1 trong sheet Du_lieu là tên trường, không xóa/sửa nếu không cần.'],
    ['3. Dữ liệu nhập từ hàng 2. Hai dòng đầu là ví dụ, hãy xóa hoặc sửa trước khi import dữ liệu thật.'],
    ['4. Cột có dấu * là bắt buộc. STT chỉ để theo dõi, không lưu vào hệ thống.'],
    ['5. Chọn đúng kiểu dữ liệu khi tạo trường vì sau đó không thể chọn lại.'],
    ['6. Point dùng cột Kinh độ/Vĩ độ nếu có, hoặc trường tọa độ dạng "lat,lng". Ví dụ: 9.4772,105.9195.'],
    ['7. Line dùng "lat,lng; lat,lng". Ví dụ: 10.01,105.78; 10.02,105.79.'],
    ['8. Polygon dùng "lat,lng; lat,lng; lat,lng". Ví dụ: 10.01,105.78; 10.02,105.79; 10.03,105.80.'],
    ['9. Danh mục nên nhập theo nhãn hiển thị trong danh sách hợp lệ bên dưới.'],
    ['10. Ảnh/file upload sau trong màn chi tiết bản ghi.'],
    [
      isSuggestedTemplate
        ? '11. Layer mới/ít trường: đây là bộ cột gợi ý. Trước khi import chính thức, hãy tạo các trường tương ứng trong cấu hình layer hoặc dùng bước tạo field mới nếu giao diện import đề xuất.'
        : '11. Các cột tọa độ/hình học gợi ý có thể chưa phải field thật. Nếu import báo cột chưa có trong schema, hãy tạo trường tương ứng trước.',
    ],
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
  const dataSheet = XLSX.utils.aoa_to_sheet(dataSheetRows);
  dataSheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(dataSheetRows.length - 1, 0), c: columns.length - 1 },
    }),
  };
  (dataSheet as XLSX.WorkSheet & { '!freeze'?: unknown })['!freeze'] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: 'A2',
    activePane: 'bottomLeft',
    state: 'frozen',
  };
  setColumnWidths(dataSheet, dataSheetRows);
  styleHeaderRow(dataSheet, columns.length);
  XLSX.utils.book_append_sheet(workbook, dataSheet, LAYER_EXCEL_DATA_SHEET);
  XLSX.utils.book_append_sheet(
    workbook,
    (() => {
      const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
      setColumnWidths(guideSheet, guideRows);
      return guideSheet;
    })(),
    LAYER_EXCEL_GUIDE_SHEET,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([[JSON.stringify(meta)]]),
    LAYER_EXCEL_META_SHEET,
  );
  workbook.Workbook = {
    ...(workbook.Workbook ?? {}),
    Sheets: workbook.SheetNames.map((name) => ({
      name,
      Hidden: name === LAYER_EXCEL_META_SHEET ? 1 : 0,
    })),
  };

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function buildTemplateFileName(layerCode: string): string {
  const safe = layerCode.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
  return `mau_import_${safe}.xlsx`;
}

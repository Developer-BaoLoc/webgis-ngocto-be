import { DictionaryItemEntity } from '../database/entities/dictionary.entity';
import {
  FieldValidationError,
  normalizeProperties,
  validateProperties,
} from '../records/field-types/field-type.registry';
import {
  buildUnitHints,
  fieldsForImportValidation,
} from '../records/utils/import-validation.util';
import { parseMoneyImportValue } from '../records/utils/money-import.util';
import { getMoneyUnitLabel } from '../metadata/constants/field-units.constants';
import { normalizeCategory, matchCategoryCode } from './import-normalizer';
import {
  formatAllowedLabels,
  IMPORT_ERROR_CODES,
  LayerImportError,
  toRawDisplay,
} from './layer-import.errors';

type SchemaField = {
  code: string;
  label: string;
  fieldType: string;
  dataSchema: Record<string, unknown>;
};

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeText(value: string): string {
  return stripAccents(value.toLowerCase().trim());
}

function parseLatLngString(value: unknown): { lat: number; lng: number } | null {
  if (typeof value === 'object' && value !== null && 'lat' in value && 'lng' in value) {
    return value as { lat: number; lng: number };
  }
  if (typeof value !== 'string') return null;

  const parts = value.split(/[,;]/).map((part) => part.trim());
  if (parts.length < 2) return null;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

function parseQuantityString(
  value: unknown,
  defaultUnit?: string,
): { value: number; unit: string } | null {
  if (typeof value === 'number') {
    return { value, unit: defaultUnit ?? 'tan' };
  }
  if (typeof value !== 'string') return null;

  const text = value.trim();
  const match = text.match(/^([\d.,]+)\s*(.*)$/);
  if (!match) {
    const num = Number(text.replace(',', '.'));
    return Number.isFinite(num)
      ? { value: num, unit: defaultUnit ?? 'tan' }
      : null;
  }

  const num = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(num)) return null;

  const unitText = normalizeText(match[2] || defaultUnit || 'tan');
  const unitMap: Record<string, string> = {
    tan: 'tan',
    t: 'tan',
    tấn: 'tan',
    kg: 'kg',
    kilogram: 'kg',
    lit: 'lit',
    lít: 'lit',
    m3: 'm3',
    con: 'con',
    bo: 'bo',
    bó: 'bo',
    cay: 'cay',
    cây: 'cay',
  };

  return { value: num, unit: unitMap[unitText] ?? defaultUnit ?? 'tan' };
}

function normalizeTinhTrangHoatDong(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const text = normalizeText(String(raw));
  if (
    text.includes('dang hd') ||
    text.includes('dang hoat dong') ||
    text.includes('đang hd')
  ) {
    return 'dang_hoat_dong';
  }
  if (text.includes('ngung') || text.includes('ngưng')) {
    return 'ngung_hoat_dong';
  }
  return null;
}

export async function normalizeLayerImportProperties(
  fields: SchemaField[],
  properties: Record<string, unknown>,
  dictionaryItemsByCode: Record<string, DictionaryItemEntity[]>,
): Promise<Record<string, unknown>> {
  const result = { ...properties };
  const unitHints = buildUnitHints(fields);

  for (const field of fields) {
    const value = result[field.code];
    if (value === null || value === undefined || value === '') continue;

    if (field.fieldType === 'category') {
      const dictCode = String(field.dataSchema.dictionary ?? '');
      const items = dictionaryItemsByCode[dictCode] ?? [];
      const normalized =
        field.code === 'tinh_trang_hoat_dong'
          ? normalizeTinhTrangHoatDong(value) ??
            matchCategoryCode(value, items)
          : matchCategoryCode(value, items);
      if (normalized) result[field.code] = normalized;
    }

    if (field.fieldType === 'multi_category') {
      const dictCode = String(field.dataSchema.dictionary ?? '');
      const items = dictionaryItemsByCode[dictCode] ?? [];
      const parts = String(value)
        .split(/[,;/]/)
        .map((part) => part.trim())
        .filter(Boolean);
      result[field.code] = parts
        .map((part) => matchCategoryCode(part, items))
        .filter(Boolean);
    }

    if (field.fieldType === 'lat_lng') {
      const parsed = parseLatLngString(value);
      if (parsed) result[field.code] = parsed;
    }

    if (field.fieldType === 'quantity') {
      const parsed = parseQuantityString(
        value,
        String(field.dataSchema.unit ?? 'tan'),
      );
      if (parsed) result[field.code] = parsed;
    }

    if (field.fieldType === 'money') {
      const parsed = parseMoneyImportValue(
        value,
        String(field.dataSchema.unit ?? 'vnd'),
      );
      if (parsed !== null) result[field.code] = parsed;
    }
  }

  return normalizeProperties(fields, result, unitHints);
}

export function validateLayerImportProperties(
  fields: SchemaField[],
  properties: Record<string, unknown>,
): FieldValidationError[] {
  const importFields = fieldsForImportValidation(fields);
  return validateProperties(importFields, properties, buildUnitHints(fields));
}

export function resolveDedupFieldCodes(fields: SchemaField[]): string[] {
  const requiredText = fields.find(
    (field) =>
      field.dataSchema.required === true &&
      ['text', 'textarea'].includes(field.fieldType),
  );
  if (requiredText) return [requiredText.code];

  const firstText = fields.find((field) =>
    ['text', 'textarea'].includes(field.fieldType),
  );
  return firstText ? [firstText.code] : [];
}

function hasRawValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function enrichSchemaErrorMessage(
  err: FieldValidationError,
  field: SchemaField | undefined,
): string {
  if (err.code === 'REQUIRED') {
    return `Cột "${field?.label ?? err.field}" bắt buộc — không được để trống`;
  }
  if (err.code === 'INVALID_TYPE') {
    return `Cột "${field?.label ?? err.field}": ${err.message}`;
  }
  return err.message;
}

export function collectLayerImportRowErrors(input: {
  rowNumber: number;
  rawProperties: Record<string, unknown>;
  normalizedProperties: Record<string, unknown>;
  fields: SchemaField[];
  dictionaryItemsByCode: Record<string, DictionaryItemEntity[]>;
}): LayerImportError[] {
  const {
    rowNumber,
    rawProperties,
    normalizedProperties,
    fields,
    dictionaryItemsByCode,
  } = input;

  const errors: LayerImportError[] = [];
  const seen = new Set<string>();

  const pushError = (error: LayerImportError) => {
    const key = `${error.field}:${error.code}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push(error);
  };

  for (const err of validateLayerImportProperties(fields, normalizedProperties)) {
    const field = fields.find((item) => item.code === err.field);
    pushError({
      rowNumber,
      field: err.field,
      fieldLabel: field?.label ?? err.field,
      rawValue: toRawDisplay(rawProperties[err.field]),
      code: err.code,
      message: enrichSchemaErrorMessage(err, field),
    });
  }

  for (const field of fields) {
    const raw = rawProperties[field.code];
    if (!hasRawValue(raw)) continue;

    const dictCode = String(field.dataSchema.dictionary ?? '');
    const items = dictionaryItemsByCode[dictCode] ?? [];
    const validCodes = new Set(items.map((item) => item.code));

    if (field.fieldType === 'category') {
      const normalized = normalizedProperties[field.code];
      if (!normalized || !validCodes.has(String(normalized))) {
        pushError({
          rowNumber,
          field: field.code,
          fieldLabel: field.label,
          rawValue: toRawDisplay(raw),
          code: IMPORT_ERROR_CODES.INVALID_CATEGORY,
          message: `Giá trị "${toRawDisplay(raw)}" không hợp lệ ở cột "${field.label}". Hãy dùng đúng tên trong sheet Huong_dan. Gợi ý: ${formatAllowedLabels(items)}`,
        });
      }
    }

    if (field.fieldType === 'multi_category') {
      const parts = String(raw)
        .split(/[,;/]/)
        .map((part) => part.trim())
        .filter(Boolean);
      const normalized = normalizedProperties[field.code];
      const normalizedList = Array.isArray(normalized) ? normalized : [];

      if (normalizedList.length !== parts.length) {
        pushError({
          rowNumber,
          field: field.code,
          fieldLabel: field.label,
          rawValue: toRawDisplay(raw),
          code: IMPORT_ERROR_CODES.INVALID_MULTI_CATEGORY,
          message: `Một hoặc nhiều giá trị ở cột "${field.label}" không hợp lệ. Gợi ý: ${formatAllowedLabels(items)}`,
        });
      } else {
        for (const code of normalizedList) {
          if (!validCodes.has(String(code))) {
            pushError({
              rowNumber,
              field: field.code,
              fieldLabel: field.label,
              rawValue: toRawDisplay(raw),
              code: IMPORT_ERROR_CODES.INVALID_MULTI_CATEGORY,
              message: `Giá trị "${toRawDisplay(raw)}" không hợp lệ ở cột "${field.label}". Gợi ý: ${formatAllowedLabels(items)}`,
            });
            break;
          }
        }
      }
    }

    if (field.fieldType === 'integer' && !Number.isInteger(Number(normalizedProperties[field.code]))) {
      pushError({
        rowNumber,
        field: field.code,
        fieldLabel: field.label,
        rawValue: toRawDisplay(raw),
        code: IMPORT_ERROR_CODES.INVALID_INTEGER,
        message: `Cột "${field.label}": phải là số nguyên (giá trị hiện tại: "${toRawDisplay(raw)}")`,
      });
    }

    if (field.fieldType === 'money' && normalizedProperties[field.code] === undefined) {
      const unitLabel = getMoneyUnitLabel(String(field.dataSchema.unit ?? 'vnd'));
      pushError({
        rowNumber,
        field: field.code,
        fieldLabel: field.label,
        rawValue: toRawDisplay(raw),
        code: IMPORT_ERROR_CODES.INVALID_MONEY,
        message: `Cột "${field.label}": phải là số theo đơn vị ${unitLabel} (VD: 2420, không nhập 2420000000) — giá trị hiện tại: "${toRawDisplay(raw)}"`,
      });
    }

    if (
      field.fieldType === 'measurement' &&
      (typeof normalizedProperties[field.code] !== 'object' ||
        normalizedProperties[field.code] === null)
    ) {
      pushError({
        rowNumber,
        field: field.code,
        fieldLabel: field.label,
        rawValue: toRawDisplay(raw),
        code: IMPORT_ERROR_CODES.INVALID_MEASUREMENT,
        message: `Cột "${field.label}": phải là số (giá trị hiện tại: "${toRawDisplay(raw)}")`,
      });
    }

    if (
      field.fieldType === 'quantity' &&
      (typeof normalizedProperties[field.code] !== 'object' ||
        normalizedProperties[field.code] === null)
    ) {
      pushError({
        rowNumber,
        field: field.code,
        fieldLabel: field.label,
        rawValue: toRawDisplay(raw),
        code: IMPORT_ERROR_CODES.INVALID_QUANTITY,
        message: `Cột "${field.label}": phải là số hoặc dạng "351 tấn" (giá trị hiện tại: "${toRawDisplay(raw)}")`,
      });
    }

    if (
      field.fieldType === 'lat_lng' &&
      typeof normalizedProperties[field.code] !== 'object'
    ) {
      pushError({
        rowNumber,
        field: field.code,
        fieldLabel: field.label,
        rawValue: toRawDisplay(raw),
        code: IMPORT_ERROR_CODES.INVALID_LAT_LNG,
        message: `Cột "${field.label}": dùng định dạng "lat, lng" hoặc để trống (giá trị hiện tại: "${toRawDisplay(raw)}")`,
      });
    }
  }

  return errors;
}

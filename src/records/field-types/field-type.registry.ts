import { parseLatLngValue } from '../utils/lat-lng-geometry.util';
import {
  normalizeAreaPolygonValue,
  normalizePolygonGeometryValue,
  parseAreaPolygonValue,
} from '../utils/area-polygon-geometry.util';
import {
  normalizeLineGeometryValue,
  parseLineGeometryValue,
} from '../utils/line-geometry.util';
import {
  normalizeAttachmentList,
  validateAttachmentList,
} from '../utils/attachment-field.util';
import {
  DEFAULT_MAX_FIELD_FILES,
  DEFAULT_MAX_FIELD_IMAGES,
} from '../../assets/constants/field-attachment.constants';
import {
  getMeasurementMultiplier,
  getMeasurementStorageUnit,
} from '../../metadata/constants/field-units.constants';
import { normalizeMoneyUnitCode } from '../utils/money-display.util';
import {
  buildNormalizedMoneyValue,
  extractMoneySourceAmount,
} from '../utils/money-import.util';
import { splitMultiCategoryInput } from '../utils/multi-category.util';

export type FieldValidationError = {
  field: string;
  code: string;
  message: string;
};

export interface FieldTypeHandler {
  type: string;
  validate(
    value: unknown,
    config: Record<string, unknown>,
  ): FieldValidationError | null;
  normalize(value: unknown, config: Record<string, unknown>): unknown;
}

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === '';

function parseNumberInput(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

const textHandler: FieldTypeHandler = {
  type: 'text',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    if (!isEmpty(value) && typeof value !== 'string') {
      return { field: '', code: 'INVALID_TYPE', message: 'Phải là chuỗi' };
    }
    return null;
  },
  normalize(value) {
    return typeof value === 'string' ? value.trim() : value;
  },
};

const integerHandler: FieldTypeHandler = {
  type: 'integer',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    if (isEmpty(value)) return null;

    const parsed = parseNumberInput(value);
    if (parsed === null || !Number.isInteger(parsed)) {
      return { field: '', code: 'INVALID_TYPE', message: 'Phải là số nguyên' };
    }
    return null;
  },
  normalize(value) {
    if (isEmpty(value)) return null;
    return parseNumberInput(value);
  },
};

const decimalHandler: FieldTypeHandler = {
  type: 'decimal',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    if (isEmpty(value)) return null;

    if (parseNumberInput(value) === null) {
      return { field: '', code: 'INVALID_TYPE', message: 'Phải là số' };
    }
    return null;
  },
  normalize(value) {
    if (isEmpty(value)) return null;
    return parseNumberInput(value);
  },
};

const moneyHandler: FieldTypeHandler = {
  type: 'money',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    return null;
  },
  normalize(value, config) {
    if (isEmpty(value)) return null;
    const unitCode = normalizeMoneyUnitCode(
      String(
        (typeof value === 'object' && value !== null && 'unit' in value
          ? (value as { unit?: string }).unit
          : null) ??
          (typeof value === 'object' && value !== null && 'sourceUnit' in value
            ? (value as { sourceUnit?: string }).sourceUnit
            : null) ??
          config.unit ??
          config.unitHint ??
          'vnd',
      ),
    );
    const sourceAmount = extractMoneySourceAmount(value, unitCode);
    if (sourceAmount === null) return null;
    return buildNormalizedMoneyValue(sourceAmount, unitCode);
  },
};

const measurementHandler: FieldTypeHandler = {
  type: 'measurement',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    return null;
  },
  normalize(value, config) {
    if (isEmpty(value)) return null;
    const measurementType = String(config.measurementType ?? 'area');
    const num =
      typeof value === 'object' && value !== null && 'value' in value
        ? Number((value as { value: number }).value)
        : Number(value);
    const unit = String(
      (typeof value === 'object' && value !== null && 'unit' in value
        ? (value as { unit?: string }).unit
        : null) ??
        config.unit ??
        config.defaultUnit ??
        (measurementType === 'distance' ? 'm' : 'ha'),
    );
    const multiplier = getMeasurementMultiplier(measurementType, unit);
    const storageUnit = getMeasurementStorageUnit(measurementType);
    return {
      value: num,
      unit,
      measurementType,
      normalizedValue: num * multiplier,
      normalizedUnit: storageUnit,
    };
  },
};

const categoryHandler: FieldTypeHandler = {
  type: 'category',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    return null;
  },
  normalize(value) {
    if (isEmpty(value)) return null;
    return String(value).trim();
  },
};

const textareaHandler: FieldTypeHandler = { ...textHandler, type: 'textarea' };
const phoneHandler: FieldTypeHandler = { ...textHandler, type: 'phone' };
const relationshipHandler: FieldTypeHandler = {
  type: 'relationship',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    if (isEmpty(value)) return null;
    if (typeof value === 'string' && value.trim()) return null;
    if (typeof value === 'object' && value !== null) {
      const raw =
        (value as { value?: unknown; id?: unknown }).value ??
        (value as { id?: unknown }).id;
      if (typeof raw === 'string' && raw.trim()) return null;
    }
    return {
      field: '',
      code: 'INVALID_RELATIONSHIP',
      message: 'Phải chọn một bản ghi liên kết hợp lệ',
    };
  },
  normalize(value) {
    if (isEmpty(value)) return null;
    if (typeof value === 'object' && value !== null) {
      const raw =
        (value as { value?: unknown; id?: unknown }).value ??
        (value as { id?: unknown }).id;
      return raw === null || raw === undefined || raw === ''
        ? null
        : String(raw);
    }
    return String(value).trim();
  },
};
const quantityHandler: FieldTypeHandler = {
  type: 'quantity',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    return null;
  },
  normalize(value, config) {
    if (isEmpty(value)) return null;
    const num =
      typeof value === 'object' && value !== null && 'value' in value
        ? Number((value as { value: number }).value)
        : Number(value);
    const unit = String(
      (typeof value === 'object' && value !== null && 'unit' in value
        ? (value as { unit?: string }).unit
        : null) ??
        config.unit ??
        config.defaultUnit ??
        'kg',
    );
    return { value: num, unit };
  },
};
const multiCategoryHandler: FieldTypeHandler = {
  type: 'multi_category',
  validate(value, config) {
    if (
      config.required &&
      (isEmpty(value) || (Array.isArray(value) && value.length === 0))
    ) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    return null;
  },
  normalize(value) {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') {
      return splitMultiCategoryInput(value);
    }
    return value;
  },
};

const createAttachmentHandler = (
  type: string,
  defaultMaxCount: number,
): FieldTypeHandler => ({
  type,
  validate(value, config) {
    const err = validateAttachmentList(value, {
      ...config,
      maxCount: config.maxCount ?? config.maxFiles ?? defaultMaxCount,
    });
    if (!err) return null;
    return { field: '', code: err.code, message: err.message };
  },
  normalize(value) {
    if (isEmpty(value)) return [];
    return normalizeAttachmentList(value);
  },
});

const imageHandler = createAttachmentHandler('image', DEFAULT_MAX_FIELD_IMAGES);
const fileHandler = createAttachmentHandler('file', DEFAULT_MAX_FIELD_FILES);

const latLngHandler: FieldTypeHandler = {
  type: 'lat_lng',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    if (isEmpty(value)) return null;

    const parsed = parseLatLngValue(value);
    if (!parsed) {
      return {
        field: '',
        code: 'INVALID_TYPE',
        message: 'Phải là object { lat, lng }',
      };
    }

    if (parsed.lat < -90 || parsed.lat > 90) {
      return {
        field: '',
        code: 'INVALID_LAT',
        message: 'lat phải từ -90 đến 90',
      };
    }

    if (parsed.lng < -180 || parsed.lng > 180) {
      return {
        field: '',
        code: 'INVALID_LNG',
        message: 'lng phải từ -180 đến 180',
      };
    }

    return null;
  },
  normalize(value) {
    const parsed = parseLatLngValue(value);
    if (!parsed) return null;

    return {
      lat: Math.round(parsed.lat * 1e6) / 1e6,
      lng: Math.round(parsed.lng * 1e6) / 1e6,
    };
  },
};

const areaPolygonHandler: FieldTypeHandler = {
  type: 'area_polygon',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    if (isEmpty(value)) return null;

    const parsed = parseAreaPolygonValue(value);
    const polygonGeometry = normalizePolygonGeometryValue(value);
    if (!parsed && !polygonGeometry) {
      return {
        field: '',
        code: 'INVALID_TYPE',
        message:
          'Phải là Polygon/MultiPolygon GeoJSON hoặc { coordinates: [{ lat, lng }, ...] } với ít nhất 3 điểm',
      };
    }

    return null;
  },
  normalize(value) {
    const polygonGeometry = normalizePolygonGeometryValue(value);
    if (polygonGeometry) return polygonGeometry.geometry;

    const parsed = parseAreaPolygonValue(value);
    if (!parsed) return null;
    return normalizeAreaPolygonValue(parsed);
  },
};

const lineHandler: FieldTypeHandler = {
  type: 'line',
  validate(value, config) {
    if (config.required && isEmpty(value)) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    if (isEmpty(value)) return null;

    const parsed = parseLineGeometryValue(value);
    if (!parsed) {
      return {
        field: '',
        code: 'INVALID_TYPE',
        message:
          'Phải là LineString/MultiLineString với tối thiểu 2 điểm',
      };
    }

    return null;
  },
  normalize(value) {
    const parsed = parseLineGeometryValue(value);
    if (!parsed) return null;
    return normalizeLineGeometryValue(parsed);
  },
};

const HANDLERS: Record<string, FieldTypeHandler> = {
  text: textHandler,
  textarea: textareaHandler,
  integer: integerHandler,
  decimal: decimalHandler,
  money: moneyHandler,
  measurement: measurementHandler,
  category: categoryHandler,
  multi_category: multiCategoryHandler,
  phone: phoneHandler,
  quantity: quantityHandler,
  relationship: relationshipHandler,
  lat_lng: latLngHandler,
  area_polygon: areaPolygonHandler,
  line: lineHandler,
  linestring: lineHandler,
  image: imageHandler,
  file: fileHandler,
};

export function getFieldHandler(fieldType: string): FieldTypeHandler {
  return HANDLERS[fieldType] ?? textHandler;
}

export function validateProperties(
  fields: Array<{
    code: string;
    fieldType: string;
    dataSchema: Record<string, unknown>;
  }>,
  properties: Record<string, unknown>,
  unitHints: Record<string, string> = {},
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  for (const field of fields) {
    const handler = getFieldHandler(field.fieldType);
    const config = {
      ...field.dataSchema,
      unitHint: unitHints[field.code] ?? field.dataSchema.unitHint,
      unit: field.dataSchema.unit ?? field.dataSchema.defaultUnit,
      measurementType: field.dataSchema.measurementType,
    };
    const err = handler.validate(properties[field.code], config);
    if (err) {
      errors.push({ ...err, field: field.code });
    }
  }

  return errors;
}

export function normalizeProperties(
  fields: Array<{
    code: string;
    fieldType: string;
    dataSchema: Record<string, unknown>;
  }>,
  properties: Record<string, unknown>,
  unitHints: Record<string, string> = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...properties };

  for (const field of fields) {
    const handler = getFieldHandler(field.fieldType);
    const config = {
      ...field.dataSchema,
      unitHint: unitHints[field.code] ?? field.dataSchema.unitHint,
      unit: field.dataSchema.unit ?? field.dataSchema.defaultUnit,
      measurementType: field.dataSchema.measurementType,
    };
    if (field.code in result) {
      result[field.code] = handler.normalize(result[field.code], config);
    }
  }

  return result;
}

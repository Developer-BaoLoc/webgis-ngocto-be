export type FieldValidationError = {
  field: string;
  code: string;
  message: string;
};

export interface FieldTypeHandler {
  type: string;
  validate(value: unknown, config: Record<string, unknown>): FieldValidationError | null;
  normalize(value: unknown, config: Record<string, unknown>): unknown;
}

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === '';

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
    if (!isEmpty(value) && !Number.isInteger(Number(value))) {
      return { field: '', code: 'INVALID_TYPE', message: 'Phải là số nguyên' };
    }
    return null;
  },
  normalize(value) {
    if (isEmpty(value)) return null;
    return parseInt(String(value), 10);
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
    const amount = typeof value === 'object' && value !== null && 'amount' in value
      ? Number((value as { amount: number }).amount)
      : Number(value);
    const scale = (config.unitHint as string) === 'million_vnd' ? 1_000_000 : 1;
    return {
      amount: amount * scale,
      currency: 'VND',
      sourceValue: amount,
      sourceScale: scale === 1_000_000 ? 'million_vnd' : 'vnd',
    };
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
    const num = typeof value === 'object' && value !== null && 'value' in value
      ? Number((value as { value: number }).value)
      : Number(value);
    const unit = (config.defaultUnit as string) ?? 'ha';
    return {
      value: num,
      unit,
      normalizedValue: unit === 'ha' ? num : num,
      normalizedUnit: unit,
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
const quantityHandler: FieldTypeHandler = { ...textHandler, type: 'quantity' };
const multiCategoryHandler: FieldTypeHandler = {
  type: 'multi_category',
  validate(value, config) {
    if (config.required && (isEmpty(value) || (Array.isArray(value) && value.length === 0))) {
      return { field: '', code: 'REQUIRED', message: 'Bắt buộc' };
    }
    return null;
  },
  normalize(value) {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') {
      return value.split(/[,;+]/).map((s) => s.trim()).filter(Boolean);
    }
    return value;
  },
};

const HANDLERS: Record<string, FieldTypeHandler> = {
  text: textHandler,
  textarea: textareaHandler,
  integer: integerHandler,
  money: moneyHandler,
  measurement: measurementHandler,
  category: categoryHandler,
  multi_category: multiCategoryHandler,
  phone: phoneHandler,
  quantity: quantityHandler,
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
      defaultUnit: field.dataSchema.defaultUnit ?? 'ha',
    };
    if (field.code in result) {
      result[field.code] = handler.normalize(result[field.code], config);
    }
  }

  return result;
}

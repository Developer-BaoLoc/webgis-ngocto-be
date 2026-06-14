export type LayerImportError = {
  rowNumber: number;
  field: string;
  fieldLabel: string;
  rawValue: string | null;
  code: string;
  message: string;
};

export const IMPORT_ERROR_CODES = {
  REQUIRED: 'REQUIRED',
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  INVALID_MULTI_CATEGORY: 'INVALID_MULTI_CATEGORY',
  INVALID_INTEGER: 'INVALID_INTEGER',
  INVALID_MONEY: 'INVALID_MONEY',
  INVALID_MEASUREMENT: 'INVALID_MEASUREMENT',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_LAT_LNG: 'INVALID_LAT_LNG',
  INVALID_TYPE: 'INVALID_TYPE',
  IMPORT_ERROR: 'IMPORT_ERROR',
  DUPLICATE: 'DUPLICATE',
} as const;

export function formatAllowedLabels(
  items: Array<{ code: string; label: string }>,
  max = 5,
): string {
  if (items.length === 0) return '(danh mục chưa có giá trị)';
  const shown = items.slice(0, max).map((item) => item.label);
  const suffix = items.length > max ? ` … (+${items.length - max} giá trị khác)` : '';
  return `${shown.join('; ')}${suffix}`;
}

export function toRawDisplay(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

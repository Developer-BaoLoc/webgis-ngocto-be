export const LAYER_EXCEL_DATA_SHEET = 'Du_lieu';
export const LAYER_EXCEL_GUIDE_SHEET = 'Huong_dan';
export const LAYER_EXCEL_META_SHEET = '_meta';

export const LAYER_EXCEL_FORMAT_VERSION = 1;

/** Field types excluded from import template (upload separately in UI). */
export const LAYER_EXCEL_SKIP_FIELD_TYPES = new Set(['image', 'file']);

/** Required in schema but optional when importing from Excel. */
export const LAYER_EXCEL_IMPORT_OPTIONAL_TYPES = new Set([
  'lat_lng',
  'image',
  'file',
]);

export const LAYER_EXCEL_STT_CODE = '__stt__';

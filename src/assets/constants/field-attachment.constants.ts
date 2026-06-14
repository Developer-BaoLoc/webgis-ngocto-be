export const FIELD_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export const FIELD_FILE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
]);

export const DEFAULT_MAX_FIELD_IMAGES = 20;
export const DEFAULT_MAX_FIELD_FILES = 20;
export const MAX_FIELD_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FIELD_FILE_BYTES = 10 * 1024 * 1024;

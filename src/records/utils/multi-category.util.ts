export const MULTI_CATEGORY_DISPLAY_SEPARATOR = '\n';

/** Tách chuỗi nhập (import/API) thành từng giá trị — ưu tiên xuống dòng, fallback dấu phẩy/chấm phẩy. */
export function splitMultiCategoryInput(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (/\r?\n/.test(trimmed)) {
    return trimmed
      .split(/\r?\n/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return trimmed
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatMultiCategoryDisplay(labels: string[]): string {
  return labels.join(MULTI_CATEGORY_DISPLAY_SEPARATOR);
}

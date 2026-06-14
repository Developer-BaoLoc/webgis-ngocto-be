export type FieldAttachmentValue = {
  attachmentId: string;
  url: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAttachmentId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function buildAttachmentUrl(attachmentId: string): string {
  return `/api/assets/${attachmentId}/file`;
}

export function normalizeAttachmentList(value: unknown): FieldAttachmentValue[] {
  if (value === null || value === undefined || value === '') {
    return [];
  }

  const items = Array.isArray(value) ? value : [value];

  return items
    .map((item) => {
      if (typeof item === 'string') {
        const attachmentId = item.trim();
        if (!attachmentId) return null;
        return {
          attachmentId,
          url: buildAttachmentUrl(attachmentId),
        };
      }

      if (typeof item === 'object' && item !== null && 'attachmentId' in item) {
        const attachmentId = String(
          (item as { attachmentId?: unknown }).attachmentId ?? '',
        ).trim();
        if (!attachmentId) return null;

        const obj = item as FieldAttachmentValue;
        return {
          attachmentId,
          url: obj.url ?? buildAttachmentUrl(attachmentId),
          originalName: obj.originalName,
          mimeType: obj.mimeType,
          sizeBytes:
            typeof obj.sizeBytes === 'number'
              ? obj.sizeBytes
              : obj.sizeBytes !== undefined
                ? Number(obj.sizeBytes)
                : undefined,
        };
      }

      return null;
    })
    .filter((item): item is FieldAttachmentValue => item !== null);
}

export function validateAttachmentList(
  value: unknown,
  config: Record<string, unknown>,
): { code: string; message: string } | null {
  if (
    config.required &&
    (value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0))
  ) {
    return { code: 'REQUIRED', message: 'Bắt buộc' };
  }

  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = normalizeAttachmentList(value);
  const rawCount = Array.isArray(value) ? value.length : 1;

  if (normalized.length !== rawCount) {
    return {
      code: 'INVALID_TYPE',
      message: 'Mỗi phần tử phải là attachmentId hoặc { attachmentId }',
    };
  }

  for (const item of normalized) {
    if (!isAttachmentId(item.attachmentId)) {
      return {
        code: 'INVALID_ATTACHMENT',
        message: `attachmentId không hợp lệ: ${item.attachmentId}`,
      };
    }
  }

  const maxCount = Number(config.maxCount ?? config.maxFiles ?? 20);
  if (normalized.length > maxCount) {
    return {
      code: 'TOO_MANY',
      message: `Tối đa ${maxCount} tệp`,
    };
  }

  return null;
}

export function formatAttachmentListDisplay(
  value: unknown,
  labelSingular: string,
): string {
  const items = normalizeAttachmentList(value);
  if (items.length === 0) return '—';
  if (items.length === 1) {
    return items[0].originalName ?? `${labelSingular} (1)`;
  }
  const names = items
    .map((item) => item.originalName)
    .filter(Boolean)
    .slice(0, 3);
  if (names.length > 0) {
    const suffix = items.length > names.length ? ` (+${items.length - names.length})` : '';
    return `${names.join(', ')}${suffix}`;
  }
  return `${items.length} ${labelSingular}`;
}

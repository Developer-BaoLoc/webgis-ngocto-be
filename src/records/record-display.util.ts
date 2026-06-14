import { formatMoneyDisplayValue } from './utils/money-display.util';
import {
  getMeasurementUnitLabel,
  getQuantityUnitLabel,
} from '../metadata/constants/field-units.constants';
import { formatAttachmentListDisplay } from './utils/attachment-field.util';
import {
  extractMapPopupStyle,
  isShowOnMapPopupField,
  MapPopupFieldStyle,
} from './utils/map-popup-display.util';

export type SchemaFieldLike = {
  code: string;
  label: string;
  fieldType: string;
  dataSchema: Record<string, unknown>;
  displaySchema?: Record<string, unknown>;
  sortOrder?: number;
};

export type RecordDisplayField = {
  code: string;
  label: string;
  fieldType: string;
  required: boolean;
  value: unknown;
  displayValue: string;
  /** Tuỳ chỉnh hiển thị trên popup bản đồ (chỉ khi mode = popup). */
  popupStyle?: MapPopupFieldStyle;
};

export function isRequiredField(field: SchemaFieldLike): boolean {
  return field.dataSchema?.required === true;
}

export function isPopupField(field: SchemaFieldLike): boolean {
  return isShowOnMapPopupField(field);
}

export function selectPopupFields(fields: SchemaFieldLike[]): SchemaFieldLike[] {
  return [...fields]
    .filter(isPopupField)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function selectDetailFields(fields: SchemaFieldLike[]): SchemaFieldLike[] {
  return [...fields].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** Cột hiển thị trên bảng dữ liệu — bỏ ảnh/tệp (xem trong chi tiết). */
export function selectTableFields(fields: SchemaFieldLike[]): SchemaFieldLike[] {
  return selectDetailFields(fields).filter(
    (field) => !['image', 'file'].includes(field.fieldType),
  );
}

export type RecordTableColumn = {
  code: string;
  label: string;
  fieldType: string;
  required: boolean;
};

export function buildRecordTableColumns(
  fields: SchemaFieldLike[],
): RecordTableColumn[] {
  return selectTableFields(fields).map((field) => ({
    code: field.code,
    label: field.label,
    fieldType: field.fieldType,
    required: isRequiredField(field),
  }));
}

export function buildRecordTableCells(
  fields: SchemaFieldLike[],
  properties: Record<string, unknown>,
  dictionaryLabelsByField: Record<string, Record<string, string>>,
): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const field of selectTableFields(fields)) {
    cells[field.code] = formatFieldValue(
      field,
      properties[field.code],
      dictionaryLabelsByField[field.code] ?? {},
    );
  }
  return cells;
}

export function formatFieldValue(
  field: SchemaFieldLike,
  value: unknown,
  dictionaryLabels: Record<string, string> = {},
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (field.fieldType === 'lat_lng' && typeof value === 'object' && value !== null) {
    const lat = (value as { lat?: unknown }).lat;
    const lng = (value as { lng?: unknown }).lng;
    if (lat !== undefined && lng !== undefined) {
      return `${lat}, ${lng}`;
    }
  }

  if (field.fieldType === 'area_polygon' && typeof value === 'object' && value !== null) {
    const coordinates = (value as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coordinates)) {
      return `${coordinates.length} điểm`;
    }
  }

  if (field.fieldType === 'boolean') {
    return value === true || value === 'true' ? 'Có' : 'Không';
  }

  if (field.fieldType === 'category') {
    const code = String(value);
    return dictionaryLabels[code] ?? code;
  }

  if (field.fieldType === 'multi_category' && Array.isArray(value)) {
    return value
      .map((item) => dictionaryLabels[String(item)] ?? String(item))
      .join('\n');
  }

  if (field.fieldType === 'money') {
    return formatMoneyDisplayValue(
      value,
      String(field.dataSchema.unit ?? field.dataSchema.unitHint ?? 'vnd'),
    );
  }

  if (field.fieldType === 'measurement' && typeof value === 'object' && value !== null) {
    const obj = value as { value?: number; unit?: string; measurementType?: string };
    if (typeof obj.value === 'number') {
      const measurementType = String(
        obj.measurementType ?? field.dataSchema.measurementType ?? 'area',
      );
      const unitLabel = getMeasurementUnitLabel(measurementType, obj.unit);
      return `${obj.value.toLocaleString('vi-VN')} ${unitLabel}`;
    }
  }

  if (field.fieldType === 'quantity') {
    if (typeof value === 'object' && value !== null) {
      const obj = value as { value?: number; unit?: string };
      if (typeof obj.value === 'number') {
        const unitLabel = getQuantityUnitLabel(
          obj.unit ?? String(field.dataSchema.unit ?? 'kg'),
        );
        return `${obj.value.toLocaleString('vi-VN')} ${unitLabel}`;
      }
    }
    if (typeof value === 'number') {
      const unitLabel = getQuantityUnitLabel(String(field.dataSchema.unit ?? 'kg'));
      return `${value.toLocaleString('vi-VN')} ${unitLabel}`;
    }
  }

  if (field.fieldType === 'image') {
    return formatAttachmentListDisplay(value, 'ảnh');
  }

  if (field.fieldType === 'file') {
    return formatAttachmentListDisplay(value, 'tệp');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

export function buildRecordDisplayFields(
  fields: SchemaFieldLike[],
  properties: Record<string, unknown>,
  dictionaryLabelsByField: Record<string, Record<string, string>>,
  mode: 'popup' | 'detail',
): RecordDisplayField[] {
  const selected =
    mode === 'popup' ? selectPopupFields(fields) : selectDetailFields(fields);

  return selected.map((field) => {
    const value = properties[field.code];
    const item: RecordDisplayField = {
      code: field.code,
      label: field.label,
      fieldType: field.fieldType,
      required: isRequiredField(field),
      value,
      displayValue: formatFieldValue(
        field,
        value,
        dictionaryLabelsByField[field.code] ?? {},
      ),
    };

    if (mode === 'popup') {
      const popupStyle = extractMapPopupStyle(field.displaySchema);
      if (popupStyle) {
        item.popupStyle = popupStyle;
      }
    }

    return item;
  });
}

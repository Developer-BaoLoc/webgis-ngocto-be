import {
  AREA_UNITS,
  DISTANCE_UNITS,
  MEASUREMENT_TYPES,
  MONEY_UNITS,
  QUANTITY_UNITS,
} from './field-units.constants';

export const GEOMETRY_KINDS = [
  'none',
  'point',
  'multipoint',
  'linestring',
  'multilinestring',
  'polygon',
  'multipolygon',
] as const;

export const FIELD_TYPES = [
  'text',
  'textarea',
  'integer',
  'decimal',
  'money',
  'measurement',
  'quantity',
  'phone',
  'boolean',
  'date',
  'category',
  'multi_category',
  'reference',
  'relationship',
  'lat_lng',
  'area_polygon',
  'line',
  'image',
  'file',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldTypeConfigField = {
  key: string;
  label: string;
  required?: boolean;
  type: 'select' | 'dictionary' | 'layer' | 'field' | 'text';
  options?: Array<{ code: string; label: string }>;
  /** Chỉ với measurement — chọn loại đo trước khi chọn unit */
  dependsOn?: { key: string; value: string };
  /** Chỉ với field selector — đọc fields từ layer id trong dataSchema[key]. */
  sourceLayerKey?: string;
};

export const FIELD_TYPE_CATALOG: Array<{
  type: FieldType;
  label: string;
  uiComponent: string;
  valueShape?: Record<string, string>;
  configFields?: FieldTypeConfigField[];
}> = [
  { type: 'text', label: 'Văn bản ngắn', uiComponent: 'text' },
  { type: 'textarea', label: 'Văn bản dài', uiComponent: 'textarea' },
  { type: 'integer', label: 'Số nguyên', uiComponent: 'integer' },
  { type: 'decimal', label: 'Số thập phân', uiComponent: 'decimal' },
  {
    type: 'money',
    label: 'Tiền tệ',
    uiComponent: 'money',
    valueShape: {
      amount: 'number',
      currency: 'string',
      unit: 'string',
      sourceValue: 'number',
    },
    configFields: [
      {
        key: 'unit',
        label: 'Đơn vị tiền tệ',
        required: true,
        type: 'select',
        options: MONEY_UNITS.map((u) => ({ code: u.code, label: u.label })),
      },
    ],
  },
  {
    type: 'measurement',
    label: 'Đo lường',
    uiComponent: 'measurement',
    valueShape: {
      value: 'number',
      unit: 'string',
      measurementType: 'string',
      normalizedValue: 'number',
      normalizedUnit: 'string',
    },
    configFields: [
      {
        key: 'measurementType',
        label: 'Loại đo lường',
        required: true,
        type: 'select',
        options: MEASUREMENT_TYPES.map((t) => ({
          code: t.code,
          label: t.label,
        })),
      },
      {
        key: 'unit',
        label: 'Đơn vị khoảng cách',
        required: true,
        type: 'select',
        dependsOn: { key: 'measurementType', value: 'distance' },
        options: DISTANCE_UNITS.map((u) => ({ code: u.code, label: u.label })),
      },
      {
        key: 'unit',
        label: 'Đơn vị diện tích',
        required: true,
        type: 'select',
        dependsOn: { key: 'measurementType', value: 'area' },
        options: AREA_UNITS.map((u) => ({ code: u.code, label: u.label })),
      },
    ],
  },
  {
    type: 'quantity',
    label: 'Sản lượng',
    uiComponent: 'quantity',
    valueShape: { value: 'number', unit: 'string' },
    configFields: [
      {
        key: 'unit',
        label: 'Đơn vị sản lượng',
        required: true,
        type: 'select',
        options: QUANTITY_UNITS.map((u) => ({ code: u.code, label: u.label })),
      },
    ],
  },
  { type: 'phone', label: 'Số điện thoại', uiComponent: 'phone' },
  { type: 'boolean', label: 'Có / Không', uiComponent: 'boolean' },
  { type: 'date', label: 'Ngày', uiComponent: 'date' },
  {
    type: 'category',
    label: 'Chọn một',
    uiComponent: 'category',
    configFields: [
      {
        key: 'dictionary',
        label: 'Nhóm danh mục (danh sách giá trị lựa chọn)',
        required: true,
        type: 'dictionary',
      },
    ],
  },
  {
    type: 'multi_category',
    label: 'Chọn nhiều',
    uiComponent: 'multi_category',
    configFields: [
      {
        key: 'dictionary',
        label: 'Nhóm danh mục (danh sách giá trị lựa chọn)',
        required: true,
        type: 'dictionary',
      },
    ],
  },
  { type: 'reference', label: 'Liên kết bản ghi', uiComponent: 'reference' },
  {
    type: 'relationship',
    label: 'Quan hệ',
    uiComponent: 'relationship',
    valueShape: {
      value: 'feature_id',
      label: 'string',
    },
    configFields: [
      {
        key: 'relationType',
        label: 'Loại quan hệ',
        required: true,
        type: 'select',
        options: [
          { code: 'many-to-one', label: 'Many-to-One' },
          { code: 'one-to-many', label: 'One-to-Many' },
          { code: 'many-to-many', label: 'Many-to-Many' },
        ],
      },
      {
        key: 'targetLayerId',
        label: 'Target Table / Layer',
        required: true,
        type: 'layer',
      },
      {
        key: 'foreignKey',
        label: 'Foreign Key field',
        required: false,
        type: 'text',
      },
      {
        key: 'targetDisplayField',
        label: 'Display Field',
        required: true,
        type: 'field',
        sourceLayerKey: 'targetLayerId',
      },
      {
        key: 'matchField',
        label: 'Match Field khi import',
        required: false,
        type: 'field',
        sourceLayerKey: 'targetLayerId',
      },
      {
        key: 'notFoundAction',
        label: 'Nếu import không tìm thấy',
        required: false,
        type: 'select',
        options: [
          { code: 'error', label: 'Báo lỗi' },
          { code: 'skip', label: 'Bỏ qua dòng' },
          {
            code: 'create_parent',
            label: 'Tự tạo bản ghi cha (thiết kế trước)',
          },
        ],
      },
    ],
  },
  {
    type: 'lat_lng',
    label: 'Toạ độ',
    uiComponent: 'lat_lng',
    valueShape: { lat: 'number', lng: 'number' },
  },
  {
    type: 'area_polygon',
    label: 'Vùng',
    uiComponent: 'area_polygon',
    valueShape: { coordinates: 'array<{ lat, lng }>' },
  },
  {
    type: 'line',
    label: 'Đường',
    uiComponent: 'line',
    valueShape: {
      type: 'LineString | MultiLineString',
      coordinates: 'GeoJSON coordinates',
    },
  },
  {
    type: 'image',
    label: 'Hình ảnh',
    uiComponent: 'image',
    valueShape: {
      attachmentId: 'string',
      url: 'string',
      originalName: 'string',
      mimeType: 'string',
      sizeBytes: 'number',
    },
  },
  {
    type: 'file',
    label: 'Tệp tin',
    uiComponent: 'file',
    valueShape: {
      attachmentId: 'string',
      url: 'string',
      originalName: 'string',
      mimeType: 'string',
      sizeBytes: 'number',
    },
  },
];

export type GeometryKind = (typeof GEOMETRY_KINDS)[number];

export {
  MONEY_UNITS,
  DISTANCE_UNITS,
  AREA_UNITS,
  QUANTITY_UNITS,
  MEASUREMENT_TYPES,
};

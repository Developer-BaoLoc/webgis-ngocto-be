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
] as const;

export type GeometryKind = (typeof GEOMETRY_KINDS)[number];
export type FieldType = (typeof FIELD_TYPES)[number];

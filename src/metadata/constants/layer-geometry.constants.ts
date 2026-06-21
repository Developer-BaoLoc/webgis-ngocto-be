export const LAYER_GEOMETRY_TYPES = [
  'point',
  'line',
  'polygon',
  'sub_layer',
] as const;

export type LayerGeometryType = (typeof LAYER_GEOMETRY_TYPES)[number];

export const GEOMETRY_TYPE_TO_KIND: Record<LayerGeometryType, string> = {
  point: 'point',
  line: 'linestring',
  polygon: 'polygon',
  sub_layer: 'none',
};

export const GEOMETRY_KIND_TO_TYPE: Record<string, LayerGeometryType | null> = {
  point: 'point',
  multipoint: 'point',
  linestring: 'line',
  multilinestring: 'line',
  polygon: 'polygon',
  multipolygon: 'polygon',
  none: 'sub_layer',
};

export type LayerIcon =
  | { source: 'preset'; name: string }
  | { source: 'upload'; attachmentId: string; url: string };

export type LayerStyleMode = 'single' | 'by_value';

export type LayerStyleRule = {
  value: string | number | boolean;
  label?: string;
  fillColor?: string;
  strokeColor?: string;
  lineColor?: string;
};

export type DynamicLayerStyle = {
  styleMode?: LayerStyleMode;
  styleField?: string;
  styleRules?: LayerStyleRule[];
  fallbackStyle?: {
    fillColor?: string;
    strokeColor?: string;
    lineColor?: string;
  };
};

export type PointLayerStyle = DynamicLayerStyle & {
  geometryType: 'point';
  icon?: LayerIcon;
};

export type LineLayerStyle = DynamicLayerStyle & {
  geometryType: 'line';
  lineColor: string;
  lineWidth: number;
};

export type PolygonLayerStyle = DynamicLayerStyle & {
  geometryType: 'polygon';
  fillColor: string;
  strokeColor: string;
};

export type SubLayerStyle = {
  geometryType: 'sub_layer';
  layerRole: 'sub_layer';
  isSpatial: false;
  showOnMap: false;
  showInMapSidebar: false;
};

export type LayerStyleConfig =
  | PointLayerStyle
  | LineLayerStyle
  | PolygonLayerStyle
  | SubLayerStyle;

export const LAYER_GEOMETRY_TYPE_CATALOG = [
  {
    type: 'point' as const,
    label: 'Điểm',
    geometryKind: 'point',
    styleFields: [
      {
        key: 'iconAttachmentId',
        label: 'Icon (upload)',
        type: 'icon_upload',
        uploadEndpoint: '/api/assets/layer-icons/upload',
      },
    ],
  },
  {
    type: 'line' as const,
    label: 'Đường',
    geometryKind: 'linestring',
    styleFields: [
      { key: 'lineColor', label: 'Màu đường', type: 'color' },
      { key: 'lineWidth', label: 'Kích thước đường', type: 'number' },
    ],
  },
  {
    type: 'polygon' as const,
    label: 'Vùng',
    geometryKind: 'polygon',
    styleFields: [
      { key: 'fillColor', label: 'Màu vùng', type: 'color' },
      { key: 'strokeColor', label: 'Màu viền vùng', type: 'color' },
    ],
  },
  {
    type: 'sub_layer' as const,
    label: 'Lớp phụ',
    geometryKind: 'none',
    styleFields: [],
  },
];

export const LAYER_ICON_UPLOAD = {
  maxBytes: 512 * 1024,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  uploadEndpoint: '/api/assets/layer-icons/upload',
};

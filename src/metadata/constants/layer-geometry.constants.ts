export const LAYER_GEOMETRY_TYPES = ['point', 'line', 'polygon'] as const;

export type LayerGeometryType = (typeof LAYER_GEOMETRY_TYPES)[number];

export const GEOMETRY_TYPE_TO_KIND: Record<LayerGeometryType, string> = {
  point: 'point',
  line: 'linestring',
  polygon: 'polygon',
};

export const GEOMETRY_KIND_TO_TYPE: Record<string, LayerGeometryType | null> = {
  point: 'point',
  multipoint: 'point',
  linestring: 'line',
  multilinestring: 'line',
  polygon: 'polygon',
  multipolygon: 'polygon',
  none: null,
};

export type LayerIcon =
  | { source: 'preset'; name: string }
  | { source: 'upload'; attachmentId: string; url: string };

export type PointLayerStyle = {
  geometryType: 'point';
  icon: LayerIcon;
};

export type LineLayerStyle = {
  geometryType: 'line';
  lineColor: string;
  lineWidth: number;
  icon: LayerIcon;
};

export type PolygonLayerStyle = {
  geometryType: 'polygon';
  fillColor: string;
  strokeColor: string;
  icon: LayerIcon;
};

export type LayerStyleConfig =
  | PointLayerStyle
  | LineLayerStyle
  | PolygonLayerStyle;

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
      {
        key: 'iconAttachmentId',
        label: 'Icon (upload)',
        type: 'icon_upload',
        uploadEndpoint: '/api/assets/layer-icons/upload',
      },
      { key: 'lineColor', label: 'Màu đường', type: 'color' },
      { key: 'lineWidth', label: 'Kích thước đường', type: 'number' },
    ],
  },
  {
    type: 'polygon' as const,
    label: 'Vùng',
    geometryKind: 'polygon',
    styleFields: [
      {
        key: 'iconAttachmentId',
        label: 'Icon (upload)',
        type: 'icon_upload',
        uploadEndpoint: '/api/assets/layer-icons/upload',
      },
      { key: 'fillColor', label: 'Màu vùng', type: 'color' },
      { key: 'strokeColor', label: 'Màu viền vùng', type: 'color' },
    ],
  },
];

export const LAYER_ICON_UPLOAD = {
  maxBytes: 512 * 1024,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  uploadEndpoint: '/api/assets/layer-icons/upload',
};

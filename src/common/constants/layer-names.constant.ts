import { GisLayerType } from '../enums/gis-layer-type.enum';

export const LAYER_DISPLAY_NAMES: Record<GisLayerType, string> = {
  [GisLayerType.ADMINISTRATIVE_BOUNDARY]: 'Ranh giới hành chính',
  [GisLayerType.COOPERATIVE]: 'Hợp tác xã',
  [GisLayerType.COOPERATIVE_GROUP]: 'Tổ hợp tác',
  [GisLayerType.IRRIGATION]: 'Thủy lợi',
};

export const PLANNED_LAYERS = [
  { id: 'land-use', name: 'Quy hoạch sử dụng đất' },
  { id: 'infrastructure', name: 'Hạ tầng kỹ thuật' },
  { id: 'agriculture', name: 'Sản xuất nông nghiệp' },
  { id: 'canals', name: 'Kênh mương' },
] as const;

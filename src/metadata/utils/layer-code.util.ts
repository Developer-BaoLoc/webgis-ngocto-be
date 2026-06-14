import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { LayerEntity } from '../../database/entities/metadata.entity';
import {
  LayerGeometryType,
  LayerStyleConfig,
  PointLayerIcon,
} from '../constants/layer-geometry.constants';

const VIETnamese_DIACRITICS =
  /[\u0300-\u036f\u1ea0-\u1ef9]/g;

function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(VIETnamese_DIACRITICS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function slugifyLayerCode(name: string): string {
  const slug = stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 48);

  if (!slug) return 'layer';
  return /^[a-z]/.test(slug) ? slug : `l_${slug}`;
}

export async function generateUniqueLayerCode(
  layersRepository: Repository<LayerEntity>,
  tenantId: string,
  name: string,
): Promise<string> {
  const base = slugifyLayerCode(name);
  let code = base;
  let suffix = 2;

  while (
    await layersRepository.findOne({
      where: { tenantId, code },
    })
  ) {
    const tail = `_${suffix}`;
    code = `${base.slice(0, 64 - tail.length)}${tail}`;
    suffix += 1;
  }

  return code;
}

function resolvePointIcon(style: Record<string, unknown>): PointLayerIcon {
  const attachmentId = String(style.iconAttachmentId ?? '').trim();
  const iconUrl = String(style.iconUrl ?? '').trim();
  const preset = String(style.icon ?? '').trim();

  if (attachmentId) {
    if (!iconUrl) {
      throw new BadRequestException(
        'Point layer upload icon cần iconUrl (từ API upload)',
      );
    }
    return { source: 'upload', attachmentId, url: iconUrl };
  }

  if (preset) {
    return { source: 'preset', name: preset };
  }

  const storedIcon = style.icon as PointLayerIcon | undefined;
  if (
    storedIcon &&
    typeof storedIcon === 'object' &&
    'source' in storedIcon
  ) {
    return storedIcon;
  }

  throw new BadRequestException(
    'Point layer cần upload icon (iconAttachmentId) hoặc icon preset',
  );
}

export function buildStyleConfig(
  geometryType: LayerGeometryType,
  style: Record<string, unknown>,
): LayerStyleConfig {
  if (geometryType === 'point') {
    return {
      geometryType: 'point',
      icon: resolvePointIcon(style),
    };
  }

  if (geometryType === 'line') {
    const lineColor = String(style.lineColor ?? '').trim();
    const lineWidth = Number(style.lineWidth);
    if (!lineColor) {
      throw new BadRequestException('Line layer cần style.lineColor');
    }
    if (!Number.isFinite(lineWidth) || lineWidth <= 0) {
      throw new BadRequestException('Line layer cần style.lineWidth > 0');
    }
    return { geometryType: 'line', lineColor, lineWidth };
  }

  const fillColor = String(style.fillColor ?? '').trim();
  const strokeColor = String(style.strokeColor ?? '').trim();
  if (!fillColor || !strokeColor) {
    throw new BadRequestException(
      'Polygon layer cần style.fillColor và style.strokeColor',
    );
  }
  return { geometryType: 'polygon', fillColor, strokeColor };
}

export function parseStoredStyleConfig(
  geometryKind: string,
  styleConfig: Record<string, unknown>,
): LayerStyleConfig | null {
  if (styleConfig.geometryType) {
    const icon = styleConfig.icon;
    if (
      styleConfig.geometryType === 'point' &&
      typeof icon === 'string'
    ) {
      return {
        geometryType: 'point',
        icon: { source: 'preset', name: icon },
      };
    }
    return styleConfig as LayerStyleConfig;
  }

  const inferred =
    geometryKind === 'linestring'
      ? 'line'
      : geometryKind === 'polygon'
        ? 'polygon'
        : geometryKind === 'point'
          ? 'point'
          : null;

  if (!inferred) return null;

  if (inferred === 'point') {
    const rawIcon = styleConfig.icon;
    if (typeof rawIcon === 'object' && rawIcon !== null && 'source' in rawIcon) {
      return {
        geometryType: 'point',
        icon: rawIcon as PointLayerIcon,
      };
    }
    return {
      geometryType: 'point',
      icon: { source: 'preset', name: String(rawIcon ?? 'default') },
    };
  }
  if (inferred === 'line') {
    return {
      geometryType: 'line',
      lineColor: String(styleConfig.lineColor ?? '#3388ff'),
      lineWidth: Number(styleConfig.lineWidth ?? 2),
    };
  }
  return {
    geometryType: 'polygon',
    fillColor: String(styleConfig.fillColor ?? '#3388ff'),
    strokeColor: String(styleConfig.strokeColor ?? '#2266cc'),
  };
}

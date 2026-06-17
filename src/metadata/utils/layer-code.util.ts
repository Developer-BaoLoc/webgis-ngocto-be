import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { LayerEntity } from '../../database/entities/metadata.entity';
import {
  LayerGeometryType,
  LayerIcon,
  LayerStyleConfig,
} from '../constants/layer-geometry.constants';

const VIETnamese_DIACRITICS = /[\u0300-\u036f\u1ea0-\u1ef9]/g;

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

/** Sinh mã slug duy nhất trong tập mã đã có (dùng khi import/preview danh mục). */
export function generateUniqueCodeInSet(
  label: string,
  existingCodes: Set<string>,
  fallback = 'gia_tri',
): string {
  const base = slugifyLayerCode(label) || fallback;
  let code = base;
  let suffix = 2;

  while (existingCodes.has(code)) {
    code = `${base}_${suffix}`;
    suffix += 1;
  }

  existingCodes.add(code);
  return code;
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

function resolveLayerIcon(style: Record<string, unknown>): LayerIcon {
  const attachmentId = String(style.iconAttachmentId ?? '').trim();
  const iconUrl = String(style.iconUrl ?? '').trim();
  const preset = typeof style.icon === 'string' ? style.icon.trim() : '';

  if (attachmentId) {
    if (!iconUrl) {
      throw new BadRequestException('Upload icon cần iconUrl (từ API upload)');
    }
    return { source: 'upload', attachmentId, url: iconUrl };
  }

  if (preset) {
    return { source: 'preset', name: preset };
  }

  const storedIcon = style.icon as LayerIcon | undefined;
  if (storedIcon && typeof storedIcon === 'object' && 'source' in storedIcon) {
    return storedIcon;
  }

  throw new BadRequestException(
    'Lớp dữ liệu cần upload icon (iconAttachmentId) hoặc icon preset',
  );
}

function resolveOptionalLayerIcon(
  style: Record<string, unknown>,
): LayerIcon | undefined {
  const hasIconInput = Boolean(
    String(style.iconAttachmentId ?? '').trim() ||
    String(style.iconUrl ?? '').trim() ||
    (typeof style.icon === 'string' && style.icon.trim()),
  );

  const storedIcon = style.icon as LayerIcon | undefined;
  if (
    !hasIconInput &&
    !(storedIcon && typeof storedIcon === 'object' && 'source' in storedIcon)
  ) {
    return undefined;
  }

  return resolveLayerIcon(style);
}

function readStoredIcon(
  styleConfig: Record<string, unknown>,
): LayerIcon | null {
  const rawIcon = styleConfig.icon;
  if (typeof rawIcon === 'object' && rawIcon !== null && 'source' in rawIcon) {
    return rawIcon as LayerIcon;
  }
  if (typeof rawIcon === 'string' && rawIcon.trim()) {
    return { source: 'preset', name: rawIcon.trim() };
  }
  return null;
}

export function buildStyleConfig(
  geometryType: LayerGeometryType,
  style: Record<string, unknown>,
): LayerStyleConfig {
  if (geometryType === 'point') {
    const icon = resolveOptionalLayerIcon(style);
    return {
      geometryType: 'point',
      ...(icon ? { icon } : {}),
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
    return {
      geometryType: 'line',
      lineColor,
      lineWidth,
    };
  }

  const fillColor = String(style.fillColor ?? '').trim();
  const strokeColor = String(style.strokeColor ?? '').trim();
  if (!fillColor || !strokeColor) {
    throw new BadRequestException(
      'Polygon layer cần style.fillColor và style.strokeColor',
    );
  }
  return {
    geometryType: 'polygon',
    fillColor,
    strokeColor,
  };
}

export function parseStoredStyleConfig(
  geometryKind: string,
  styleConfig: Record<string, unknown>,
): LayerStyleConfig | null {
  if (styleConfig.geometryType) {
    const icon = styleConfig.icon;
    if (styleConfig.geometryType === 'point' && typeof icon === 'string') {
      return {
        geometryType: 'point',
        icon: { source: 'preset', name: icon },
      };
    }
    if (styleConfig.geometryType === 'point') {
      const storedIcon = readStoredIcon(styleConfig);
      return {
        geometryType: 'point',
        ...(storedIcon ? { icon: storedIcon } : {}),
      };
    }
    if (styleConfig.geometryType === 'line') {
      return {
        geometryType: 'line',
        lineColor: String(styleConfig.lineColor ?? '#3388ff'),
        lineWidth: Number(styleConfig.lineWidth ?? 2),
      };
    }
    if (styleConfig.geometryType === 'polygon') {
      return {
        geometryType: 'polygon',
        fillColor: String(styleConfig.fillColor ?? '#3388ff'),
        strokeColor: String(styleConfig.strokeColor ?? '#2266cc'),
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
    const icon = readStoredIcon(styleConfig);
    if (icon) {
      return { geometryType: 'point', icon };
    }
    return {
      geometryType: 'point',
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

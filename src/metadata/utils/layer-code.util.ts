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
  const dynamicStyle = normalizeDynamicStyle(style);
  if (geometryType === 'sub_layer') {
    return {
      geometryType: 'sub_layer',
      layerRole: 'sub_layer',
      isSpatial: false,
      showOnMap: false,
      showInMapSidebar: false,
    };
  }

  if (geometryType === 'point') {
    const icon = resolveOptionalLayerIcon(style);
    return {
      geometryType: 'point',
      ...dynamicStyle,
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
      ...dynamicStyle,
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
    ...dynamicStyle,
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
        ...normalizeDynamicStyle(styleConfig),
        icon: { source: 'preset', name: icon },
      };
    }
    if (styleConfig.geometryType === 'point') {
      const storedIcon = readStoredIcon(styleConfig);
      return {
        geometryType: 'point',
        ...normalizeDynamicStyle(styleConfig),
        ...(storedIcon ? { icon: storedIcon } : {}),
      };
    }
    if (styleConfig.geometryType === 'line') {
      return {
        geometryType: 'line',
        ...normalizeDynamicStyle(styleConfig),
        lineColor: String(styleConfig.lineColor ?? '#3388ff'),
        lineWidth: Number(styleConfig.lineWidth ?? 2),
      };
    }
    if (styleConfig.geometryType === 'polygon') {
      return {
        geometryType: 'polygon',
        ...normalizeDynamicStyle(styleConfig),
        fillColor: String(styleConfig.fillColor ?? '#3388ff'),
        strokeColor: String(styleConfig.strokeColor ?? '#2266cc'),
      };
    }
    if (styleConfig.geometryType === 'sub_layer') {
      return {
        geometryType: 'sub_layer',
        layerRole: 'sub_layer',
        isSpatial: false,
        showOnMap: false,
        showInMapSidebar: false,
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
      return {
        geometryType: 'point',
        ...normalizeDynamicStyle(styleConfig),
        icon,
      };
    }
    return {
      geometryType: 'point',
      ...normalizeDynamicStyle(styleConfig),
    };
  }
  if (inferred === 'line') {
    return {
      geometryType: 'line',
      ...normalizeDynamicStyle(styleConfig),
      lineColor: String(styleConfig.lineColor ?? '#3388ff'),
      lineWidth: Number(styleConfig.lineWidth ?? 2),
    };
  }
  return {
    geometryType: 'polygon',
    ...normalizeDynamicStyle(styleConfig),
    fillColor: String(styleConfig.fillColor ?? '#3388ff'),
    strokeColor: String(styleConfig.strokeColor ?? '#2266cc'),
  };
}

function normalizeDynamicStyle(
  style: Record<string, unknown>,
): Record<string, unknown> {
  if (style.styleMode === 'single_icon') {
    return { styleMode: 'single_icon' };
  }
  if (style.styleMode === 'icon_by_value') {
    const styleField = String(style.styleField ?? '').trim();
    if (!styleField) {
      throw new BadRequestException('Icon theo giá trị cần chọn styleField');
    }
    const iconRules = Array.isArray(style.iconRules)
      ? style.iconRules.flatMap((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return [];
          }
          const rule = item as Record<string, unknown>;
          const value = rule.value;
          const attachmentId = String(rule.attachmentId ?? '').trim();
          const url = String(rule.url ?? '').trim();
          if (
            typeof value !== 'string' &&
            typeof value !== 'number' &&
            typeof value !== 'boolean'
          ) {
            return [];
          }
          return [
            {
              value,
              ...(typeof rule.label === 'string' ? { label: rule.label } : {}),
              ...(attachmentId ? { attachmentId } : {}),
              ...(url ? { url } : {}),
            },
          ];
        })
      : [];
    const fallback =
      style.fallbackIcon &&
      typeof style.fallbackIcon === 'object' &&
      !Array.isArray(style.fallbackIcon)
        ? (style.fallbackIcon as Record<string, unknown>)
        : {};
    const fallbackAttachmentId = String(fallback.attachmentId ?? '').trim();
    const fallbackUrl = String(fallback.url ?? '').trim();
    return {
      styleMode: 'icon_by_value',
      styleField,
      iconRules,
      ...(fallbackAttachmentId && fallbackUrl
        ? {
            fallbackIcon: {
              attachmentId: fallbackAttachmentId,
              url: fallbackUrl,
            },
          }
        : {}),
    };
  }
  if (style.styleMode !== 'by_value') return { styleMode: 'single' };

  const styleField = String(style.styleField ?? '').trim();
  if (!styleField) {
    throw new BadRequestException('Style theo giá trị cần chọn styleField');
  }
  const rules = Array.isArray(style.styleRules)
    ? style.styleRules.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const rule = item as Record<string, unknown>;
        const value = rule.value;
        if (
          typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean'
        ) {
          return [];
        }
        return [
          {
            value,
            ...(typeof rule.label === 'string' ? { label: rule.label } : {}),
            ...(typeof rule.fillColor === 'string'
              ? { fillColor: rule.fillColor }
              : {}),
            ...(typeof rule.strokeColor === 'string'
              ? { strokeColor: rule.strokeColor }
              : {}),
            ...(typeof rule.lineColor === 'string'
              ? { lineColor: rule.lineColor }
              : {}),
          },
        ];
      })
    : [];
  const fallback =
    style.fallbackStyle &&
    typeof style.fallbackStyle === 'object' &&
    !Array.isArray(style.fallbackStyle)
      ? (style.fallbackStyle as Record<string, unknown>)
      : {};

  return {
    styleMode: 'by_value',
    styleField,
    styleRules: rules,
    fallbackStyle: {
      ...(typeof fallback.fillColor === 'string'
        ? { fillColor: fallback.fillColor }
        : {}),
      ...(typeof fallback.strokeColor === 'string'
        ? { strokeColor: fallback.strokeColor }
        : {}),
      ...(typeof fallback.lineColor === 'string'
        ? { lineColor: fallback.lineColor }
        : {}),
    },
  };
}

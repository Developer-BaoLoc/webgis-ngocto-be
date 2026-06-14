import {
  POPUP_BOLD_KEY,
  POPUP_FONT_SIZE_KEY,
  POPUP_TEXT_COLOR_KEY,
  PopupFontSizeCode,
  SHOW_ON_MAP_POPUP_KEY,
} from '../../metadata/constants/field-display.constants';

type FieldLike = {
  dataSchema?: Record<string, unknown>;
  displaySchema?: Record<string, unknown>;
};

export type MapPopupFieldStyle = {
  bold?: boolean;
  fontSize?: PopupFontSizeCode;
  color?: string;
};

export function isRequiredField(field: FieldLike): boolean {
  return field.dataSchema?.required === true;
}

/** Trường có hiện trong popup khi click icon trên bản đồ. */
export function isShowOnMapPopupField(field: FieldLike): boolean {
  const display = field.displaySchema ?? {};

  if (display[SHOW_ON_MAP_POPUP_KEY] === true) return true;
  if (display[SHOW_ON_MAP_POPUP_KEY] === false) return false;

  if (display.visibleInPopup === true) return true;
  if (display.visibleInPopup === false) return false;

  return isRequiredField(field);
}

const POPUP_FONT_SIZES = new Set<PopupFontSizeCode>(['small', 'medium', 'large']);

function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return undefined;
}

/** Đọc tuỳ chỉnh hiển thị popup từ displaySchema của field. */
export function extractMapPopupStyle(
  displaySchema?: Record<string, unknown>,
): MapPopupFieldStyle | undefined {
  if (!displaySchema) return undefined;

  const style: MapPopupFieldStyle = {};

  if (displaySchema[POPUP_BOLD_KEY] === true) {
    style.bold = true;
  }

  const fontSize = displaySchema[POPUP_FONT_SIZE_KEY];
  if (
    typeof fontSize === 'string' &&
    POPUP_FONT_SIZES.has(fontSize as PopupFontSizeCode)
  ) {
    style.fontSize = fontSize as PopupFontSizeCode;
  }

  const color = normalizeHexColor(displaySchema[POPUP_TEXT_COLOR_KEY]);
  if (color) {
    style.color = color;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

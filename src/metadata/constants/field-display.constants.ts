/** Hiển thị trong popup khi click icon trên bản đồ. */
export const SHOW_ON_MAP_POPUP_KEY = 'showOnMapPopup';

/** In đậm giá trị trên popup bản đồ. */
export const POPUP_BOLD_KEY = 'popupBold';

/** Cỡ chữ trên popup: small | medium | large. */
export const POPUP_FONT_SIZE_KEY = 'popupFontSize';

/** Màu chữ hex, VD: #2563eb. */
export const POPUP_TEXT_COLOR_KEY = 'popupTextColor';

export const POPUP_FONT_SIZE_OPTIONS = [
  { code: 'small', label: 'Nhỏ' },
  { code: 'medium', label: 'Vừa' },
  { code: 'large', label: 'Lớn' },
] as const;

export type PopupFontSizeCode =
  (typeof POPUP_FONT_SIZE_OPTIONS)[number]['code'];

export const MAP_POPUP_DISPLAY_GROUP = {
  key: 'mapPopup',
  label: 'Tuỳ chỉnh popup bản đồ',
  hint: 'Áp dụng khi trường được bật "Hiển thị khi click trên bản đồ"',
};

export const FIELD_DISPLAY_SCHEMA_OPTIONS = [
  {
    key: SHOW_ON_MAP_POPUP_KEY,
    label: 'Hiển thị khi click trên bản đồ',
    hint: 'Thông tin này hiện trong khung popup khi người dùng click icon trên bản đồ',
    type: 'boolean' as const,
    default: false,
    group: MAP_POPUP_DISPLAY_GROUP.key,
  },
  {
    key: POPUP_BOLD_KEY,
    label: 'In đậm',
    hint: 'In đậm nội dung trường này trên popup bản đồ',
    type: 'boolean' as const,
    default: false,
    group: MAP_POPUP_DISPLAY_GROUP.key,
    dependsOn: { key: SHOW_ON_MAP_POPUP_KEY, value: true },
  },
  {
    key: POPUP_FONT_SIZE_KEY,
    label: 'Cỡ chữ',
    hint: 'Kích thước chữ hiển thị trên popup bản đồ',
    type: 'select' as const,
    options: [...POPUP_FONT_SIZE_OPTIONS],
    default: 'medium',
    group: MAP_POPUP_DISPLAY_GROUP.key,
    dependsOn: { key: SHOW_ON_MAP_POPUP_KEY, value: true },
  },
  {
    key: POPUP_TEXT_COLOR_KEY,
    label: 'Màu chữ',
    hint: 'Màu chữ hex (VD: #2563eb). Để trống = màu mặc định',
    type: 'color' as const,
    default: null,
    group: MAP_POPUP_DISPLAY_GROUP.key,
    dependsOn: { key: SHOW_ON_MAP_POPUP_KEY, value: true },
  },
];

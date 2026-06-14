export type UnitOption = {
  code: string;
  label: string;
  /** Hệ số quy đổi về đơn vị lưu trữ (VND, m, m2, kg) */
  multiplier?: number;
};

export const MONEY_UNITS: UnitOption[] = [
  { code: 'vnd', label: 'VNĐ', multiplier: 1 },
  { code: 'hundred_thousand', label: 'Trăm nghìn đồng', multiplier: 100_000 },
  { code: 'million', label: 'Triệu đồng', multiplier: 1_000_000 },
  { code: 'billion', label: 'Tỷ đồng', multiplier: 1_000_000_000 },
];

export const DISTANCE_UNITS: UnitOption[] = [
  { code: 'm', label: 'm', multiplier: 1 },
  { code: 'km', label: 'km', multiplier: 1_000 },
];

export const AREA_UNITS: UnitOption[] = [
  { code: 'm2', label: 'm²', multiplier: 1 },
  { code: 'ha', label: 'ha', multiplier: 10_000 },
];

export const QUANTITY_UNITS: UnitOption[] = [
  { code: 'kg', label: 'kg', multiplier: 1 },
  { code: 'tan', label: 'tấn', multiplier: 1_000 },
  { code: 'lit', label: 'lít', multiplier: 1 },
  { code: 'm3', label: 'm³', multiplier: 1 },
  { code: 'con', label: 'con', multiplier: 1 },
  { code: 'bo', label: 'bó', multiplier: 1 },
  { code: 'cay', label: 'cây', multiplier: 1 },
];

export const MEASUREMENT_TYPES = [
  { code: 'distance', label: 'Khoảng cách', units: DISTANCE_UNITS },
  { code: 'area', label: 'Diện tích', units: AREA_UNITS },
] as const;

export type MeasurementTypeCode = (typeof MEASUREMENT_TYPES)[number]['code'];

const moneyMultiplierMap = Object.fromEntries(
  MONEY_UNITS.flatMap((u) => [
    [u.code, u.multiplier ?? 1],
    ...(u.code === 'million' ? [['million_vnd', u.multiplier ?? 1]] : []),
  ]),
);

const distanceMultiplierMap = Object.fromEntries(
  DISTANCE_UNITS.map((u) => [u.code, u.multiplier ?? 1]),
);

const areaMultiplierMap = Object.fromEntries(
  AREA_UNITS.map((u) => [u.code, u.multiplier ?? 1]),
);

export function getMoneyMultiplier(unitCode: string): number {
  return moneyMultiplierMap[unitCode] ?? 1;
}

export function getMeasurementMultiplier(
  measurementType: string,
  unitCode: string,
): number {
  const map =
    measurementType === 'distance' ? distanceMultiplierMap : areaMultiplierMap;
  return map[unitCode] ?? 1;
}

export function getMeasurementStorageUnit(measurementType: string): string {
  return measurementType === 'distance' ? 'm' : 'm2';
}

export function getUnitLabel(
  units: UnitOption[],
  code: string | undefined,
): string {
  if (!code) return '';
  return units.find((u) => u.code === code)?.label ?? code;
}

export function getMoneyUnitLabel(code: string | undefined): string {
  return getUnitLabel(MONEY_UNITS, code);
}

export function getQuantityUnitLabel(code: string | undefined): string {
  return getUnitLabel(QUANTITY_UNITS, code);
}

export function getMeasurementUnitLabel(
  measurementType: string,
  code: string | undefined,
): string {
  const units =
    measurementType === 'distance' ? DISTANCE_UNITS : AREA_UNITS;
  return getUnitLabel(units, code);
}

export function isValidMoneyUnit(code: string): boolean {
  return MONEY_UNITS.some((u) => u.code === code);
}

export function isValidQuantityUnit(code: string): boolean {
  return QUANTITY_UNITS.some((u) => u.code === code);
}

export function isValidMeasurementUnit(
  measurementType: string,
  code: string,
): boolean {
  const group = MEASUREMENT_TYPES.find((t) => t.code === measurementType);
  return group?.units.some((u) => u.code === code) ?? false;
}

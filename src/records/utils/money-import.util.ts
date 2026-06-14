import {
  getMoneyMultiplier,
} from '../../metadata/constants/field-units.constants';
import { normalizeMoneyUnitCode } from './money-display.util';

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function parseFlexibleNumber(text: string): number | null {
  const cleaned = String(text ?? '').trim();
  if (!cleaned) return null;

  const decimalDot = /^-?\d+\.\d{1,2}$/;
  const decimalComma = /^-?\d+,\d{1,2}$/;
  if (decimalDot.test(cleaned)) {
    return Number(cleaned);
  }
  if (decimalComma.test(cleaned)) {
    return Number(cleaned.replace(',', '.'));
  }

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'));
  }

  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
    return Number(cleaned.replace(/,/g, ''));
  }

  const num = Number(cleaned.replace(/,/g, '.'));
  return Number.isFinite(num) ? num : null;
}

export function sanitizeMoneySourceValue(
  sourceValue: number,
  unitCode: string,
): number {
  return roundMoneySourceValue(
    normalizeMoneySourceNumber(sourceValue, unitCode),
  );
}

function detectMoneyUnitFromText(text: string): string | null {
  const normalized = stripAccents(String(text).toLowerCase());

  if (/\b(ty|tỷ)\b/.test(normalized)) return 'billion';
  if (/\b(trieu|triệu)\b/.test(normalized)) return 'million';
  if (/\b(tram nghin|trăm nghìn)\b/.test(normalized)) {
    return 'hundred_thousand';
  }
  if (/\b(vnd|dong|đồng|vnđ)\b/.test(normalized)) return 'vnd';

  return null;
}

export function normalizeMoneySourceNumber(
  num: number,
  schemaUnit: string,
): number {
  const unitCode = normalizeMoneyUnitCode(schemaUnit);
  if (unitCode === 'vnd') return num;

  const multiplier = getMoneyMultiplier(unitCode);
  if (Math.abs(num) >= multiplier) {
    return num / multiplier;
  }

  return num;
}

function convertMoneyBetweenUnits(
  amount: number,
  fromUnit: string,
  toUnit: string,
): number {
  const from = normalizeMoneyUnitCode(fromUnit);
  const to = normalizeMoneyUnitCode(toUnit);
  if (from === to) return amount;

  const vnd = amount * getMoneyMultiplier(from);
  return vnd / getMoneyMultiplier(to);
}

export function parseMoneyImportValue(
  raw: unknown,
  schemaUnit: string | undefined,
): number | null {
  if (raw === null || raw === undefined || raw === '') return null;

  const defaultUnit = normalizeMoneyUnitCode(schemaUnit ?? 'vnd');

  if (typeof raw === 'object' && raw !== null) {
    if ('sourceValue' in raw) {
      const sourceValue = Number((raw as { sourceValue: number }).sourceValue);
      if (!Number.isFinite(sourceValue)) return null;
      const unit = normalizeMoneyUnitCode(
        String((raw as { sourceUnit?: string }).sourceUnit ?? defaultUnit),
      );
      return convertMoneyBetweenUnits(sourceValue, unit, defaultUnit);
    }

    if ('value' in raw) {
      return parseMoneyImportValue(
        (raw as { value: unknown }).value,
        schemaUnit,
      );
    }

    if ('amount' in raw) {
      const amount = Number((raw as { amount: number }).amount);
      if (!Number.isFinite(amount)) return null;
      const unit = normalizeMoneyUnitCode(
        String((raw as { unit?: string }).unit ?? 'vnd'),
      );
      return convertMoneyBetweenUnits(amount, unit, defaultUnit);
    }
  }

  if (typeof raw === 'number') {
    return normalizeMoneySourceNumber(raw, defaultUnit);
  }

  const text = String(raw).trim();
  const explicitUnit = detectMoneyUnitFromText(text);
  const numMatch = text.match(/-?[\d.,]+/);
  if (!numMatch) return null;

  const num = parseFlexibleNumber(numMatch[0]);
  if (num === null) return null;

  if (explicitUnit) {
    return convertMoneyBetweenUnits(num, explicitUnit, defaultUnit);
  }

  return normalizeMoneySourceNumber(num, defaultUnit);
}

export function roundMoneySourceValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function buildNormalizedMoneyValue(
  sourceAmount: number,
  unitCode: string,
): {
  amount: number;
  currency: string;
  unit: string;
  sourceValue: number;
  sourceUnit: string;
} {
  const normalizedUnit = normalizeMoneyUnitCode(unitCode);
  const sourceValue = roundMoneySourceValue(sourceAmount);
  const multiplier = getMoneyMultiplier(normalizedUnit);

  return {
    amount: Math.round(sourceValue * multiplier),
    currency: 'VND',
    unit: normalizedUnit,
    sourceValue,
    sourceUnit: normalizedUnit,
  };
}

export function extractMoneySourceAmount(
  value: unknown,
  unitCode: string,
): number | null {
  const normalizedUnit = normalizeMoneyUnitCode(unitCode);

  if (typeof value === 'object' && value !== null) {
    const obj = value as {
      sourceValue?: number;
      value?: number;
      amount?: number;
      unit?: string;
      sourceUnit?: string;
      currency?: string;
    };

    if (typeof obj.sourceValue === 'number' && Number.isFinite(obj.sourceValue)) {
      return obj.sourceValue;
    }

    if (typeof obj.value === 'number' && Number.isFinite(obj.value) && !('amount' in obj)) {
      return obj.value;
    }

    if (typeof obj.amount === 'number' && Number.isFinite(obj.amount)) {
      const objUnit = normalizeMoneyUnitCode(
        String(obj.sourceUnit ?? obj.unit ?? normalizedUnit),
      );
      return obj.amount / getMoneyMultiplier(objUnit);
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeMoneySourceNumber(value, normalizedUnit);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return parseMoneyImportValue(value, normalizedUnit);
  }

  return null;
}

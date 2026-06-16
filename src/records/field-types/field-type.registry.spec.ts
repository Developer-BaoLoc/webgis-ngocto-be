import {
  normalizeProperties,
  validateProperties,
} from './field-type.registry';

const fields = [
  {
    code: 'nam_xay',
    fieldType: 'decimal',
    dataSchema: {},
  },
];

describe('field-type registry number handlers', () => {
  it.each([
    [2018, 2018],
    [2018.5, 2018.5],
    ['2018', 2018],
    ['2018.5', 2018.5],
    ['-15', -15],
  ])('accepts GeoJSON decimal value %p', (raw, expected) => {
    const errors = validateProperties(fields, { nam_xay: raw });
    const normalized = normalizeProperties(fields, { nam_xay: raw });

    expect(errors).toEqual([]);
    expect(normalized.nam_xay).toBe(expected);
  });

  it('rejects non-numeric decimal values', () => {
    const errors = validateProperties(fields, { nam_xay: 'abc' });

    expect(errors).toEqual([
      {
        field: 'nam_xay',
        code: 'INVALID_TYPE',
        message: 'Phải là số',
      },
    ]);
  });

  it('uses required validation for missing decimal values', () => {
    const errors = validateProperties(
      [{ ...fields[0], dataSchema: { required: true } }],
      { nam_xay: null },
    );

    expect(errors).toEqual([
      {
        field: 'nam_xay',
        code: 'REQUIRED',
        message: 'Bắt buộc',
      },
    ]);
  });
});

import { normalizeProperties, validateProperties } from './field-type.registry';

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

describe('field-type registry relationship handler', () => {
  const relationshipFields = [
    {
      code: 'entity_id',
      fieldType: 'relationship',
      dataSchema: {
        relationType: 'many-to-one',
        targetLayerId: 'target-layer-id',
        targetDisplayField: 'name',
      },
    },
  ];

  it('normalizes selected relationship option to target feature id', () => {
    const normalized = normalizeProperties(relationshipFields, {
      entity_id: {
        value: '8c22f757-fd4b-44cf-a5f6-af42c7da93e2',
        label: 'Cơ sở 10 Oanh',
      },
    });

    expect(normalized.entity_id).toBe('8c22f757-fd4b-44cf-a5f6-af42c7da93e2');
  });

  it('validates required relationship fields', () => {
    const errors = validateProperties(
      [
        {
          ...relationshipFields[0],
          dataSchema: {
            ...relationshipFields[0].dataSchema,
            required: true,
          },
        },
      ],
      { entity_id: null },
    );

    expect(errors).toEqual([
      {
        field: 'entity_id',
        code: 'REQUIRED',
        message: 'Bắt buộc',
      },
    ]);
  });
});

describe('field-type registry line handler', () => {
  const lineFields = [
    {
      code: 'tuyen',
      fieldType: 'line',
      dataSchema: {},
    },
  ];

  it('accepts GeoJSON LineString values', () => {
    const value = {
      type: 'LineString',
      coordinates: [
        [105.123, 10.456],
        [105.124, 10.457],
      ],
    };

    const errors = validateProperties(lineFields, { tuyen: value });
    const normalized = normalizeProperties(lineFields, { tuyen: value });

    expect(errors).toEqual([]);
    expect(normalized.tuyen).toEqual(value);
  });

  it('rejects Point values for line fields', () => {
    const errors = validateProperties(lineFields, {
      tuyen: { type: 'Point', coordinates: [105.123, 10.456] },
    });

    expect(errors).toEqual([
      {
        field: 'tuyen',
        code: 'INVALID_TYPE',
        message: 'Phải là LineString/MultiLineString với tối thiểu 2 điểm',
      },
    ]);
  });

  it('requires at least two vertices', () => {
    const errors = validateProperties(lineFields, {
      tuyen: { type: 'LineString', coordinates: [[105.123, 10.456]] },
    });

    expect(errors).toEqual([
      {
        field: 'tuyen',
        code: 'INVALID_TYPE',
        message: 'Phải là LineString/MultiLineString với tối thiểu 2 điểm',
      },
    ]);
  });
});

import { geometryMatchesKind, normalizeKey } from './geojson-import.service';
import { suggestImportFieldType } from './import-column-discovery';

describe('geojson-import helpers', () => {
  describe('geometryMatchesKind', () => {
    it('matches point and multipoint according to layer geometry kind', () => {
      expect(geometryMatchesKind('Point', 'point')).toBe(true);
      expect(geometryMatchesKind('MultiPoint', 'point')).toBe(false);
      expect(geometryMatchesKind('Point', 'multipoint')).toBe(true);
      expect(geometryMatchesKind('MultiPoint', 'multipoint')).toBe(true);
    });

    it('matches line and multiline according to layer geometry kind', () => {
      expect(geometryMatchesKind('LineString', 'linestring')).toBe(true);
      expect(geometryMatchesKind('MultiLineString', 'linestring')).toBe(false);
      expect(geometryMatchesKind('LineString', 'multilinestring')).toBe(true);
      expect(geometryMatchesKind('MultiLineString', 'multilinestring')).toBe(true);
    });

    it('matches polygon and multipolygon according to layer geometry kind', () => {
      expect(geometryMatchesKind('Polygon', 'polygon')).toBe(true);
      expect(geometryMatchesKind('MultiPolygon', 'polygon')).toBe(false);
      expect(geometryMatchesKind('Polygon', 'multipolygon')).toBe(true);
      expect(geometryMatchesKind('MultiPolygon', 'multipolygon')).toBe(true);
    });

    it('rejects unsupported geometry collections', () => {
      expect(geometryMatchesKind('GeometryCollection', 'polygon')).toBe(false);
    });
  });

  describe('normalizeKey', () => {
    it('normalizes Vietnamese labels and OSM-like keys for auto mapping', () => {
      expect(normalizeKey('Tên đường')).toBe('ten_duong');
      expect(normalizeKey('name:vi')).toBe('name_vi');
      expect(normalizeKey('Loại Đường')).toBe('loai_duong');
    });
  });

  describe('suggestImportFieldType', () => {
    it('suggests decimal for numeric samples', () => {
      expect(suggestImportFieldType(['2020', '2019']).suggestedType).toBe(
        'decimal',
      );
    });

    it('suggests date only for explicit date-like samples', () => {
      expect(
        suggestImportFieldType(['2026-01-01', '2026-05-20']).suggestedType,
      ).toBe('date');
    });
  });
});

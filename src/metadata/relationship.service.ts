import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MetadataService } from './metadata.service';

export type RelationshipFieldLike = {
  code: string;
  label?: string;
  fieldType: string;
  dataSchema: Record<string, unknown>;
};

export type RelationshipOption = {
  value: string;
  label: string;
};

export type RelationshipResolveResult = {
  id: string | null;
  label: string;
  status: 'matched' | 'not_found' | 'ambiguous' | 'created';
};

export type RelationshipDisplayValue = {
  value: string | null;
  rawValue: string | null;
  label: string | null;
  status: 'empty' | 'matched' | 'not_found';
  message?: string;
  relationType: RelationshipConfig['relationType'];
  foreignKey: string;
  targetLayerId: string;
  targetLayerCode: string;
  targetLayerName: string;
  targetDisplayField: string;
  matchField: string;
};

export type RelationshipConfig = {
  relationType: 'many-to-one' | 'one-to-many' | 'many-to-many';
  targetLayerId?: string;
  targetLayerCode?: string;
  foreignKey: string;
  targetPrimaryKey: 'id';
  targetDisplayField: string;
  matchField: string;
  notFoundAction: 'error' | 'skip' | 'create_parent';
};

type RelationshipImportError = {
  rowNumber: number;
  field: string;
  fieldLabel: string;
  rawValue: string | null;
  code: string;
  message: string;
};

type ImportRowLike = {
  rowNumber: number;
  properties: Record<string, unknown>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function unwrapRelationshipValue(value: unknown): string | null {
  if (!isPresent(value)) return null;
  if (typeof value === 'object' && value !== null) {
    const record = value as { value?: unknown; id?: unknown };
    const raw = record.value ?? record.id;
    return isPresent(raw) ? String(raw).trim() : null;
  }
  return String(value).trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function uniqueValues(values: unknown[]): string[] {
  return [
    ...new Set(values.map(unwrapRelationshipValue).filter(Boolean) as string[]),
  ];
}

export function getRelationshipConfig(
  field: RelationshipFieldLike,
): RelationshipConfig | null {
  if (field.fieldType !== 'relationship') return null;
  const schema = field.dataSchema ?? {};
  const relationType = String(schema.relationType ?? '').trim();
  if (
    relationType !== 'many-to-one' &&
    relationType !== 'one-to-many' &&
    relationType !== 'many-to-many'
  ) {
    return null;
  }

  const targetLayerId = normalizeText(schema.targetLayerId);
  const targetLayerCode =
    normalizeText(schema.targetLayerCode) ||
    normalizeText(schema.targetTable) ||
    undefined;
  const displayField =
    normalizeText(schema.targetDisplayField) ||
    normalizeText(schema.displayField) ||
    'id';

  return {
    relationType,
    targetLayerId: targetLayerId || undefined,
    targetLayerCode,
    foreignKey: normalizeText(schema.foreignKey) || field.code,
    targetPrimaryKey: 'id',
    targetDisplayField: displayField,
    matchField:
      normalizeText(schema.matchField) ||
      normalizeText(schema.displayField) ||
      displayField,
    notFoundAction:
      normalizeText(schema.notFoundAction) === 'skip'
        ? 'skip'
        : normalizeText(schema.notFoundAction) === 'create_parent'
          ? 'create_parent'
          : 'error',
  };
}

@Injectable()
export class RelationshipService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly metadataService: MetadataService,
  ) {}

  async listOptions(
    tenantId: string,
    query: {
      targetLayerId?: string;
      targetTable?: string;
      targetLayerCode?: string;
      displayField?: string;
      q?: string;
      limit?: number;
    },
  ): Promise<RelationshipOption[]> {
    const layer = await this.resolveTargetLayer(tenantId, query);
    const displayField = normalizeText(query.displayField) || 'id';
    await this.assertTargetField(tenantId, layer.id, displayField, true);

    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
    const params: unknown[] = [tenantId, layer.id, displayField, limit];
    let searchClause = '';

    if (isPresent(query.q)) {
      params.push(`%${String(query.q).trim()}%`);
      searchClause = `AND (
        CASE
          WHEN $3::text = 'id' THEN f.id::text
          ELSE COALESCE(f.properties->>($3::text), '')
        END ILIKE $5
      )`;
    }

    const rows = await this.dataSource.query<
      Array<{ value: string; label: string }>
    >(
      `
      SELECT
        f.id::text AS value,
        COALESCE(
          NULLIF(
            CASE
              WHEN $3::text = 'id' THEN f.id::text
              ELSE f.properties->>($3::text)
            END,
            ''
          ),
          f.id::text
        ) AS label
      FROM features f
      WHERE f.tenant_id = $1
        AND f.layer_id = $2
        AND f.deleted_at IS NULL
        ${searchClause}
      ORDER BY label ASC
      LIMIT $4
      `,
      params,
    );

    return rows.map((row) => ({ value: row.value, label: row.label }));
  }

  async resolveValues(
    tenantId: string,
    input: {
      targetLayerId?: string;
      targetTable?: string;
      targetLayerCode?: string;
      matchField?: string;
      displayField?: string;
      values: string[];
    },
  ): Promise<Record<string, RelationshipResolveResult>> {
    const values = uniqueValues(input.values);
    const result: Record<string, RelationshipResolveResult> =
      Object.fromEntries(
        values.map((value) => [
          value,
          {
            id: null,
            label: value,
            status: 'not_found' as const,
          },
        ]),
      );
    if (values.length === 0) return result;

    const layer = await this.resolveTargetLayer(tenantId, input);
    const matchField = normalizeText(input.matchField) || 'id';
    const displayField = normalizeText(input.displayField) || matchField;
    await this.assertTargetField(tenantId, layer.id, matchField, true);
    await this.assertTargetField(tenantId, layer.id, displayField, true);

    const rows = await this.queryMatches(
      tenantId,
      layer.id,
      matchField,
      displayField,
      values,
    );
    const matchesByValue = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.match_value;
      matchesByValue.set(key, [...(matchesByValue.get(key) ?? []), row]);
    }

    for (const value of values) {
      const matches = matchesByValue.get(value) ?? [];
      if (matches.length === 1) {
        result[value] = {
          id: matches[0].id,
          label: matches[0].label || value,
          status: 'matched',
        };
      } else if (matches.length > 1) {
        result[value] = {
          id: null,
          label: value,
          status: 'ambiguous',
        };
      }
    }

    return result;
  }

  async normalizeImportRows<T extends ImportRowLike>(
    tenantId: string,
    fields: RelationshipFieldLike[],
    rows: T[],
  ): Promise<{
    rows: T[];
    errors: RelationshipImportError[];
  }> {
    const relationshipFields = fields
      .map((field) => ({ field, config: getRelationshipConfig(field) }))
      .filter(
        (
          item,
        ): item is {
          field: RelationshipFieldLike;
          config: RelationshipConfig;
        } =>
          Boolean(item.config) && item.config?.relationType === 'many-to-one',
      );

    if (relationshipFields.length === 0 || rows.length === 0) {
      return { rows, errors: [] };
    }

    const normalizedRows = rows.map((row) => ({
      ...row,
      properties: { ...row.properties },
    })) as T[];
    const errors: RelationshipImportError[] = [];

    for (const { field, config } of relationshipFields) {
      const rawValues = normalizedRows
        .map((row) => row.properties[field.code])
        .filter(isPresent);
      const values = uniqueValues(rawValues);
      if (values.length === 0) continue;

      const target = await this.resolveTargetLayer(tenantId, {
        targetLayerId: config.targetLayerId,
        targetLayerCode: config.targetLayerCode,
      });
      const matches = await this.resolveValues(tenantId, {
        targetLayerId: target.id,
        matchField: config.matchField,
        displayField: config.targetDisplayField,
        values,
      });

      for (const row of normalizedRows) {
        const raw = row.properties[field.code];
        const key = unwrapRelationshipValue(raw);
        if (!key) continue;
        if (UUID_RE.test(key)) {
          row.properties[field.code] = key;
          continue;
        }

        const match = matches[key];
        if (match?.status === 'matched' && match.id) {
          row.properties[field.code] = match.id;
          continue;
        }

        if (config.notFoundAction === 'skip') {
          delete row.properties[field.code];
          continue;
        }

        errors.push({
          rowNumber: row.rowNumber,
          field: field.code,
          fieldLabel: field.label ?? field.code,
          rawValue: raw === null || raw === undefined ? null : String(raw),
          code:
            match?.status === 'ambiguous'
              ? 'RELATIONSHIP_AMBIGUOUS'
              : 'RELATIONSHIP_NOT_FOUND',
          message:
            match?.status === 'ambiguous'
              ? `Cột "${field.label ?? field.code}": tìm thấy nhiều bản ghi khớp "${key}"`
              : `Cột "${field.label ?? field.code}": không tìm thấy bản ghi liên kết "${key}"`,
        });
      }
    }

    return { rows: normalizedRows, errors };
  }

  async decorateRecordProperties(
    tenantId: string,
    fields: RelationshipFieldLike[],
    properties: Record<string, unknown>,
    recordId?: string,
  ): Promise<Record<string, unknown>> {
    const next = { ...properties };
    for (const field of fields) {
      const config = getRelationshipConfig(field);
      if (!config) continue;

      if (config.relationType === 'many-to-one') {
        const value = unwrapRelationshipValue(next[field.code]);
        const target = await this.resolveTargetLayer(tenantId, {
          targetLayerId: config.targetLayerId,
          targetLayerCode: config.targetLayerCode,
        });
        if (!value) {
          next[field.code] = this.buildDisplayValue(config, target, null, null);
          continue;
        }
        const label = UUID_RE.test(value)
          ? await this.lookupLabel(tenantId, config, value)
          : null;
        next[field.code] = this.buildDisplayValue(config, target, value, label);
      }

      if (config.relationType === 'one-to-many' && recordId) {
        next[field.code] = await this.listChildren(tenantId, config, recordId);
      }
    }
    return next;
  }

  async resolveTargetLayer(
    tenantId: string,
    input: {
      targetLayerId?: string;
      targetTable?: string;
      targetLayerCode?: string;
    },
  ) {
    const id = normalizeText(input.targetLayerId);
    if (id) {
      return this.metadataService.getLayerById(tenantId, id);
    }

    const code =
      normalizeText(input.targetLayerCode) || normalizeText(input.targetTable);
    if (!code) {
      throw new BadRequestException('Thiếu targetLayerId hoặc targetTable');
    }
    return this.metadataService.getLayerByCode(tenantId, code);
  }

  async checkRelationship(
    tenantId: string,
    input: {
      sourceLayerId: string;
      fieldCode?: string;
      relationType?: string;
      targetLayerId?: string;
      targetLayerCode?: string;
      targetTable?: string;
      foreignKey?: string;
      targetDisplayField?: string;
      matchField?: string;
    },
  ) {
    const sourceLayer = await this.metadataService.getLayerById(
      tenantId,
      input.sourceLayerId,
    );
    const sourceSchema = await this.metadataService.getPublishedSchema(
      tenantId,
      input.sourceLayerId,
    );
    const existingField = input.fieldCode
      ? sourceSchema.fields.find((field) => field.code === input.fieldCode)
      : null;
    const config = existingField
      ? getRelationshipConfig(existingField)
      : this.configFromInput(input);

    if (!config) {
      throw new BadRequestException('Relationship config không hợp lệ');
    }

    const targetLayer = await this.resolveTargetLayer(tenantId, {
      targetLayerId: config.targetLayerId,
      targetLayerCode: config.targetLayerCode ?? input.targetLayerCode,
      targetTable: input.targetTable,
    });

    const childLayer =
      config.relationType === 'one-to-many' ? targetLayer : sourceLayer;
    const parentLayer =
      config.relationType === 'one-to-many' ? sourceLayer : targetLayer;
    const foreignKey = config.foreignKey || input.fieldCode || '';
    if (!foreignKey) {
      throw new BadRequestException('Thiếu foreignKey để kiểm tra liên kết');
    }

    const rows = await this.dataSource.query<
      Array<{
        child_with_fk: string;
        matched: string;
        unmatched: string;
      }>
    >(
      `
      WITH child AS (
        SELECT f.id, f.properties->>($3::text) AS fk_value
        FROM features f
        WHERE f.tenant_id = $1
          AND f.layer_id = $2
          AND f.deleted_at IS NULL
          AND NULLIF(f.properties->>($3::text), '') IS NOT NULL
      ),
      matched AS (
        SELECT c.id
        FROM child c
        INNER JOIN features p
          ON p.tenant_id = $1
         AND p.layer_id = $4
         AND p.deleted_at IS NULL
         AND p.id::text = c.fk_value
      )
      SELECT
        (SELECT COUNT(*) FROM child)::int AS child_with_fk,
        (SELECT COUNT(*) FROM matched)::int AS matched,
        ((SELECT COUNT(*) FROM child) - (SELECT COUNT(*) FROM matched))::int AS unmatched
      `,
      [tenantId, childLayer.id, foreignKey, parentLayer.id],
    );

    const errors = await this.dataSource.query<
      Array<{
        childId: string;
        rawValue: string;
        childLabel: string;
      }>
    >(
      `
      SELECT
        c.id::text AS "childId",
        c.fk_value AS "rawValue",
        COALESCE(NULLIF(c.properties->>($5::text), ''), c.id::text) AS "childLabel"
      FROM (
        SELECT f.id, f.properties, f.properties->>($3::text) AS fk_value
        FROM features f
        WHERE f.tenant_id = $1
          AND f.layer_id = $2
          AND f.deleted_at IS NULL
          AND NULLIF(f.properties->>($3::text), '') IS NOT NULL
      ) c
      LEFT JOIN features p
        ON p.tenant_id = $1
       AND p.layer_id = $4
       AND p.deleted_at IS NULL
       AND p.id::text = c.fk_value
      WHERE p.id IS NULL
      ORDER BY c.id
      LIMIT 10
      `,
      [
        tenantId,
        childLayer.id,
        foreignKey,
        parentLayer.id,
        config.targetDisplayField,
      ],
    );

    const summary = rows[0] ?? {
      child_with_fk: '0',
      matched: '0',
      unmatched: '0',
    };

    return {
      sourceLayer: {
        id: sourceLayer.id,
        code: sourceLayer.code,
        name: sourceLayer.name,
      },
      childLayer: {
        id: childLayer.id,
        code: childLayer.code,
        name: childLayer.name,
      },
      parentLayer: {
        id: parentLayer.id,
        code: parentLayer.code,
        name: parentLayer.name,
      },
      relationType: config.relationType,
      foreignKey,
      childWithForeignKey: Number(summary.child_with_fk ?? 0),
      matched: Number(summary.matched ?? 0),
      unmatched: Number(summary.unmatched ?? 0),
      errors: errors.map((error) => ({
        childId: error.childId,
        childLabel: error.childLabel,
        rawValue: error.rawValue,
        message: `Không tìm thấy bản ghi cha với id ${error.rawValue}`,
      })),
    };
  }

  async resolveAgain(
    tenantId: string,
    input: {
      sourceLayerId: string;
      fieldCode: string;
    },
  ) {
    const schema = await this.metadataService.getPublishedSchema(
      tenantId,
      input.sourceLayerId,
    );
    const field = schema.fields.find((item) => item.code === input.fieldCode);
    const config = field ? getRelationshipConfig(field) : null;
    if (!field || !config || config.relationType !== 'many-to-one') {
      throw new BadRequestException(
        'Resolve lại chỉ hỗ trợ relationship many-to-one đã tồn tại',
      );
    }

    const target = await this.resolveTargetLayer(tenantId, {
      targetLayerId: config.targetLayerId,
      targetLayerCode: config.targetLayerCode,
    });

    const sourceRows = await this.dataSource.query<
      Array<{ id: string; raw_value: string }>
    >(
      `
      SELECT f.id::text AS id, f.properties->>($3::text) AS raw_value
      FROM features f
      WHERE f.tenant_id = $1
        AND f.layer_id = $2
        AND f.deleted_at IS NULL
        AND NULLIF(f.properties->>($3::text), '') IS NOT NULL
      `,
      [tenantId, input.sourceLayerId, field.code],
    );

    const candidates = sourceRows
      .map((row) => row.raw_value)
      .filter((value) => !UUID_RE.test(value));
    const matches = await this.resolveValues(tenantId, {
      targetLayerId: target.id,
      matchField: config.matchField,
      displayField: config.targetDisplayField,
      values: candidates,
    });

    let updated = 0;
    const errors: Array<{
      recordId: string;
      rawValue: string;
      message: string;
    }> = [];
    await this.dataSource.transaction(async (manager) => {
      for (const row of sourceRows) {
        if (UUID_RE.test(row.raw_value)) continue;
        const match = matches[row.raw_value];
        if (match?.status === 'matched' && match.id) {
          await manager.query(
            `
            UPDATE features
            SET properties = jsonb_set(properties, $3::text[], to_jsonb($4::text), true)
            WHERE tenant_id = $1 AND id = $2::uuid
            `,
            [tenantId, row.id, [field.code], match.id],
          );
          updated += 1;
        } else if (errors.length < 10) {
          errors.push({
            recordId: row.id,
            rawValue: row.raw_value,
            message:
              match?.status === 'ambiguous'
                ? `Tìm thấy nhiều bản ghi cha khớp "${row.raw_value}"`
                : `Không tìm thấy bản ghi cha khớp "${row.raw_value}"`,
          });
        }
      }
    });

    return {
      sourceLayerId: input.sourceLayerId,
      fieldCode: field.code,
      targetLayerId: target.id,
      scanned: sourceRows.length,
      alreadyIds: sourceRows.filter((row) => UUID_RE.test(row.raw_value))
        .length,
      updated,
      notMatched:
        sourceRows.length -
        sourceRows.filter((row) => UUID_RE.test(row.raw_value)).length -
        updated,
      errors,
    };
  }

  async suggestInboundRelationships(tenantId: string, layerId: string) {
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    const schema = await this.metadataService.getPublishedSchema(
      tenantId,
      layerId,
    );
    const existing = new Set(
      schema.fields
        .filter((field) => field.fieldType === 'relationship')
        .flatMap((field) => {
          const config = getRelationshipConfig(field);
          if (config?.relationType !== 'one-to-many') return [];
          return [
            `${config.targetLayerId ?? ''}:${config.foreignKey}`,
            `${config.targetLayerCode ?? ''}:${config.foreignKey}`,
          ];
        })
        .filter(Boolean),
    );

    const rows = await this.dataSource.query<
      Array<{
        source_layer_id: string;
        source_layer_code: string;
        source_layer_name: string;
        field_code: string;
        field_label: string;
        data_schema: Record<string, unknown>;
      }>
    >(
      `
      SELECT
        l.id::text AS source_layer_id,
        l.code AS source_layer_code,
        l.name AS source_layer_name,
        sf.code AS field_code,
        sf.label AS field_label,
        sf.data_schema
      FROM schema_field_versions sf
      INNER JOIN layer_schema_versions sv
        ON sv.id = sf.schema_version_id
       AND sv.tenant_id = sf.tenant_id
       AND sv.layer_id = sf.layer_id
       AND sv.status = 'published'
      INNER JOIN layers l
        ON l.id = sf.layer_id
       AND l.tenant_id = sf.tenant_id
      WHERE sf.tenant_id = $1
        AND sf.is_active = TRUE
        AND sf.field_type = 'relationship'
        AND sf.data_schema->>'relationType' = 'many-to-one'
        AND (
          sf.data_schema->>'targetLayerId' = $2
          OR sf.data_schema->>'targetLayerCode' = $3
          OR sf.data_schema->>'targetTable' = $3
        )
      ORDER BY l.name ASC, sf.sort_order ASC
      `,
      [tenantId, layer.id, layer.code],
    );

    return rows
      .map((row) => {
        const foreignKey =
          normalizeText(row.data_schema?.foreignKey) || row.field_code;
        const idKey = `${row.source_layer_id}:${foreignKey}`;
        const codeKey = `${row.source_layer_code}:${foreignKey}`;
        if (existing.has(idKey) || existing.has(codeKey)) return null;
        return {
          sourceLayerId: row.source_layer_id,
          sourceLayerCode: row.source_layer_code,
          sourceLayerName: row.source_layer_name,
          foreignKey,
          sourceFieldCode: row.field_code,
          sourceFieldLabel: row.field_label,
          suggestedLabel: row.source_layer_name,
          targetDisplayField:
            normalizeText(row.data_schema?.targetDisplayField) || 'id',
          matchField:
            normalizeText(row.data_schema?.matchField) ||
            normalizeText(row.data_schema?.targetDisplayField) ||
            'id',
          message: `Layer này có thể được liên kết bởi field ${foreignKey} từ ${row.source_layer_name}. Bạn có muốn tạo field One-to-Many để hiển thị danh sách con không?`,
        };
      })
      .filter(
        (
          item,
        ): item is {
          sourceLayerId: string;
          sourceLayerCode: string;
          sourceLayerName: string;
          foreignKey: string;
          sourceFieldCode: string;
          sourceFieldLabel: string;
          suggestedLabel: string;
          targetDisplayField: string;
          matchField: string;
          message: string;
        } => Boolean(item),
      );
  }

  private async lookupLabel(
    tenantId: string,
    config: RelationshipConfig,
    featureId: string,
  ): Promise<string | null> {
    const target = await this.resolveTargetLayer(tenantId, {
      targetLayerId: config.targetLayerId,
      targetLayerCode: config.targetLayerCode,
    });
    const rows = await this.dataSource.query<Array<{ label: string }>>(
      `
      SELECT COALESCE(
        NULLIF(
          CASE
            WHEN $3::text = 'id' THEN f.id::text
            ELSE f.properties->>($3::text)
          END,
          ''
        ),
        f.id::text
      ) AS label
      FROM features f
      WHERE f.tenant_id = $1
        AND f.layer_id = $2
        AND f.id = $4::uuid
        AND f.deleted_at IS NULL
      LIMIT 1
      `,
      [tenantId, target.id, config.targetDisplayField, featureId],
    );
    return rows[0]?.label ?? null;
  }

  private async listChildren(
    tenantId: string,
    config: RelationshipConfig,
    sourceRecordId: string,
  ) {
    const target = await this.resolveTargetLayer(tenantId, {
      targetLayerId: config.targetLayerId,
      targetLayerCode: config.targetLayerCode,
    });
    const childSchema = await this.metadataService.getPublishedSchema(
      tenantId,
      target.id,
    );
    const summaryFields = childSchema.fields
      .filter(
        (field) =>
          field.code !== config.foreignKey &&
          field.code !== config.targetDisplayField &&
          !['image', 'file', 'lat_lng', 'area_polygon'].includes(
            field.fieldType,
          ),
      )
      .slice(0, 2)
      .map((field) => field.code);

    const rows = await this.dataSource.query<
      Array<{ id: string; label: string; properties: Record<string, unknown> }>
    >(
      `
      SELECT
        f.id::text AS id,
        COALESCE(NULLIF(f.properties->>($4::text), ''), f.id::text) AS label,
        f.properties
      FROM features f
      WHERE f.tenant_id = $1
        AND f.layer_id = $2
        AND f.deleted_at IS NULL
        AND f.properties->>($3::text) = $5
      ORDER BY label ASC
      LIMIT 100
      `,
      [
        tenantId,
        target.id,
        config.foreignKey,
        config.targetDisplayField,
        sourceRecordId,
      ],
    );
    return rows.map((row) => ({
      id: row.id,
      label: this.buildChildLabel(row.label, row.properties, summaryFields),
      properties: row.properties,
    }));
  }

  private buildDisplayValue(
    config: RelationshipConfig,
    target: { id: string; code: string; name: string },
    rawValue: string | null,
    label: string | null,
  ): RelationshipDisplayValue {
    if (!rawValue) {
      return {
        value: null,
        rawValue: null,
        label: null,
        status: 'empty',
        message: 'Chưa liên kết',
        relationType: config.relationType,
        foreignKey: config.foreignKey,
        targetLayerId: target.id,
        targetLayerCode: target.code,
        targetLayerName: target.name,
        targetDisplayField: config.targetDisplayField,
        matchField: config.matchField,
      };
    }

    if (label) {
      return {
        value: rawValue,
        rawValue,
        label,
        status: 'matched',
        relationType: config.relationType,
        foreignKey: config.foreignKey,
        targetLayerId: target.id,
        targetLayerCode: target.code,
        targetLayerName: target.name,
        targetDisplayField: config.targetDisplayField,
        matchField: config.matchField,
      };
    }

    return {
      value: rawValue,
      rawValue,
      label: null,
      status: 'not_found',
      message: `Không tìm thấy bản ghi cha. Giá trị ${config.foreignKey} hiện tại là: ${rawValue}`,
      relationType: config.relationType,
      foreignKey: config.foreignKey,
      targetLayerId: target.id,
      targetLayerCode: target.code,
      targetLayerName: target.name,
      targetDisplayField: config.targetDisplayField,
      matchField: config.matchField,
    };
  }

  private buildChildLabel(
    baseLabel: string,
    properties: Record<string, unknown>,
    summaryFields: string[],
  ): string {
    const extras = summaryFields
      .map((fieldCode) => properties[fieldCode])
      .filter(isPresent)
      .map((value) => String(value).trim());
    return [baseLabel, ...extras].filter(Boolean).join(' - ');
  }

  private configFromInput(input: {
    relationType?: string;
    targetLayerId?: string;
    targetLayerCode?: string;
    targetTable?: string;
    foreignKey?: string;
    targetDisplayField?: string;
    matchField?: string;
  }): RelationshipConfig | null {
    const field: RelationshipFieldLike = {
      code: normalizeText(input.foreignKey) || 'relationship',
      fieldType: 'relationship',
      dataSchema: {
        relationType: input.relationType,
        targetLayerId: input.targetLayerId,
        targetLayerCode: input.targetLayerCode,
        targetTable: input.targetTable,
        foreignKey: input.foreignKey,
        targetDisplayField: input.targetDisplayField,
        matchField: input.matchField,
        notFoundAction: 'error',
      },
    };
    return getRelationshipConfig(field);
  }

  private async queryMatches(
    tenantId: string,
    targetLayerId: string,
    matchField: string,
    displayField: string,
    values: string[],
  ): Promise<Array<{ id: string; match_value: string; label: string }>> {
    if (values.length === 0) return [];
    const matchExpr =
      matchField === 'id' ? 'f.id::text' : 'f.properties->>($3::text)';
    const displayExpr =
      displayField === 'id' ? 'f.id::text' : 'f.properties->>($4::text)';

    return this.dataSource.query(
      `
      SELECT
        f.id::text AS id,
        ${matchExpr} AS match_value,
        COALESCE(NULLIF(${displayExpr}, ''), f.id::text) AS label
      FROM features f
      WHERE f.tenant_id = $1
        AND f.layer_id = $2
        AND f.deleted_at IS NULL
        AND ${matchExpr} = ANY($5::text[])
      `,
      [tenantId, targetLayerId, matchField, displayField, values],
    );
  }

  private async assertTargetField(
    tenantId: string,
    layerId: string,
    fieldCode: string,
    allowId = false,
  ) {
    if (allowId && fieldCode === 'id') return;
    const schema = await this.metadataService.getPublishedSchema(
      tenantId,
      layerId,
    );
    const exists = schema.fields.some((field) => field.code === fieldCode);
    if (!exists) {
      throw new BadRequestException(
        `Field "${fieldCode}" không tồn tại trong target layer`,
      );
    }
  }
}

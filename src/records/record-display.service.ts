import { Injectable } from '@nestjs/common';
import { DictionariesService } from '../dictionaries/dictionaries.service';
import { MetadataService } from '../metadata/metadata.service';
import {
  buildRecordDisplayFields,
  buildRecordTableCells,
  buildRecordTableColumns,
  RecordDisplayField,
  RecordTableColumn,
  SchemaFieldLike,
} from './record-display.util';

export type RecordDisplayPayload = {
  recordId: string;
  layerId: string;
  layerCode: string;
  layerName: string;
  popup: RecordDisplayField[];
  detail: RecordDisplayField[];
};

export type RecordListTableContext = {
  fields: SchemaFieldLike[];
  columns: RecordTableColumn[];
  dictionaryLabelsByField: Record<string, Record<string, string>>;
};

@Injectable()
export class RecordDisplayService {
  constructor(
    private readonly metadataService: MetadataService,
    private readonly dictionariesService: DictionariesService,
  ) {}

  async buildDisplay(
    tenantId: string,
    layerId: string,
    recordId: string,
    properties: Record<string, unknown>,
  ): Promise<RecordDisplayPayload> {
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    const schema = await this.metadataService.getPublishedSchema(tenantId, layerId);
    const dictionaryLabelsByField = await this.resolveDictionaryLabels(
      tenantId,
      schema.fields as SchemaFieldLike[],
    );

    return {
      recordId,
      layerId,
      layerCode: layer.code,
      layerName: layer.name,
      popup: buildRecordDisplayFields(
        schema.fields as SchemaFieldLike[],
        properties,
        dictionaryLabelsByField,
        'popup',
      ),
      detail: buildRecordDisplayFields(
        schema.fields as SchemaFieldLike[],
        properties,
        dictionaryLabelsByField,
        'detail',
      ),
    };
  }

  async buildPopupSummary(
    tenantId: string,
    layerId: string,
    properties: Record<string, unknown>,
  ) {
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    const schema = await this.metadataService.getPublishedSchema(tenantId, layerId);
    const dictionaryLabelsByField = await this.resolveDictionaryLabels(
      tenantId,
      schema.fields as SchemaFieldLike[],
    );

    return {
      layerId,
      layerCode: layer.code,
      layerName: layer.name,
      fields: buildRecordDisplayFields(
        schema.fields as SchemaFieldLike[],
        properties,
        dictionaryLabelsByField,
        'popup',
      ),
    };
  }

  async buildListTableContext(
    tenantId: string,
    layerId: string,
  ): Promise<RecordListTableContext> {
    await this.metadataService.getLayerById(tenantId, layerId);
    const schema = await this.metadataService.getPublishedSchema(tenantId, layerId);
    const fields = schema.fields as SchemaFieldLike[];
    const dictionaryLabelsByField = await this.resolveDictionaryLabels(
      tenantId,
      fields,
    );

    return {
      fields,
      columns: buildRecordTableColumns(fields),
      dictionaryLabelsByField,
    };
  }

  buildTableCells(
    context: RecordListTableContext,
    properties: Record<string, unknown>,
  ): Record<string, string> {
    return buildRecordTableCells(
      context.fields,
      properties,
      context.dictionaryLabelsByField,
    );
  }

  private async resolveDictionaryLabels(
    tenantId: string,
    fields: SchemaFieldLike[],
  ) {
    const result: Record<string, Record<string, string>> = {};

    for (const field of fields) {
      const dictionaryCode = String(
        field.dataSchema?.dictionary ?? field.dataSchema?.dictionaryCode ?? '',
      ).trim();
      if (
        !dictionaryCode ||
        !['category', 'multi_category'].includes(field.fieldType)
      ) {
        continue;
      }

      try {
        const items = await this.dictionariesService.listItems(
          tenantId,
          dictionaryCode,
        );
        result[field.code] = Object.fromEntries(
          items.map((item) => [item.code, item.label]),
        );
      } catch {
        result[field.code] = {};
      }
    }

    return result;
  }
}

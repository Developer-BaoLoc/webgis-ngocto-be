import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DatasetsService } from '../datasets/datasets.service';
import { MetadataService } from '../metadata/metadata.service';
import { SavedViewsService } from '../saved-views/saved-views.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService Dataset query', () => {
  const datasetsService = {
    resolveDataset: jest.fn(),
  };
  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(
      {} as DataSource,
      {} as MetadataService,
      {} as SavedViewsService,
      datasetsService as unknown as DatasetsService,
    );
  });

  it('ignores empty and invalid metric values when calculating avg', async () => {
    datasetsService.resolveDataset.mockResolvedValue({
      fields: [
        { key: 'value', label: 'Giá trị', type: 'number' },
        { key: 'group', label: 'Nhóm', type: 'select' },
      ],
      rows: [
        { value: 10, group: 'A' },
        { value: null, group: 'A' },
        { value: 'invalid', group: 'B' },
        { value: 20, group: 'B' },
      ],
    });

    await expect(
      service.query('tenant-id', {
        datasetId: 'dataset-id',
        aggregation: 'avg',
        metricField: 'value',
      }),
    ).resolves.toMatchObject({ value: 15 });
  });

  it('supports group by select with min, sort, and limit', async () => {
    datasetsService.resolveDataset.mockResolvedValue({
      fields: [
        { key: 'value', label: 'Giá trị', type: 'decimal' },
        { key: 'group', label: 'Nhóm', type: 'select' },
      ],
      rows: [
        { value: 7, group: 'B' },
        { value: 4, group: 'A' },
        { value: 2, group: 'B' },
        { value: 9, group: 'C' },
      ],
    });

    const result = await service.query('tenant-id', {
      datasetId: 'dataset-id',
      aggregation: 'min',
      metricField: 'value',
      dimensionField: 'group',
      sort: { field: 'group', direction: 'asc' },
      limit: 2,
    });

    expect(result.rows).toEqual([
      { label: 'A', rawLabel: 'A', value: 4 },
      { label: 'B', rawLabel: 'B', value: 2 },
    ]);
  });

  it('keeps null values last in a Top N result', async () => {
    datasetsService.resolveDataset.mockResolvedValue({
      fields: [{ key: 'value', label: 'Giá trị', type: 'currency' }],
      rows: [{ value: null }, { value: 3 }, { value: 9 }],
    });

    const result = await service.query('tenant-id', {
      datasetId: 'dataset-id',
      aggregation: 'top',
      metricField: 'value',
      sort: { field: 'value', direction: 'desc' },
      limit: 2,
    });

    expect(result.records).toEqual([{ value: 9 }, { value: 3 }]);
  });

  it('returns selected raw records for operational widgets', async () => {
    datasetsService.resolveDataset.mockResolvedValue({
      fields: [
        { key: 'title', label: 'Tiêu đề', type: 'text' },
        { key: 'date', label: 'Ngày', type: 'date' },
        { key: 'status', label: 'Trạng thái', type: 'select' },
      ],
      rows: [
        { title: 'Bón phân', date: '2026-07-02', status: 'sap_toi' },
        { title: 'Gieo sạ', date: '2026-06-20', status: 'da_xong' },
      ],
    });

    const result = await service.query('tenant-id', {
      datasetId: 'dataset-id',
      aggregation: 'records',
      displayFields: ['title', 'date'],
      sort: { field: 'date', direction: 'asc' },
      limit: 1,
    });

    expect(result).toMatchObject({
      aggregation: 'records',
      fieldLabels: {
        title: 'Tiêu đề',
        date: 'Ngày',
        status: 'Trạng thái',
      },
      records: [{ title: 'Gieo sạ', date: '2026-06-20' }],
    });
  });

  it('rejects a non-numeric metric field', async () => {
    datasetsService.resolveDataset.mockResolvedValue({
      fields: [{ key: 'name', label: 'Tên', type: 'text' }],
      rows: [{ name: 'HTX Ngọc Tố' }],
    });

    await expect(
      service.query('tenant-id', {
        datasetId: 'dataset-id',
        aggregation: 'sum',
        metricField: 'name',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

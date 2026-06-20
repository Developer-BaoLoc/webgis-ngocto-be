import { ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DatasetEntity } from '../database/entities/dataset.entity';
import { SavedViewsService } from '../saved-views/saved-views.service';
import { DatasetsService } from './datasets.service';

describe('DatasetsService', () => {
  const repository = {
    findOne: jest.fn(),
    remove: jest.fn(),
  };
  const savedViewsService = {
    resolveRowsForDataset: jest.fn(),
  };
  const dataSource = { query: jest.fn() };
  let service: DatasetsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DatasetsService(
      repository as unknown as Repository<DatasetEntity>,
      savedViewsService as unknown as SavedViewsService,
      dataSource as unknown as DataSource,
    );
  });

  it('merges Saved View sources and resolves constant mappings', async () => {
    savedViewsService.resolveRowsForDataset
      .mockResolvedValueOnce({
        fields: [{ code: 'dien_tich' }],
        rows: [{ dien_tich: '12.5' }],
      })
      .mockResolvedValueOnce({
        fields: [{ code: 'dien_tich_ha' }],
        rows: [{ dien_tich_ha: 8 }],
      });

    const result = await service.preview('tenant-id', {
      config: {
        fields: [
          { key: 'area', label: 'Diện tích', type: 'decimal' },
          { key: 'source', label: 'Nguồn', type: 'select' },
        ],
        sources: [
          {
            viewId: '00000000-0000-4000-8000-000000000001',
            sourceLabel: 'Nguồn A',
            mapping: {
              area: 'dien_tich',
              source: '__constant:Khu A',
            },
          },
          {
            viewId: '00000000-0000-4000-8000-000000000002',
            sourceLabel: 'Nguồn B',
            mapping: {
              area: 'dien_tich_ha',
              source: '__constant:Khu B',
            },
          },
        ],
        previewLimit: 20,
      },
    });

    expect(result.rows).toEqual([
      { area: 12.5, source: 'Khu A' },
      { area: 8, source: 'Khu B' },
    ]);
  });

  it('returns HTTP 409 semantics when a widget is using the Dataset', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dataset-id',
      tenantId: 'tenant-id',
      createdBy: 'user-id',
      isActive: true,
    });
    jest.spyOn(service, 'usage').mockResolvedValue({
      widgetCount: 2,
      dashboards: [{ id: 'dashboard-id', name: 'Tổng quan Ngọc Tố' }],
    });

    await expect(
      service.remove('tenant-id', 'dataset-id', 'user-id', false),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.remove('tenant-id', 'dataset-id', 'user-id', false),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.remove).not.toHaveBeenCalled();
  });
});

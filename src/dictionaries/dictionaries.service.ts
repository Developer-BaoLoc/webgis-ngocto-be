import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DictionaryEntity,
  DictionaryItemEntity,
} from '../database/entities/dictionary.entity';
import { slugifyLayerCode } from '../metadata/utils/layer-code.util';
import { findMissingCategoryLabels } from '../import/import-normalizer';
import {
  CreateDictionaryDto,
  CreateDictionaryItemDto,
  UpdateDictionaryDto,
  UpdateDictionaryItemDto,
} from './dto/dictionary.dto';

export type DictionaryValueSummary = {
  id: string;
  code: string;
  label: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
};

export type DictionarySummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isHierarchical: boolean;
  scope: 'tenant' | 'system';
  itemCount: number;
};

@Injectable()
export class DictionariesService {
  constructor(
    @InjectRepository(DictionaryEntity)
    private readonly dictionariesRepository: Repository<DictionaryEntity>,
    @InjectRepository(DictionaryItemEntity)
    private readonly itemsRepository: Repository<DictionaryItemEntity>,
  ) {}

  async list(tenantId: string): Promise<DictionarySummary[]> {
    const items = await this.dictionariesRepository
      .createQueryBuilder('d')
      .leftJoin(
        DictionaryItemEntity,
        'di',
        'di.dictionary_id = d.id AND di.is_active = TRUE',
      )
      .where('d.tenant_id IS NULL OR d.tenant_id = :tenantId', { tenantId })
      .groupBy('d.id')
      .orderBy('d.name', 'ASC')
      .select([
        'd.id AS id',
        'd.code AS code',
        'd.name AS name',
        'd.description AS description',
        'd.is_hierarchical AS "isHierarchical"',
        'd.tenant_id AS "tenantId"',
        'COUNT(di.id)::int AS "itemCount"',
      ])
      .getRawMany<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        isHierarchical: boolean;
        tenantId: string | null;
        itemCount: number;
      }>();

    return items.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      description: d.description,
      isHierarchical: d.isHierarchical,
      scope: d.tenantId ? 'tenant' : 'system',
      itemCount: d.itemCount ?? 0,
    }));
  }

  async getByCode(
    tenantId: string,
    code: string,
    options?: { includeItems?: boolean; includeInactive?: boolean },
  ) {
    const dictionary = await this.findDictionaryOrThrow(tenantId, code);
    const itemCount = await this.itemsRepository.count({
      where: {
        dictionaryId: dictionary.id,
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
    });

    const result = {
      id: dictionary.id,
      code: dictionary.code,
      name: dictionary.name,
      description: dictionary.description,
      isHierarchical: dictionary.isHierarchical,
      scope: dictionary.tenantId ? ('tenant' as const) : ('system' as const),
      itemCount,
      items: undefined as DictionaryValueSummary[] | undefined,
      values: undefined as DictionaryValueSummary[] | undefined,
    };

    if (options?.includeItems) {
      const items = await this.itemsRepository.find({
        where: {
          dictionaryId: dictionary.id,
          ...(options.includeInactive ? {} : { isActive: true }),
        },
        order: { sortOrder: 'ASC', label: 'ASC' },
      });
      result.items = items.map((item) => this.toValueSummary(item));
      result.values = result.items;
    }

    return result;
  }

  async exists(tenantId: string, code: string): Promise<boolean> {
    const dictionary = await this.dictionariesRepository
      .createQueryBuilder('d')
      .where('d.code = :code', { code })
      .andWhere('(d.tenant_id IS NULL OR d.tenant_id = :tenantId)', {
        tenantId,
      })
      .getOne();
    return Boolean(dictionary);
  }

  async createDictionary(tenantId: string, dto: CreateDictionaryDto) {
    const baseCode = slugifyLayerCode(dto.name);
    let code = baseCode;
    let suffix = 2;

    while (
      await this.dictionariesRepository
        .createQueryBuilder('d')
        .where('d.code = :code', { code })
        .andWhere('(d.tenant_id IS NULL OR d.tenant_id = :tenantId)', {
          tenantId,
        })
        .getOne()
    ) {
      code = `${baseCode}_${suffix}`;
      suffix += 1;
    }

    const dictionary = await this.dictionariesRepository.save(
      this.dictionariesRepository.create({
        tenantId,
        code,
        name: dto.name,
        description: dto.description ?? null,
        isHierarchical: dto.isHierarchical ?? false,
      }),
    );

    const values = dto.values?.length
      ? await this.createValuesInternal(
          dictionary,
          dto.values.map((value, index) => ({
            label: value.label,
            code: value.code,
            sortOrder: value.sortOrder ?? index + 1,
          })),
        )
      : [];

    return {
      id: dictionary.id,
      code: dictionary.code,
      name: dictionary.name,
      description: dictionary.description,
      isHierarchical: dictionary.isHierarchical,
      scope: 'tenant' as const,
      itemCount: values.length,
      values,
    };
  }

  async updateDictionary(
    tenantId: string,
    code: string,
    dto: UpdateDictionaryDto,
  ) {
    const dictionary = await this.findDictionaryOrThrow(tenantId, code);
    this.assertDictionaryWritable(dictionary, tenantId);

    if (dto.name !== undefined) dictionary.name = dto.name;
    if (dto.description !== undefined) {
      dictionary.description = dto.description ?? null;
    }
    if (dto.isHierarchical !== undefined) {
      dictionary.isHierarchical = dto.isHierarchical;
    }

    await this.dictionariesRepository.save(dictionary);
    return this.getByCode(tenantId, code);
  }

  async deleteDictionary(tenantId: string, code: string) {
    const dictionary = await this.findDictionaryOrThrow(tenantId, code);
    this.assertDictionaryWritable(dictionary, tenantId);

    await this.dictionariesRepository.remove(dictionary);
    return { deleted: true, code };
  }

  async createItem(
    tenantId: string,
    dictionaryCode: string,
    dto: CreateDictionaryItemDto,
  ) {
    const dictionary = await this.findDictionaryOrThrow(
      tenantId,
      dictionaryCode,
    );
    this.assertDictionaryWritable(dictionary, tenantId);

    const [item] = await this.createValuesInternal(dictionary, [
      {
        label: dto.label,
        code: dto.code,
        sortOrder: dto.sortOrder,
        parentId: dto.parentId ?? null,
      },
    ]);

    return item;
  }

  async createItemsBatch(
    tenantId: string,
    dictionaryCode: string,
    values: Array<{
      label: string;
      code?: string;
      sortOrder?: number;
    }>,
  ) {
    const dictionary = await this.findDictionaryOrThrow(
      tenantId,
      dictionaryCode,
    );
    this.assertDictionaryWritable(dictionary, tenantId);

    if (!values.length) {
      throw new BadRequestException('Danh sách giá trị không được rỗng');
    }

    return this.createValuesInternal(dictionary, values);
  }

  async updateItem(
    tenantId: string,
    dictionaryCode: string,
    itemId: string,
    dto: UpdateDictionaryItemDto,
  ) {
    const dictionary = await this.findDictionaryOrThrow(
      tenantId,
      dictionaryCode,
    );
    this.assertDictionaryWritable(dictionary, tenantId);

    const item = await this.itemsRepository.findOne({
      where: { id: itemId, dictionaryId: dictionary.id },
    });
    if (!item) {
      throw new NotFoundException('Mục danh mục không tồn tại');
    }

    if (dto.label !== undefined) item.label = dto.label;
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    await this.itemsRepository.save(item);

    return {
      id: item.id,
      code: item.code,
      label: item.label,
      parentId: item.parentId,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
    };
  }

  async deleteItem(tenantId: string, dictionaryCode: string, itemId: string) {
    const dictionary = await this.findDictionaryOrThrow(
      tenantId,
      dictionaryCode,
    );
    this.assertDictionaryWritable(dictionary, tenantId);

    const item = await this.itemsRepository.findOne({
      where: { id: itemId, dictionaryId: dictionary.id },
    });
    if (!item) {
      throw new NotFoundException('Mục danh mục không tồn tại');
    }

    item.isActive = false;
    await this.itemsRepository.save(item);
    return { deleted: true, id: itemId };
  }

  async listItems(tenantId: string, code: string) {
    const dictionary = await this.findDictionaryOrThrow(tenantId, code);

    const items = await this.itemsRepository.find({
      where: { dictionaryId: dictionary.id, isActive: true },
      order: { sortOrder: 'ASC', label: 'ASC' },
    });

    return items.map((item) => this.toValueSummary(item));
  }

  /** Import Excel: tự thêm giá trị danh mục chưa có (label → code slug). */
  async ensureItemsByLabels(
    tenantId: string,
    dictionaryCode: string,
    labels: string[],
  ): Promise<Array<{ code: string; label: string }>> {
    const dictionary = await this.findDictionaryOrThrow(
      tenantId,
      dictionaryCode,
    );
    this.assertDictionaryWritable(dictionary, tenantId);

    const existing = await this.itemsRepository.find({
      where: { dictionaryId: dictionary.id, isActive: true },
    });

    const toCreate = findMissingCategoryLabels(labels, existing);
    if (toCreate.length === 0) return [];

    const created = await this.createValuesInternal(
      dictionary,
      toCreate.map((label) => ({ label })),
    );

    return created.map((item) => ({ code: item.code, label: item.label }));
  }

  private toValueSummary(item: DictionaryItemEntity): DictionaryValueSummary {
    return {
      id: item.id,
      code: item.code,
      label: item.label,
      parentId: item.parentId,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      metadata: item.metadata,
    };
  }

  private async createValuesInternal(
    dictionary: DictionaryEntity,
    values: Array<{
      label: string;
      code?: string;
      sortOrder?: number;
      parentId?: string | null;
    }>,
  ) {
    const maxOrderRow = await this.itemsRepository
      .createQueryBuilder('i')
      .select('COALESCE(MAX(i.sort_order), 0)', 'max')
      .where('i.dictionary_id = :dictionaryId', { dictionaryId: dictionary.id })
      .getRawOne<{ max: string }>();

    let nextOrder = parseInt(maxOrderRow?.max ?? '0', 10);
    const created: Array<ReturnType<typeof this.toValueSummary>> = [];

    for (const value of values) {
      let code: string;
      const preferred = value.code?.trim();
      if (preferred) {
        const dup = await this.itemsRepository.findOne({
          where: { dictionaryId: dictionary.id, code: preferred },
        });
        if (dup) {
          throw new ConflictException(
            `Mã giá trị đã tồn tại trong danh mục: ${preferred}`,
          );
        }
        code = preferred;
      } else {
        code = await this.resolveUniqueItemCode(dictionary.id, value.label);
      }

      nextOrder += 1;
      const item = await this.itemsRepository.save(
        this.itemsRepository.create({
          dictionaryId: dictionary.id,
          code,
          label: value.label,
          parentId: value.parentId ?? null,
          sortOrder: value.sortOrder ?? nextOrder,
        }),
      );
      created.push(this.toValueSummary(item));
    }

    return created;
  }

  private async resolveUniqueItemCode(
    dictionaryId: string,
    label: string,
    preferredCode?: string,
  ): Promise<string> {
    const base = preferredCode || slugifyLayerCode(label) || 'gia_tri';
    let code = base;
    let suffix = 2;

    while (
      await this.itemsRepository.findOne({
        where: { dictionaryId, code },
      })
    ) {
      code = `${base}_${suffix}`;
      suffix += 1;
    }

    return code;
  }

  private assertDictionaryWritable(
    dictionary: DictionaryEntity,
    tenantId: string,
  ) {
    if (dictionary.tenantId && dictionary.tenantId !== tenantId) {
      throw new BadRequestException('Không có quyền sửa danh mục này');
    }
  }

  private async findDictionaryOrThrow(tenantId: string, code: string) {
    const dictionary = await this.dictionariesRepository
      .createQueryBuilder('d')
      .where('d.code = :code', { code })
      .andWhere('(d.tenant_id IS NULL OR d.tenant_id = :tenantId)', {
        tenantId,
      })
      .getOne();

    if (!dictionary) {
      throw new NotFoundException(`Dictionary không tồn tại: ${code}`);
    }

    return dictionary;
  }
}

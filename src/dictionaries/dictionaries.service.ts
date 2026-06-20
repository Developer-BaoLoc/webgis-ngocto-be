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
  cleanDictionaryText,
  normalizeDictionaryCode,
  normalizeDictionaryName,
} from '../common/utils/dictionary-normalization.util';
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
    const name = cleanDictionaryText(dto.name);
    const initialLabels = new Set<string>();
    for (const value of dto.values ?? []) {
      const normalizedLabel = normalizeDictionaryName(value.label);
      if (initialLabels.has(normalizedLabel)) {
        throw new ConflictException(
          'Giá trị danh mục đã tồn tại trong nhóm này',
        );
      }
      initialLabels.add(normalizedLabel);
    }
    const dictionaries = await this.dictionariesRepository.find({
      where: { tenantId },
    });
    if (
      dictionaries.some(
        (dictionary) =>
          normalizeDictionaryName(dictionary.name) ===
          normalizeDictionaryName(name),
      )
    ) {
      throw new ConflictException('Danh mục đã tồn tại');
    }

    const baseCode = slugifyLayerCode(name);
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
        name,
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

    if (dto.name !== undefined) {
      const name = cleanDictionaryText(dto.name);
      const dictionaries = await this.dictionariesRepository.find({
        where: { tenantId },
      });
      if (
        dictionaries.some(
          (candidate) =>
            candidate.id !== dictionary.id &&
            normalizeDictionaryName(candidate.name) ===
              normalizeDictionaryName(name),
        )
      ) {
        throw new ConflictException('Danh mục đã tồn tại');
      }
      dictionary.name = name;
    }
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

    if (dto.label !== undefined) {
      const label = cleanDictionaryText(dto.label);
      const siblings = await this.itemsRepository.find({
        where: { dictionaryId: dictionary.id },
      });
      if (
        siblings.some(
          (candidate) =>
            candidate.id !== item.id &&
            normalizeDictionaryName(candidate.label) ===
              normalizeDictionaryName(label),
        )
      ) {
        throw new ConflictException(
          'Giá trị danh mục đã tồn tại trong nhóm này',
        );
      }
      item.label = label;
    }
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
      where: { dictionaryId: dictionary.id },
    });

    const requestedLabels = new Set(labels.map(normalizeDictionaryName));
    const reactivated = existing.filter(
      (item) =>
        !item.isActive &&
        requestedLabels.has(normalizeDictionaryName(item.label)),
    );
    if (reactivated.length) {
      for (const item of reactivated) item.isActive = true;
      await this.itemsRepository.save(reactivated);
    }

    const toCreate = findMissingCategoryLabels(labels, existing);
    if (toCreate.length === 0) {
      return reactivated.map((item) => ({
        code: item.code,
        label: item.label,
      }));
    }

    const created = await this.createValuesInternal(
      dictionary,
      toCreate.map((label) => ({ label })),
    );

    return [...reactivated, ...created].map((item) => ({
      code: item.code,
      label: item.label,
    }));
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
    const existingItems = await this.itemsRepository.find({
      where: { dictionaryId: dictionary.id },
    });
    const existingLabels = new Set(
      existingItems.map((item) => normalizeDictionaryName(item.label)),
    );
    const existingCodes = new Set(
      existingItems.map((item) => normalizeDictionaryCode(item.code)),
    );
    const incomingLabels = new Set<string>();
    const incomingCodes = new Set<string>();
    const normalizedValues = values.map((value) => {
      const label = cleanDictionaryText(value.label);
      const labelKey = normalizeDictionaryName(label);
      if (existingLabels.has(labelKey) || incomingLabels.has(labelKey)) {
        throw new ConflictException(
          'Giá trị danh mục đã tồn tại trong nhóm này',
        );
      }
      incomingLabels.add(labelKey);

      const preferred = value.code?.trim()
        ? slugifyLayerCode(value.code)
        : undefined;
      if (preferred) {
        const codeKey = normalizeDictionaryCode(preferred);
        if (existingCodes.has(codeKey) || incomingCodes.has(codeKey)) {
          throw new ConflictException('Giá trị danh mục đã tồn tại');
        }
        incomingCodes.add(codeKey);
      }
      return { ...value, label, code: preferred };
    });

    const maxOrderRow = await this.itemsRepository
      .createQueryBuilder('i')
      .select('COALESCE(MAX(i.sort_order), 0)', 'max')
      .where('i.dictionary_id = :dictionaryId', { dictionaryId: dictionary.id })
      .getRawOne<{ max: string }>();

    let nextOrder = parseInt(maxOrderRow?.max ?? '0', 10);
    const created: Array<ReturnType<typeof this.toValueSummary>> = [];

    for (const value of normalizedValues) {
      let code: string;
      const preferred = value.code;
      if (preferred) {
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

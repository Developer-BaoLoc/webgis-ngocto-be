import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DictionaryEntity,
  DictionaryItemEntity,
} from '../database/entities/dictionary.entity';

@Injectable()
export class DictionariesService {
  constructor(
    @InjectRepository(DictionaryEntity)
    private readonly dictionariesRepository: Repository<DictionaryEntity>,
    @InjectRepository(DictionaryItemEntity)
    private readonly itemsRepository: Repository<DictionaryItemEntity>,
  ) {}

  async list(tenantId: string) {
    const items = await this.dictionariesRepository
      .createQueryBuilder('d')
      .where('d.tenant_id IS NULL OR d.tenant_id = :tenantId', { tenantId })
      .orderBy('d.code', 'ASC')
      .getMany();

    return items.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      isHierarchical: d.isHierarchical,
    }));
  }

  async listItems(tenantId: string, code: string) {
    const dictionary = await this.dictionariesRepository
      .createQueryBuilder('d')
      .where('d.code = :code', { code })
      .andWhere('(d.tenant_id IS NULL OR d.tenant_id = :tenantId)', { tenantId })
      .getOne();

    if (!dictionary) {
      throw new NotFoundException(`Dictionary không tồn tại: ${code}`);
    }

    const items = await this.itemsRepository.find({
      where: { dictionaryId: dictionary.id, isActive: true },
      order: { sortOrder: 'ASC', label: 'ASC' },
    });

    return items.map((item) => ({
      id: item.id,
      code: item.code,
      label: item.label,
      parentId: item.parentId,
      metadata: item.metadata,
    }));
  }
}

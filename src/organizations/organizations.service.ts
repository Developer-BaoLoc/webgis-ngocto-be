import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationEntity } from '../database/entities/organization.entity';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly organizationsRepository: Repository<OrganizationEntity>,
  ) {}

  async listByTenant(tenantId: string) {
    const organizations = await this.organizationsRepository.find({
      where: { tenantId, isActive: true },
      order: { name: 'ASC' },
    });

    return organizations.map((org) => ({
      id: org.id,
      code: org.code,
      name: org.name,
      parentId: org.parentId,
    }));
  }
}

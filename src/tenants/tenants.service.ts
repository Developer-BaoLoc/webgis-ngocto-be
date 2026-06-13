import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity } from '../database/entities/tenant.entity';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantsRepository: Repository<TenantEntity>,
  ) {}

  async getCurrent(tenantId: string) {
    const tenant = await this.tenantsRepository.findOne({
      where: { id: tenantId, isActive: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant không tồn tại');
    }

    return {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      settings: tenant.settings,
    };
  }
}

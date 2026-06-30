import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { Public } from '../common/decorators/public.decorator';
import { RequestId } from '../common/decorators/current-user.decorator';
import { apiResponse } from '../common/utils/api-response.util';

@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  getRoot(@RequestId() requestId?: string) {
    const ward = this.configService.get('ward', { infer: true });
    const project = this.configService.get('project', { infer: true });

    return apiResponse(
      {
        status: 'ok',
        service: project.apiDisplayName,
        ward: `${ward.name}, ${ward.district}, ${ward.province}`,
        docs: '/api/layers',
      },
      { requestId },
    );
  }

  @Get('health')
  async getHealth(@RequestId() requestId?: string) {
    let database: 'ok' | 'error' = 'error';

    try {
      await this.dataSource.query('SELECT 1');
      database = 'ok';
    } catch {
      database = 'error';
    }

    return apiResponse(
      {
        status: database === 'ok' ? 'ok' : 'degraded',
        database,
      },
      { requestId },
    );
  }
}

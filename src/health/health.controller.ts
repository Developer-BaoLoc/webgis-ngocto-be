import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

@Controller()
export class HealthController {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  @Get()
  getRoot() {
    const ward = this.configService.get('ward', { infer: true });

    return {
      status: 'ok',
      service: 'GIS Long Bình API',
      ward: `${ward.name}, ${ward.district}, ${ward.province}`,
      docs: '/api/layers',
    };
  }

  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }
}

import { Controller, Get, Param } from '@nestjs/common';
import { DictionariesService } from './dictionaries.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';

@Controller('dictionaries')
export class DictionariesController {
  constructor(private readonly dictionariesService: DictionariesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId?: string,
  ) {
    const items = await this.dictionariesService.list(user.tenantId);
    return apiResponse(items, { requestId });
  }

  @Get(':code/items')
  async listItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @RequestId() requestId?: string,
  ) {
    const items = await this.dictionariesService.listItems(user.tenantId, code);
    return apiResponse(items, { requestId });
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DictionariesService } from './dictionaries.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';
import {
  CreateDictionaryDto,
  CreateDictionaryItemDto,
  CreateDictionaryItemsBatchDto,
  UpdateDictionaryDto,
  UpdateDictionaryItemDto,
} from './dto/dictionary.dto';

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

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDictionaryDto,
    @RequestId() requestId?: string,
  ) {
    const dictionary = await this.dictionariesService.createDictionary(
      user.tenantId,
      dto,
    );
    return apiResponse(dictionary, { requestId });
  }

  @Get(':code')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Query('includeItems') includeItems?: string,
    @Query('includeInactive') includeInactive?: string,
    @RequestId() requestId?: string,
  ) {
    const dictionary = await this.dictionariesService.getByCode(
      user.tenantId,
      code,
      {
        includeItems: includeItems === 'true',
        includeInactive: includeInactive === 'true',
      },
    );
    return apiResponse(dictionary, { requestId });
  }

  @Patch(':code')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() dto: UpdateDictionaryDto,
    @RequestId() requestId?: string,
  ) {
    const dictionary = await this.dictionariesService.updateDictionary(
      user.tenantId,
      code,
      dto,
    );
    return apiResponse(dictionary, { requestId });
  }

  @Delete(':code')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.dictionariesService.deleteDictionary(
      user.tenantId,
      code,
    );
    return apiResponse(result, { requestId });
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

  @Post(':code/items/batch')
  async createItemsBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() dto: CreateDictionaryItemsBatchDto,
    @RequestId() requestId?: string,
  ) {
    const values = await this.dictionariesService.createItemsBatch(
      user.tenantId,
      code,
      dto.values,
    );
    return apiResponse({ values, itemCount: values.length }, { requestId });
  }

  @Post(':code/items')
  async createItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() dto: CreateDictionaryItemDto,
    @RequestId() requestId?: string,
  ) {
    const item = await this.dictionariesService.createItem(
      user.tenantId,
      code,
      dto,
    );
    return apiResponse(item, { requestId });
  }

  @Patch(':code/items/:itemId')
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateDictionaryItemDto,
    @RequestId() requestId?: string,
  ) {
    const item = await this.dictionariesService.updateItem(
      user.tenantId,
      code,
      itemId,
      dto,
    );
    return apiResponse(item, { requestId });
  }

  @Delete(':code/items/:itemId')
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.dictionariesService.deleteItem(
      user.tenantId,
      code,
      itemId,
    );
    return apiResponse(result, { requestId });
  }
}

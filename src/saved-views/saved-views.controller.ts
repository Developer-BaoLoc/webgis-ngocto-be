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
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';
import { isAdminUser } from '../common/utils/admin-role.util';
import {
  CreateSavedViewDto,
  PreviewSavedViewDto,
  SavedViewListQueryDto,
  UpdateSavedViewDto,
} from './dto/saved-view.dto';
import { SavedViewsService } from './saved-views.service';

@Controller('saved-views')
export class SavedViewsController {
  constructor(private readonly savedViewsService: SavedViewsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SavedViewListQueryDto,
    @RequestId() requestId?: string,
  ) {
    const views = await this.savedViewsService.list(
      user.tenantId,
      user.id,
      isAdminUser(user),
      query.layerId,
    );
    return apiResponse(views, { requestId });
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestId() requestId?: string,
  ) {
    const view = await this.savedViewsService.get(
      user.tenantId,
      id,
      user.id,
      isAdminUser(user),
    );
    return apiResponse(view, { requestId });
  }

  @Post('preview')
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PreviewSavedViewDto,
    @RequestId() requestId?: string,
  ) {
    const result = await this.savedViewsService.preview(user.tenantId, dto);
    return apiResponse(result, { requestId });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavedViewDto,
    @RequestId() requestId?: string,
  ) {
    const view = await this.savedViewsService.create(
      user.tenantId,
      user.id,
      dto,
    );
    return apiResponse(view, { requestId });
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavedViewDto,
    @RequestId() requestId?: string,
  ) {
    const view = await this.savedViewsService.update(
      user.tenantId,
      id,
      user.id,
      isAdminUser(user),
      dto,
    );
    return apiResponse(view, { requestId });
  }

  @Post(':id/duplicate')
  async duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestId() requestId?: string,
  ) {
    const view = await this.savedViewsService.duplicate(
      user.tenantId,
      id,
      user.id,
      isAdminUser(user),
    );
    return apiResponse(view, { requestId });
  }

  @Get(':id/usage')
  async usage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.savedViewsService.usage(user.tenantId, id);
    return apiResponse(result, { requestId });
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.savedViewsService.remove(
      user.tenantId,
      id,
      user.id,
      isAdminUser(user),
    );
    return apiResponse(result, { requestId });
  }
}

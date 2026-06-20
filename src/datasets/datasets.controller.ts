import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';
import { isAdminUser } from '../common/utils/admin-role.util';
import {
  CreateDatasetDto,
  PreviewDatasetDto,
  UpdateDatasetDto,
} from './dto/dataset.dto';
import { DatasetsService } from './datasets.service';

@Controller('datasets')
export class DatasetsController {
  constructor(private readonly service: DatasetsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId?: string,
  ) {
    return apiResponse(
      await this.service.list(user.tenantId, user.id, isAdminUser(user)),
      { requestId },
    );
  }

  @Post('preview')
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PreviewDatasetDto,
    @RequestId() requestId?: string,
  ) {
    return apiResponse(await this.service.preview(user.tenantId, dto), {
      requestId,
    });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDatasetDto,
    @RequestId() requestId?: string,
  ) {
    return apiResponse(await this.service.create(user.tenantId, user.id, dto), {
      requestId,
    });
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestId() requestId?: string,
  ) {
    return apiResponse(
      await this.service.get(user.tenantId, id, user.id, isAdminUser(user)),
      { requestId },
    );
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDatasetDto,
    @RequestId() requestId?: string,
  ) {
    return apiResponse(
      await this.service.update(
        user.tenantId,
        id,
        user.id,
        isAdminUser(user),
        dto,
      ),
      { requestId },
    );
  }

  @Post(':id/duplicate')
  async duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestId() requestId?: string,
  ) {
    return apiResponse(
      await this.service.duplicate(
        user.tenantId,
        id,
        user.id,
        isAdminUser(user),
      ),
      { requestId },
    );
  }

  @Get(':id/usage')
  async usage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestId() requestId?: string,
  ) {
    return apiResponse(await this.service.usage(user.tenantId, id), {
      requestId,
    });
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestId() requestId?: string,
  ) {
    return apiResponse(
      await this.service.remove(user.tenantId, id, user.id, isAdminUser(user)),
      { requestId },
    );
  }
}

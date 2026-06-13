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
import { ConfigService } from '@nestjs/config';
import { MetadataService } from './metadata.service';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';
import { CreateLayerDto } from './dto/create-layer.dto';
import { UpdateLayerDto } from './dto/update-layer.dto';

@Controller('layers')
export class LayersController {
  constructor(
    private readonly metadataService: MetadataService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  async listCatalog(@RequestId() requestId?: string) {
    const tenantId = this.configService.get('tenant.defaultId', { infer: true });
    const layers = await this.metadataService.listLayers(tenantId);

    return apiResponse(
      {
        project: this.metadataService.getProjectInfo(),
        layers,
      },
      { requestId },
    );
  }

  @Get('admin')
  async listAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId?: string,
  ) {
    const layers = await this.metadataService.listLayersAdmin(user.tenantId);
    return apiResponse(layers, { requestId });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLayerDto,
    @RequestId() requestId?: string,
  ) {
    const layer = await this.metadataService.createLayer(
      user.tenantId,
      user.id,
      dto,
    );
    return apiResponse(layer, { requestId });
  }

  @Get('by-code/:code')
  async getByCode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @RequestId() requestId?: string,
  ) {
    const layer = await this.metadataService.getLayerByCode(user.tenantId, code);
    return apiResponse(layer, { requestId });
  }

  @Get(':layerId/schema/draft')
  async getDraftSchema(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @RequestId() requestId?: string,
  ) {
    const schema = await this.metadataService.getDraftSchema(
      user.tenantId,
      layerId,
    );
    return apiResponse(schema, { requestId });
  }

  @Post(':layerId/schema/drafts')
  async createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @RequestId() requestId?: string,
  ) {
    const schema = await this.metadataService.createSchemaDraft(
      user.tenantId,
      layerId,
      user.id,
    );
    return apiResponse(schema, { requestId });
  }

  @Get(':layerId/schema')
  async getSchema(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Query('status') status?: string,
    @RequestId() requestId?: string,
  ) {
    const schema =
      status === 'draft'
        ? await this.metadataService.getDraftSchema(user.tenantId, layerId)
        : await this.metadataService.getPublishedSchema(user.tenantId, layerId);
    return apiResponse(schema, { requestId });
  }

  @Get(':layerId')
  async getLayer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @RequestId() requestId?: string,
  ) {
    const layer = await this.metadataService.getLayerById(user.tenantId, layerId);
    return apiResponse(layer, { requestId });
  }

  @Patch(':layerId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Body() dto: UpdateLayerDto,
    @RequestId() requestId?: string,
  ) {
    const layer = await this.metadataService.updateLayer(
      user.tenantId,
      layerId,
      dto,
    );
    return apiResponse(layer, { requestId });
  }

  @Delete(':layerId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.metadataService.deleteLayer(
      user.tenantId,
      layerId,
    );
    return apiResponse(result, { requestId });
  }
}

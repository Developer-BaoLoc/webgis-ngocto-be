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
import { MetadataService } from './metadata.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';
import { Public } from '../common/decorators/public.decorator';
import { UpdateSchemaDraftDto } from './dto/update-schema-draft.dto';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { ReorderFieldsDto } from './dto/reorder-fields.dto';

@Controller('schema-drafts')
export class SchemaDraftsController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get(':schemaId')
  async getDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('schemaId', ParseUUIDPipe) schemaId: string,
    @RequestId() requestId?: string,
  ) {
    const schema = await this.metadataService.getSchemaDraftById(
      user.tenantId,
      schemaId,
    );
    return apiResponse(schema, { requestId });
  }

  @Patch(':schemaId')
  async updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('schemaId', ParseUUIDPipe) schemaId: string,
    @Body() dto: UpdateSchemaDraftDto,
    @RequestId() requestId?: string,
  ) {
    const schema = await this.metadataService.updateSchemaDraft(
      user.tenantId,
      schemaId,
      dto.changeSummary,
    );
    return apiResponse(schema, { requestId });
  }

  @Post(':schemaId/publish')
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('schemaId', ParseUUIDPipe) schemaId: string,
    @RequestId() requestId?: string,
  ) {
    const schema = await this.metadataService.publishSchema(
      user.tenantId,
      schemaId,
      user.id,
    );
    return apiResponse(schema, { requestId });
  }

  @Post(':schemaId/fields')
  async addField(
    @CurrentUser() user: AuthenticatedUser,
    @Param('schemaId', ParseUUIDPipe) schemaId: string,
    @Body() dto: CreateFieldDto,
    @RequestId() requestId?: string,
  ) {
    const schema = await this.metadataService.addFieldToDraft(
      user.tenantId,
      schemaId,
      user.id,
      dto,
    );
    return apiResponse(schema, { requestId });
  }

  @Patch(':schemaId/fields/reorder')
  async reorderFields(
    @CurrentUser() user: AuthenticatedUser,
    @Param('schemaId', ParseUUIDPipe) schemaId: string,
    @Body() dto: ReorderFieldsDto,
    @RequestId() requestId?: string,
  ) {
    const schema = await this.metadataService.reorderFieldsInDraft(
      user.tenantId,
      schemaId,
      user.id,
      dto.fieldIds,
    );
    return apiResponse(schema, { requestId });
  }

  @Patch(':schemaId/fields/:fieldId')
  async updateField(
    @CurrentUser() user: AuthenticatedUser,
    @Param('schemaId', ParseUUIDPipe) schemaId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() dto: UpdateFieldDto,
    @RequestId() requestId?: string,
  ) {
    const schema = await this.metadataService.updateFieldInDraft(
      user.tenantId,
      schemaId,
      fieldId,
      user.id,
      dto,
    );
    return apiResponse(schema, { requestId });
  }

  @Delete(':schemaId/fields/:fieldId')
  async removeField(
    @CurrentUser() user: AuthenticatedUser,
    @Param('schemaId', ParseUUIDPipe) schemaId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @RequestId() requestId?: string,
  ) {
    const schema = await this.metadataService.deleteFieldFromDraft(
      user.tenantId,
      schemaId,
      fieldId,
      user.id,
    );
    return apiResponse(schema, { requestId });
  }
}

@Controller('metadata')
export class MetadataCatalogController {
  constructor(private readonly metadataService: MetadataService) {}

  @Public()
  @Get('map-view')
  mapView(@RequestId() requestId?: string) {
    return apiResponse(this.metadataService.getMapView(), { requestId });
  }

  @Get('layer-geometry-types')
  listLayerGeometryTypes(@RequestId() requestId?: string) {
    return apiResponse(this.metadataService.getLayerGeometryTypeCatalog(), {
      requestId,
    });
  }

  @Get('layer-icon-upload')
  layerIconUpload(@RequestId() requestId?: string) {
    return apiResponse(this.metadataService.getLayerIconUploadConfig(), {
      requestId,
    });
  }

  @Get('field-types')
  listFieldTypes(@RequestId() requestId?: string) {
    return apiResponse(this.metadataService.getFieldTypeCatalog(), { requestId });
  }

  @Get('field-display-options')
  listFieldDisplayOptions(@RequestId() requestId?: string) {
    return apiResponse(this.metadataService.getFieldDisplaySchemaOptions(), {
      requestId,
    });
  }

  @Get('geometry-kinds')
  listGeometryKinds(@RequestId() requestId?: string) {
    return apiResponse(this.metadataService.getLayerGeometryTypeCatalog(), {
      requestId,
    });
  }
}

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
import { UpdateSchemaDraftDto } from './dto/update-schema-draft.dto';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';

@Controller('schema-drafts')
export class SchemaDraftsController {
  constructor(private readonly metadataService: MetadataService) {}

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
      dto,
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
    );
    return apiResponse(schema, { requestId });
  }
}

@Controller('metadata')
export class MetadataCatalogController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get('field-types')
  listFieldTypes(@RequestId() requestId?: string) {
    return apiResponse(this.metadataService.getFieldTypeCatalog(), { requestId });
  }

  @Get('geometry-kinds')
  listGeometryKinds(@RequestId() requestId?: string) {
    return apiResponse(this.metadataService.getGeometryKindCatalog(), {
      requestId,
    });
  }
}

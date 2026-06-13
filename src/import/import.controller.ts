import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';

@Controller('imports')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('templates')
  async listTemplates(
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId?: string,
  ) {
    const items = await this.importService.listTemplates(user.tenantId);
    return apiResponse(items, { requestId });
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @RequestId() requestId?: string,
  ) {
    const result = await this.importService.upload(
      user.tenantId,
      user.id,
      file,
    );
    return apiResponse(result, { requestId });
  }

  @Post(':importId/preview')
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('importId', ParseUUIDPipe) importId: string,
    @Body() body: { templateCode: string },
    @RequestId() requestId?: string,
  ) {
    const result = await this.importService.preview(
      user.tenantId,
      importId,
      body.templateCode,
    );
    return apiResponse(result, { requestId });
  }

  @Post(':importId/execute')
  async execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('importId', ParseUUIDPipe) importId: string,
    @Body() body: { templateCode: string },
    @RequestId() requestId?: string,
  ) {
    const result = await this.importService.execute(
      user.tenantId,
      user.id,
      importId,
      body.templateCode,
    );
    return apiResponse(result, { requestId });
  }

  @Get(':importId')
  async getImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('importId', ParseUUIDPipe) importId: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.importService.getImport(user.tenantId, importId);
    return apiResponse(result, { requestId });
  }
}

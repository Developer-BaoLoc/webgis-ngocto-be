import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { LayerImportService } from './layer-import.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';

@Controller('layers/:layerId/imports')
export class LayerImportController {
  constructor(private readonly layerImportService: LayerImportService) {}

  @Get('template')
  async downloadTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { buffer, fileName } =
      await this.layerImportService.generateTemplate(user.tenantId, layerId);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.send(buffer);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @UploadedFile() file: Express.Multer.File,
    @RequestId() requestId?: string,
  ) {
    const result = await this.layerImportService.upload(
      user.tenantId,
      layerId,
      file,
    );
    return apiResponse(result, { requestId });
  }

  @Post(':importId/preview')
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Param('importId') importId: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.layerImportService.preview(
      user.tenantId,
      layerId,
      importId,
    );
    return apiResponse(result, { requestId });
  }

  @Post(':importId/execute')
  async execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Param('importId') importId: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.layerImportService.execute(
      user.tenantId,
      layerId,
      user.id,
      importId,
    );
    return apiResponse(result, { requestId });
  }
}

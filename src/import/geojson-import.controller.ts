import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GeoJsonImportService } from './geojson-import.service';
import {
  GeoJsonImportOptionsDto,
  GeoJsonImportPreviewDto,
} from './dto/geojson-import.dto';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';

const uploadDir = path.join(process.cwd(), 'uploads', 'imports');

@ApiTags('GeoJSON import')
@ApiBearerAuth()
@Controller('layers/:layerId/geojson-import')
export class GeoJsonImportController {
  constructor(private readonly geoJsonImportService: GeoJsonImportService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload GeoJSON FeatureCollection for a layer' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '.geojson or .json FeatureCollection',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          fs.mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase() || '.geojson';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
    }),
  )
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @UploadedFile() file: Express.Multer.File,
    @RequestId() requestId?: string,
  ) {
    const result = await this.geoJsonImportService.upload(
      user.tenantId,
      layerId,
      file,
    );
    return apiResponse(result, { requestId });
  }

  @Post('preview')
  @ApiOperation({ summary: 'Preview GeoJSON import without inserting records' })
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Body() dto: GeoJsonImportPreviewDto,
    @RequestId() requestId?: string,
  ) {
    const result = await this.geoJsonImportService.preview(
      user.tenantId,
      layerId,
      dto,
    );
    return apiResponse(result, { requestId });
  }

  @Post('execute')
  @ApiOperation({ summary: 'Execute GeoJSON import with batch insert' })
  async execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Body() dto: GeoJsonImportOptionsDto,
    @RequestId() requestId?: string,
  ) {
    const result = await this.geoJsonImportService.execute(
      user.tenantId,
      layerId,
      user.id,
      dto,
    );
    return apiResponse(result, { requestId });
  }
}

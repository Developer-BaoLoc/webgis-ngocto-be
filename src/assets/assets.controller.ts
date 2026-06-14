import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AssetsService } from './assets.service';
import {
  DEFAULT_MAX_FIELD_FILES,
  DEFAULT_MAX_FIELD_IMAGES,
  MAX_FIELD_FILE_BYTES,
  MAX_FIELD_IMAGE_BYTES,
} from './constants/field-attachment.constants';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('layer-icons/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 512 * 1024 },
    }),
  )
  async uploadLayerIcon(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @RequestId() requestId?: string,
  ) {
    const result = await this.assetsService.uploadLayerIcon(
      user.tenantId,
      user.id,
      file,
    );
    return apiResponse(result, { requestId });
  }

  @Post('field-images/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FIELD_IMAGE_BYTES },
    }),
  )
  async uploadFieldImage(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @RequestId() requestId?: string,
  ) {
    const result = await this.assetsService.uploadFieldImage(
      user.tenantId,
      user.id,
      file,
    );
    return apiResponse(result, { requestId });
  }

  @Post('field-images/upload-batch')
  @UseInterceptors(
    FilesInterceptor('files', DEFAULT_MAX_FIELD_IMAGES, {
      limits: { fileSize: MAX_FIELD_IMAGE_BYTES },
    }),
  )
  async uploadFieldImages(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles() files: Express.Multer.File[],
    @RequestId() requestId?: string,
  ) {
    const result = await this.assetsService.uploadFieldImages(
      user.tenantId,
      user.id,
      files,
    );
    return apiResponse(result, { requestId });
  }

  @Post('field-files/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FIELD_FILE_BYTES },
    }),
  )
  async uploadFieldFile(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @RequestId() requestId?: string,
  ) {
    const result = await this.assetsService.uploadFieldFile(
      user.tenantId,
      user.id,
      file,
    );
    return apiResponse(result, { requestId });
  }

  @Post('field-files/upload-batch')
  @UseInterceptors(
    FilesInterceptor('files', DEFAULT_MAX_FIELD_FILES, {
      limits: { fileSize: MAX_FIELD_FILE_BYTES },
    }),
  )
  async uploadFieldFiles(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles() files: Express.Multer.File[],
    @RequestId() requestId?: string,
  ) {
    const result = await this.assetsService.uploadFieldFiles(
      user.tenantId,
      user.id,
      files,
    );
    return apiResponse(result, { requestId });
  }

  @Public()
  @Get(':attachmentId/file')
  async serveFile(
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const { attachment, stream } =
      await this.assetsService.getAttachmentStream(attachmentId);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  }
}

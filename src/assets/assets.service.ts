import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'minio';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppConfig } from '../config/configuration';
import { AttachmentEntity } from '../database/entities/attachment.entity';
import {
  DEFAULT_MAX_FIELD_FILES,
  DEFAULT_MAX_FIELD_IMAGES,
  FIELD_FILE_MIME_TYPES,
  FIELD_IMAGE_MIME_TYPES,
  MAX_FIELD_FILE_BYTES,
  MAX_FIELD_IMAGE_BYTES,
} from './constants/field-attachment.constants';

const LAYER_ICON_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

const MAX_ICON_BYTES = 512 * 1024;

type UploadKind = 'layer-icon' | 'field-image' | 'field-file';

@Injectable()
export class AssetsService implements OnModuleInit {
  private minioClient: Client | null = null;
  private minioReady = false;
  private readonly localRoot = path.join(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly attachmentsRepository: Repository<AttachmentEntity>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async onModuleInit() {
    const minio = this.configService.get('minio', { infer: true });
    for (const dir of ['layer-icons', 'field-images', 'field-files']) {
      fs.mkdirSync(path.join(this.localRoot, dir), { recursive: true });
    }

    try {
      this.minioClient = new Client({
        endPoint: minio.endpoint,
        port: minio.port,
        useSSL: minio.useSSL,
        accessKey: minio.accessKey,
        secretKey: minio.secretKey,
      });
      const exists = await this.minioClient.bucketExists(minio.bucket);
      if (!exists) {
        await this.minioClient.makeBucket(minio.bucket);
      }
      this.minioReady = true;
    } catch {
      this.minioReady = false;
      this.minioClient = null;
    }
  }

  async uploadLayerIcon(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    return this.uploadAttachment(tenantId, userId, file, 'layer-icon');
  }

  async uploadFieldImage(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    return this.uploadAttachment(tenantId, userId, file, 'field-image');
  }

  async uploadFieldFile(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    return this.uploadAttachment(tenantId, userId, file, 'field-file');
  }

  async uploadFieldImages(
    tenantId: string,
    userId: string,
    files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('Thiếu file ảnh');
    }
    if (files.length > DEFAULT_MAX_FIELD_IMAGES) {
      throw new BadRequestException(
        `Tối đa ${DEFAULT_MAX_FIELD_IMAGES} ảnh mỗi lần upload`,
      );
    }
    const items: Array<{
      attachmentId: string;
      url: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    }> = [];
    for (const file of files) {
      items.push(await this.uploadAttachment(tenantId, userId, file, 'field-image'));
    }
    return { items, count: items.length };
  }

  async uploadFieldFiles(
    tenantId: string,
    userId: string,
    files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('Thiếu file');
    }
    if (files.length > DEFAULT_MAX_FIELD_FILES) {
      throw new BadRequestException(
        `Tối đa ${DEFAULT_MAX_FIELD_FILES} file mỗi lần upload`,
      );
    }
    const items: Array<{
      attachmentId: string;
      url: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    }> = [];
    for (const file of files) {
      items.push(await this.uploadAttachment(tenantId, userId, file, 'field-file'));
    }
    return { items, count: items.length };
  }

  async getAttachment(tenantId: string, attachmentId: string) {
    const attachment = await this.attachmentsRepository.findOne({
      where: { id: attachmentId, tenantId },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment không tồn tại');
    }
    return attachment;
  }

  async getAttachmentStream(attachmentId: string) {
    const attachment = await this.attachmentsRepository.findOne({
      where: { id: attachmentId },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment không tồn tại');
    }

    if (attachment.storageKey.startsWith('local:')) {
      const relative = attachment.storageKey.slice('local:'.length);
      const filePath = path.join(this.localRoot, relative);
      if (!fs.existsSync(filePath)) {
        throw new NotFoundException('File không tồn tại');
      }
      return {
        attachment,
        stream: fs.createReadStream(filePath),
      };
    }

    if (!this.minioClient || !this.minioReady) {
      throw new NotFoundException('File storage không khả dụng');
    }

    const minio = this.configService.get('minio', { infer: true });
    const stream = await this.minioClient.getObject(
      minio.bucket,
      attachment.storageKey,
    );
    return { attachment, stream };
  }

  buildPublicUrl(attachmentId: string) {
    return `/api/assets/${attachmentId}/file`;
  }

  private async uploadAttachment(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
    kind: UploadKind,
  ) {
    if (!file) {
      throw new BadRequestException('Thiếu file');
    }

    const { allowedMime, maxBytes, folder, typeLabel } =
      this.resolveUploadRules(kind);

    if (!allowedMime.has(file.mimetype)) {
      throw new BadRequestException(`${typeLabel} — định dạng không hỗ trợ`);
    }
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `${typeLabel} — tối đa ${Math.round(maxBytes / 1024 / 1024)}MB`,
      );
    }

    const ext = this.extensionFromMime(file.mimetype);
    const objectKey = `${folder}/${tenantId}/${randomUUID()}${ext}`;
    const storageKey = await this.persistFile(objectKey, file);

    const attachment = await this.attachmentsRepository.save(
      this.attachmentsRepository.create({
        tenantId,
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: String(file.size),
        createdBy: userId,
      }),
    );

    return {
      attachmentId: attachment.id,
      url: this.buildPublicUrl(attachment.id),
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: Number(attachment.sizeBytes),
    };
  }

  private resolveUploadRules(kind: UploadKind) {
    switch (kind) {
      case 'layer-icon':
        return {
          allowedMime: LAYER_ICON_MIME_TYPES,
          maxBytes: MAX_ICON_BYTES,
          folder: 'layer-icons',
          typeLabel: 'Icon layer',
        };
      case 'field-image':
        return {
          allowedMime: FIELD_IMAGE_MIME_TYPES,
          maxBytes: MAX_FIELD_IMAGE_BYTES,
          folder: 'field-images',
          typeLabel: 'Ảnh',
        };
      case 'field-file':
        return {
          allowedMime: FIELD_FILE_MIME_TYPES,
          maxBytes: MAX_FIELD_FILE_BYTES,
          folder: 'field-files',
          typeLabel: 'File',
        };
    }
  }

  private async persistFile(
    objectKey: string,
    file: Express.Multer.File,
  ): Promise<string> {
    if (this.minioClient && this.minioReady) {
      const minio = this.configService.get('minio', { infer: true });
      await this.minioClient.putObject(
        minio.bucket,
        objectKey,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype },
      );
      return objectKey;
    }

    const localPath = path.join(this.localRoot, objectKey);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, file.buffer);
    return `local:${objectKey}`;
  }

  private extensionFromMime(mimeType: string) {
    switch (mimeType) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
        return '.jpg';
      case 'image/webp':
        return '.webp';
      case 'image/gif':
        return '.gif';
      case 'image/svg+xml':
        return '.svg';
      case 'application/pdf':
        return '.pdf';
      case 'application/msword':
        return '.doc';
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return '.docx';
      case 'application/vnd.ms-excel':
        return '.xls';
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return '.xlsx';
      case 'application/zip':
      case 'application/x-zip-compressed':
        return '.zip';
      case 'text/plain':
        return '.txt';
      case 'text/csv':
        return '.csv';
      default:
        return '.bin';
    }
  }
}

import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MediaType } from '@prisma/client';

export interface SavedMedia {
  url: string;
  type: MediaType;
  mimeType: string;
  filename: string;
  storedName: string;
  size: number;
}

// 16MB — matches WhatsApp's own video ceiling; generous for marketing images/PDFs too
const MAX_FILE_BYTES = 16 * 1024 * 1024;

const MIME_TO_TYPE = new Map<string, MediaType>([
  ['image/jpeg', MediaType.IMAGE],
  ['image/png', MediaType.IMAGE],
  ['image/webp', MediaType.IMAGE],
  ['image/gif', MediaType.IMAGE],
  ['video/mp4', MediaType.VIDEO],
  ['video/3gpp', MediaType.VIDEO],
  ['application/pdf', MediaType.DOCUMENT],
  ['application/msword', MediaType.DOCUMENT],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', MediaType.DOCUMENT],
  ['application/vnd.ms-excel', MediaType.DOCUMENT],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', MediaType.DOCUMENT],
]);

const EXT_BY_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['video/mp4', '.mp4'],
  ['video/3gpp', '.3gp'],
  ['application/pdf', '.pdf'],
  ['application/msword', '.doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['application/vnd.ms-excel', '.xls'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
]);

const MIME_BY_EXT = new Map<string, string>(
  Array.from(EXT_BY_MIME.entries()).map(([mime, ext]) => [ext, mime]),
);

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly log = new Logger(MediaService.name);
  private readonly uploadDir: string;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService) {
    this.uploadDir = path.resolve(process.cwd(), config.get<string>('UPLOAD_DIR') ?? 'uploads');
    const domain = config.get<string>('DOMAIN');
    const port = config.get<string>('PORT') ?? '3001';
    this.publicBaseUrl =
      domain && domain !== 'yourdomain.com' ? `https://${domain}` : `http://localhost:${port}`;
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.uploadDir, { recursive: true });
    this.log.log(`Media uploads stored at ${this.uploadDir}, served from ${this.publicBaseUrl}/api/media/`);
  }

  static readonly maxFileBytes = MAX_FILE_BYTES;

  async saveUpload(params: { buffer: Buffer; mimeType: string; originalFilename: string }): Promise<SavedMedia> {
    const { buffer, mimeType, originalFilename } = params;

    const type = MIME_TO_TYPE.get(mimeType);
    if (!type) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }
    if (buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException(`File too large — max ${MAX_FILE_BYTES / 1024 / 1024}MB`);
    }
    if (buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty');
    }

    const ext = EXT_BY_MIME.get(mimeType) ?? '';
    const storedName = `${randomUUID()}${ext}`;
    await fs.writeFile(path.join(this.uploadDir, storedName), buffer);

    return {
      url: this.buildPublicUrl(storedName),
      type,
      mimeType,
      filename: originalFilename,
      storedName,
      size: buffer.length,
    };
  }

  buildPublicUrl(storedName: string): string {
    return `${this.publicBaseUrl}/api/media/${storedName}`;
  }

  getLocalPath(storedName: string): string {
    return path.join(this.uploadDir, storedName);
  }

  mimeTypeForStoredName(storedName: string): string | undefined {
    const ext = path.extname(storedName).toLowerCase();
    return MIME_BY_EXT.get(ext);
  }

  /** Extracts the on-disk filename from a public media URL (used to resolve the local path for Baileys sends). */
  storedNameFromUrl(url: string): string | null {
    const match = /\/api\/media\/([a-zA-Z0-9_-]+\.[a-z0-9]{2,5})$/.exec(url);
    return match?.[1] ?? null;
  }

  async readFile(storedName: string): Promise<Buffer> {
    return fs.readFile(this.getLocalPath(storedName));
  }

  /** True if storedName is a safe, generated filename (cuid + known extension) — guards GET /media/:filename against path traversal. */
  isValidStoredName(storedName: string): boolean {
    return /^[a-zA-Z0-9_-]+\.[a-z0-9]{2,5}$/.test(storedName);
  }
}

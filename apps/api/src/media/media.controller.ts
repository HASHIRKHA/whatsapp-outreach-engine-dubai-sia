import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { Public } from '../common/decorators/public.decorator';
import { MediaService, type SavedMedia } from './media.service';

// @fastify/multipart augments FastifyRequest with .file() via ambient module declaration merging,
// which isn't visible from this file's compilation unit — typed explicitly here instead.
interface MultipartRequest extends FastifyRequest {
  file(options?: { limits?: { fileSize?: number } }): Promise<MultipartFile | undefined>;
}

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  async upload(@Req() req: MultipartRequest): Promise<SavedMedia> {
    const file = await req.file({ limits: { fileSize: MediaService.maxFileBytes } });
    if (!file) {
      throw new BadRequestException('No file provided — send multipart/form-data with a "file" field');
    }
    const buffer = await file.toBuffer();
    return this.media.saveUpload({
      buffer,
      mimeType: file.mimetype,
      originalFilename: file.filename,
    });
  }

  // Public: Meta's servers fetch header media by URL with no auth header, and the
  // campaign wizard previews it directly in an <img>/<video> tag.
  @Public()
  @Get(':filename')
  async serve(@Param('filename') filename: string, @Res({ passthrough: true }) res: FastifyReply): Promise<Buffer> {
    if (!this.media.isValidStoredName(filename)) {
      throw new NotFoundException('Not found');
    }
    const mimeType = this.media.mimeTypeForStoredName(filename);
    if (!mimeType) {
      throw new NotFoundException('Not found');
    }
    try {
      const buffer = await this.media.readFile(filename);
      res.header('Content-Type', mimeType);
      res.header('Cache-Control', 'public, max-age=31536000, immutable');
      return buffer;
    } catch {
      throw new NotFoundException('Not found');
    }
  }
}

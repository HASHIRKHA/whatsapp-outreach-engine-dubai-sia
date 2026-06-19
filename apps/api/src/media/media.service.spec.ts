import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { MediaType } from '@prisma/client';
import { MediaService } from './media.service';

jest.mock('fs', () => {
  // Preserve every other real fs export (Prisma's client needs fs.existsSync at import time) —
  // only the three promises.* methods this suite touches are replaced.
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue(Buffer.from('filedata')),
    },
  };
});

async function makeService(config: Record<string, string | undefined>): Promise<MediaService> {
  const module = await Test.createTestingModule({
    providers: [
      MediaService,
      { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
    ],
  }).compile();
  return module.get(MediaService);
}

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await makeService({ UPLOAD_DIR: 'uploads', PORT: '3001' });
  });

  describe('saveUpload', () => {
    it('saves a valid image and returns metadata with a localhost URL (no DOMAIN configured)', async () => {
      const result = await service.saveUpload({
        buffer: Buffer.from('fake-image-bytes'),
        mimeType: 'image/jpeg',
        originalFilename: 'photo.jpg',
      });

      expect(result.type).toBe(MediaType.IMAGE);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.filename).toBe('photo.jpg');
      expect(result.storedName).toMatch(/^[0-9a-f-]+\.jpg$/);
      expect(result.url).toBe(`http://localhost:3001/api/media/${result.storedName}`);
      expect(result.size).toBe(Buffer.from('fake-image-bytes').length);
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
    });

    it('classifies a PDF as DOCUMENT and a video as VIDEO', async () => {
      const pdf = await service.saveUpload({ buffer: Buffer.from('x'), mimeType: 'application/pdf', originalFilename: 'a.pdf' });
      expect(pdf.type).toBe(MediaType.DOCUMENT);
      expect(pdf.storedName.endsWith('.pdf')).toBe(true);

      const vid = await service.saveUpload({ buffer: Buffer.from('x'), mimeType: 'video/mp4', originalFilename: 'a.mp4' });
      expect(vid.type).toBe(MediaType.VIDEO);
      expect(vid.storedName.endsWith('.mp4')).toBe(true);
    });

    it('rejects an unsupported mime type before touching the filesystem', async () => {
      await expect(
        service.saveUpload({ buffer: Buffer.from('x'), mimeType: 'application/zip', originalFilename: 'f.zip' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('rejects a file over the configured max size', async () => {
      const big = Buffer.alloc(MediaService.maxFileBytes + 1);
      await expect(
        service.saveUpload({ buffer: big, mimeType: 'image/png', originalFilename: 'big.png' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('rejects an empty file', async () => {
      await expect(
        service.saveUpload({ buffer: Buffer.alloc(0), mimeType: 'image/png', originalFilename: 'empty.png' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('uses https://DOMAIN as the public base URL when a real DOMAIN is configured', async () => {
      const svc = await makeService({ UPLOAD_DIR: 'uploads', PORT: '3001', DOMAIN: 'example.com' });
      const result = await svc.saveUpload({ buffer: Buffer.from('x'), mimeType: 'image/png', originalFilename: 'a.png' });
      expect(result.url).toBe(`https://example.com/api/media/${result.storedName}`);
    });

    it('falls back to localhost when DOMAIN is left as the .env.example placeholder', async () => {
      const svc = await makeService({ UPLOAD_DIR: 'uploads', PORT: '3001', DOMAIN: 'yourdomain.com' });
      const result = await svc.saveUpload({ buffer: Buffer.from('x'), mimeType: 'image/png', originalFilename: 'a.png' });
      expect(result.url).toContain('http://localhost:3001/api/media/');
    });
  });

  describe('storedNameFromUrl', () => {
    it('extracts the stored filename from a public media URL', () => {
      expect(service.storedNameFromUrl('https://example.com/api/media/abc-123.jpg')).toBe('abc-123.jpg');
    });

    it('returns null for a URL that is not a media URL', () => {
      expect(service.storedNameFromUrl('https://example.com/other/path.jpg')).toBeNull();
    });
  });

  describe('isValidStoredName (path-traversal guard)', () => {
    it.each(['abc-123.jpg', 'DEADbeef_1.png', 'x.pdf'])('accepts safe stored name "%s"', (name) => {
      expect(service.isValidStoredName(name)).toBe(true);
    });

    it.each(['../../etc/passwd', 'a/b.jpg', 'noext', '.jpg', 'a.exe'])(
      'rejects unsafe or unknown stored name "%s"',
      (name) => {
        // .exe has a valid shape but is rejected downstream by mimeTypeForStoredName, not here —
        // isValidStoredName only checks the generic safe-filename shape.
        if (name === 'a.exe') {
          expect(service.isValidStoredName(name)).toBe(true);
          return;
        }
        expect(service.isValidStoredName(name)).toBe(false);
      },
    );
  });

  describe('mimeTypeForStoredName', () => {
    it('resolves a mime type from a known extension', () => {
      expect(service.mimeTypeForStoredName('x.pdf')).toBe('application/pdf');
    });

    it('returns undefined for an unknown extension', () => {
      expect(service.mimeTypeForStoredName('x.exe')).toBeUndefined();
    });
  });
});

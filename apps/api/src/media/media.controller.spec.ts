import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { MediaType } from '@prisma/client';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

interface FakeMultipartRequest {
  file: jest.Mock<Promise<MultipartFile | undefined>, []>;
}

const mockMedia = {
  saveUpload: jest.fn(),
  isValidStoredName: jest.fn(),
  mimeTypeForStoredName: jest.fn(),
  readFile: jest.fn(),
};

function makeRes(): FastifyReply {
  return { header: jest.fn() } as unknown as FastifyReply;
}

describe('MediaController', () => {
  let controller: MediaController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [MediaController, { provide: MediaService, useValue: mockMedia }],
    }).compile();
    controller = module.get(MediaController);
  });

  describe('upload', () => {
    it('saves the uploaded file and returns its metadata', async () => {
      const fakeFile = {
        mimetype: 'image/png',
        filename: 'pic.png',
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('bytes')),
      } as unknown as MultipartFile;
      const req: FakeMultipartRequest = { file: jest.fn().mockResolvedValue(fakeFile) };
      mockMedia.saveUpload.mockResolvedValue({
        url: 'http://localhost:3001/api/media/a.png',
        type: MediaType.IMAGE,
        mimeType: 'image/png',
        filename: 'pic.png',
        storedName: 'a.png',
        size: 5,
      });

      const result = await controller.upload(req as unknown as Parameters<typeof controller.upload>[0]);

      expect(req.file).toHaveBeenCalled();
      expect(mockMedia.saveUpload).toHaveBeenCalledWith({
        buffer: Buffer.from('bytes'),
        mimeType: 'image/png',
        originalFilename: 'pic.png',
      });
      expect(result.storedName).toBe('a.png');
    });

    it('throws BadRequestException when no file is provided', async () => {
      const req: FakeMultipartRequest = { file: jest.fn().mockResolvedValue(undefined) };
      await expect(
        controller.upload(req as unknown as Parameters<typeof controller.upload>[0]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockMedia.saveUpload).not.toHaveBeenCalled();
    });
  });

  describe('serve', () => {
    it('returns the file buffer with Content-Type + immutable cache headers for a valid name', async () => {
      mockMedia.isValidStoredName.mockReturnValue(true);
      mockMedia.mimeTypeForStoredName.mockReturnValue('image/png');
      mockMedia.readFile.mockResolvedValue(Buffer.from('imgdata'));
      const res = makeRes();

      const result = await controller.serve('a.png', res);

      expect(result).toEqual(Buffer.from('imgdata'));
      expect(res.header).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.header).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('immutable'));
    });

    it('404s on a path-traversal / invalid-shape filename without touching disk', async () => {
      mockMedia.isValidStoredName.mockReturnValue(false);
      await expect(controller.serve('../../etc/passwd', makeRes())).rejects.toBeInstanceOf(NotFoundException);
      expect(mockMedia.readFile).not.toHaveBeenCalled();
    });

    it('404s when the extension has no known mime type', async () => {
      mockMedia.isValidStoredName.mockReturnValue(true);
      mockMedia.mimeTypeForStoredName.mockReturnValue(undefined);
      await expect(controller.serve('a.xyz', makeRes())).rejects.toBeInstanceOf(NotFoundException);
      expect(mockMedia.readFile).not.toHaveBeenCalled();
    });

    it('404s when the file is missing on disk', async () => {
      mockMedia.isValidStoredName.mockReturnValue(true);
      mockMedia.mimeTypeForStoredName.mockReturnValue('image/png');
      mockMedia.readFile.mockRejectedValue(new Error('ENOENT'));
      await expect(controller.serve('missing.png', makeRes())).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

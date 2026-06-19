import { Injectable, NotFoundException } from '@nestjs/common';
import type { Template } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import type { CreateTemplateDto } from './dto/create-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTemplateDto): Promise<Template> {
    return this.prisma.template.create({ data: dto });
  }

  async findAll(): Promise<Template[]> {
    return this.prisma.template.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Template> {
    const t = await this.prisma.template.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    return t;
  }

  async update(id: string, dto: Partial<CreateTemplateDto>): Promise<Template> {
    try {
      return await this.prisma.template.update({ where: { id }, data: dto });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') throw new NotFoundException(`Template ${id} not found`);
      throw e;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.template.delete({ where: { id } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') throw new NotFoundException(`Template ${id} not found`);
      throw e;
    }
  }
}

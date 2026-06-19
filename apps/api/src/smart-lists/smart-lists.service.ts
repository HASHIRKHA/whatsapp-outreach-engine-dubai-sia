import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import type { CreateSmartListDto } from './dto/create-smart-list.dto';
import type { ManageContactsDto } from './dto/manage-contacts.dto';

export interface SmartListSummary {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SmartListsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSmartListDto): Promise<SmartListSummary> {
    const list = await this.prisma.smartList.create({
      data: {
        name: dto.name,
        description: dto.description,
        contacts: dto.contactIds?.length
          ? { create: dto.contactIds.map((contactId) => ({ contactId })) }
          : undefined,
      },
      include: { _count: { select: { contacts: true } } },
    });
    return this.toSummary(list);
  }

  async findAll(): Promise<SmartListSummary[]> {
    const lists = await this.prisma.smartList.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { contacts: true } } },
    });
    return lists.map((l) => this.toSummary(l));
  }

  async findOne(id: string): Promise<SmartListSummary & { contactIds: string[] }> {
    let list;
    try {
      list = await this.prisma.smartList.findUniqueOrThrow({
        where: { id },
        include: {
          _count: { select: { contacts: true } },
          contacts: { select: { contactId: true } },
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') throw new NotFoundException(`SmartList ${id} not found`);
      throw e;
    }
    return {
      ...this.toSummary(list),
      contactIds: list.contacts.map((c) => c.contactId),
    };
  }

  async update(id: string, dto: Partial<CreateSmartListDto>): Promise<SmartListSummary> {
    try {
      const list = await this.prisma.smartList.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
        },
        include: { _count: { select: { contacts: true } } },
      });
      return this.toSummary(list);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') throw new NotFoundException(`SmartList ${id} not found`);
      throw e;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.smartList.delete({ where: { id } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') throw new NotFoundException(`SmartList ${id} not found`);
      throw e;
    }
  }

  async addContacts(id: string, dto: ManageContactsDto): Promise<{ added: number }> {
    const list = await this.prisma.smartList.findUnique({ where: { id }, select: { id: true } });
    if (!list) throw new NotFoundException(`SmartList ${id} not found`);
    const result = await this.prisma.smartListContact.createMany({
      data: dto.contactIds.map((contactId) => ({ smartListId: id, contactId })),
      skipDuplicates: true,
    });
    return { added: result.count };
  }

  async removeContacts(id: string, dto: ManageContactsDto): Promise<{ removed: number }> {
    const list = await this.prisma.smartList.findUnique({ where: { id }, select: { id: true } });
    if (!list) throw new NotFoundException(`SmartList ${id} not found`);
    const result = await this.prisma.smartListContact.deleteMany({
      where: { smartListId: id, contactId: { in: dto.contactIds } },
    });
    return { removed: result.count };
  }

  async resolveContactIds(id: string): Promise<string[]> {
    const list = await this.prisma.smartList.findUnique({ where: { id }, select: { id: true } });
    if (!list) throw new NotFoundException(`SmartList ${id} not found`);
    const entries = await this.prisma.smartListContact.findMany({
      where: { smartListId: id },
      select: { contactId: true },
    });
    return entries.map((e) => e.contactId);
  }

  private toSummary(
    list: { id: string; name: string; description: string | null; createdAt: Date; updatedAt: Date; _count: { contacts: number } },
  ): SmartListSummary {
    return {
      id: list.id,
      name: list.name,
      description: list.description,
      contactCount: list._count.contacts,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Reply } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export type ReplyWithContact = Reply & {
  contactPhone: string;
  contactName: string | null;
};

@Injectable()
export class RepliesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params?: {
    sentiment?: string;
    handled?: boolean;
    skip?: number;
    take?: number;
  }): Promise<ReplyWithContact[]> {
    const rows = await this.prisma.reply.findMany({
      where: {
        ...(params?.sentiment ? { sentiment: params.sentiment } : {}),
        ...(params?.handled !== undefined ? { handled: params.handled } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: params?.skip ?? 0,
      take: Math.min(params?.take ?? 50, 200),
    });

    if (!rows.length) return [];

    const contactIds = [...new Set(rows.map((r) => r.contactId))];
    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, phone: true, name: true },
    });
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    return rows.map((r) => {
      const c = contactMap.get(r.contactId);
      return { ...r, contactPhone: c?.phone ?? r.contactId, contactName: c?.name ?? null };
    });
  }

  async patch(id: string, data: { handled?: boolean }): Promise<Reply> {
    const reply = await this.prisma.reply.findUnique({ where: { id } });
    if (!reply) throw new NotFoundException(`Reply ${id} not found`);
    return this.prisma.reply.update({ where: { id }, data });
  }
}

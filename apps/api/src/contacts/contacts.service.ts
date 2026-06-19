import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Contact } from '@prisma/client';
import { LeadTemp } from '@prisma/client';
import { isValidE164 } from '@wa-engine/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ImportContactsDto } from './dto/import-contacts.dto';
import type { ContactItemDto } from './dto/contact-item.dto';

export interface ImportResult {
  imported: number;
  skipped: number;
}

export interface ValidateResult {
  valid: number;
  invalid: number;
}

export interface ContactsPage {
  data: Contact[];
  total: number;
  skip: number;
  take: number;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async createContact(dto: ContactItemDto): Promise<Contact> {
    const vars =
      dto.vars !== undefined ? (dto.vars as Prisma.InputJsonValue) : undefined;
    return this.prisma.contact.upsert({
      where: { phone: dto.phone },
      update: {
        name: dto.name,
        city: dto.city,
        interest: dto.interest,
        notes: dto.notes,
        leadTemp: dto.leadTemp ?? LeadTemp.COLD,
        vars,
        tags: dto.tags ?? [],
      },
      create: {
        phone: dto.phone,
        name: dto.name,
        city: dto.city,
        interest: dto.interest,
        notes: dto.notes,
        leadTemp: dto.leadTemp ?? LeadTemp.COLD,
        vars,
        tags: dto.tags ?? [],
      },
    });
  }

  async updateContact(id: string, dto: Partial<ContactItemDto>): Promise<Contact> {
    const vars =
      dto.vars !== undefined ? (dto.vars as Prisma.InputJsonValue) : undefined;
    try {
      return await this.prisma.contact.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.city !== undefined && { city: dto.city }),
          ...(dto.interest !== undefined && { interest: dto.interest }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.leadTemp !== undefined && { leadTemp: dto.leadTemp }),
          ...(vars !== undefined && { vars }),
          ...(dto.tags !== undefined && { tags: dto.tags }),
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') throw new NotFoundException(`Contact ${id} not found`);
      throw e;
    }
  }

  async importContacts(dto: ImportContactsDto): Promise<ImportResult> {
    const results = await Promise.allSettled(
      dto.contacts.map((item) => {
        const vars =
          item.vars !== undefined
            ? (item.vars as Prisma.InputJsonValue)
            : undefined;
        return this.prisma.contact.upsert({
          where: { phone: item.phone },
          update: {
            name: item.name,
            city: item.city,
            interest: item.interest,
            notes: item.notes,
            leadTemp: item.leadTemp ?? LeadTemp.COLD,
            vars,
            tags: item.tags ?? [],
          },
          create: {
            phone: item.phone,
            name: item.name,
            city: item.city,
            interest: item.interest,
            notes: item.notes,
            leadTemp: item.leadTemp ?? LeadTemp.COLD,
            vars,
            tags: item.tags ?? [],
          },
        });
      }),
    );

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Contact> => r.status === 'fulfilled',
    );
    const skipped = results.filter((r) => r.status === 'rejected').length;

    if (dto.smartListId && fulfilled.length > 0) {
      await this.prisma.smartListContact.createMany({
        data: fulfilled.map((r) => ({ smartListId: dto.smartListId!, contactId: r.value.id })),
        skipDuplicates: true,
      });
    }

    return { imported: fulfilled.length, skipped };
  }

  async listContacts(params?: {
    search?: string;
    tag?: string;
    valid?: boolean;
    leadTemp?: LeadTemp;
    smartListId?: string;
    skip?: number;
    take?: number;
  }): Promise<ContactsPage> {
    const skip = params?.skip ?? 0;
    const take = Math.min(params?.take ?? 50, 200);
    const where: Prisma.ContactWhereInput = {
      ...(params?.search
        ? {
            OR: [
              { phone: { contains: params.search, mode: 'insensitive' } },
              { name: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(params?.tag ? { tags: { has: params.tag } } : {}),
      ...(params?.valid !== undefined ? { valid: params.valid } : {}),
      ...(params?.leadTemp ? { leadTemp: params.leadTemp } : {}),
      ...(params?.smartListId
        ? { smartLists: { some: { smartListId: params.smartListId } } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.contact.count({ where }),
    ]);

    return { data, total, skip, take };
  }

  async validateContacts(): Promise<ValidateResult> {
    const contacts = await this.prisma.contact.findMany({
      select: { id: true, phone: true },
    });

    const validIds: string[] = [];
    const invalidIds: string[] = [];

    for (const c of contacts) {
      if (isValidE164(c.phone)) {
        validIds.push(c.id);
      } else {
        invalidIds.push(c.id);
      }
    }

    if (invalidIds.length) {
      await this.prisma.contact.updateMany({
        where: { id: { in: invalidIds } },
        data: { valid: false },
      });
    }

    if (validIds.length) {
      await this.prisma.contact.updateMany({
        where: { id: { in: validIds } },
        data: { valid: true },
      });
    }

    return { valid: validIds.length, invalid: invalidIds.length };
  }

  async deleteContact(id: string): Promise<void> {
    try {
      await this.prisma.contact.delete({ where: { id } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') throw new NotFoundException(`Contact ${id} not found`);
      throw e;
    }
  }

  async deleteContacts(ids: string[]): Promise<{ deleted: number }> {
    const result = await this.prisma.contact.deleteMany({ where: { id: { in: ids } } });
    return { deleted: result.count };
  }

  async deleteAllContacts(): Promise<{ deleted: number }> {
    const result = await this.prisma.contact.deleteMany({});
    return { deleted: result.count };
  }

  async upsertFromWhatsApp(
    contacts: { phone: string; name?: string }[],
  ): Promise<{ imported: number }> {
    let imported = 0;
    for (const c of contacts) {
      if (!c.phone || !isValidE164(c.phone)) continue;
      try {
        await this.prisma.contact.upsert({
          where: { phone: c.phone },
          update: { name: c.name ?? undefined },
          create: { phone: c.phone, name: c.name ?? undefined, leadTemp: LeadTemp.COLD, tags: [] },
        });
        imported++;
      } catch {
        // skip duplicates / invalid
      }
    }
    return { imported };
  }
}

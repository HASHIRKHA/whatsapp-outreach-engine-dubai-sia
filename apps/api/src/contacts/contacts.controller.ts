import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { Contact } from '@prisma/client';
import { LeadTemp } from '@prisma/client';
import { ContactsService } from './contacts.service';
import { ContactItemDto } from './dto/contact-item.dto';
import { ImportContactsDto } from './dto/import-contacts.dto';
import { BulkDeleteDto } from './dto/bulk-delete.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import type { ContactsPage, ImportResult, ValidateResult } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Post()
  async create(@Body() dto: ContactItemDto): Promise<Contact> {
    return this.contacts.createContact(dto);
  }

  @Post('import')
  async import(@Body() dto: ImportContactsDto): Promise<ImportResult> {
    return this.contacts.importContacts(dto);
  }

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('valid') valid?: string,
    @Query('leadTemp') leadTemp?: string,
    @Query('smartListId') smartListId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ): Promise<ContactsPage> {
    return this.contacts.listContacts({
      search,
      tag,
      valid: valid === 'true' ? true : valid === 'false' ? false : undefined,
      leadTemp: Object.values(LeadTemp).includes(leadTemp as LeadTemp)
        ? (leadTemp as LeadTemp)
        : undefined,
      smartListId: smartListId || undefined,
      skip: skip ? (Number.isNaN(parseInt(skip, 10)) ? 0 : parseInt(skip, 10)) : undefined,
      take: take ? (Number.isNaN(parseInt(take, 10)) ? 50 : parseInt(take, 10)) : undefined,
    });
  }

  @Post('validate')
  @HttpCode(200)
  async validate(): Promise<ValidateResult> {
    return this.contacts.validateContacts();
  }

  @Post('bulk-delete')
  @HttpCode(200)
  async bulkDelete(@Body() dto: BulkDeleteDto): Promise<{ deleted: number }> {
    return this.contacts.deleteContacts(dto.ids);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<Contact> {
    return this.contacts.updateContact(id, dto);
  }

  // Must be declared BEFORE @Delete(':id') — Fastify matches literal "all" against
  // the parametric route first if the literal route is registered after it.
  @Delete('all')
  @HttpCode(200)
  async deleteAll(): Promise<{ deleted: number }> {
    return this.contacts.deleteAllContacts();
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    return this.contacts.deleteContact(id);
  }
}

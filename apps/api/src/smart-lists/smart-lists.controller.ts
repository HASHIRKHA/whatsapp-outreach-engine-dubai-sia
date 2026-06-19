import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { SmartListsService } from './smart-lists.service';
import { CreateSmartListDto } from './dto/create-smart-list.dto';
import { ManageContactsDto } from './dto/manage-contacts.dto';

// contactIds intentionally omitted — use POST/DELETE /:id/contacts for membership changes
class UpdateSmartListDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('smart-lists')
export class SmartListsController {
  constructor(private readonly smartLists: SmartListsService) {}

  @Post()
  create(@Body() dto: CreateSmartListDto) {
    return this.smartLists.create(dto);
  }

  @Get()
  findAll() {
    return this.smartLists.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.smartLists.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSmartListDto) {
    return this.smartLists.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.smartLists.delete(id);
  }

  @Post(':id/contacts')
  addContacts(@Param('id') id: string, @Body() dto: ManageContactsDto) {
    return this.smartLists.addContacts(id, dto);
  }

  @Delete(':id/contacts')
  @HttpCode(200)
  removeContacts(@Param('id') id: string, @Body() dto: ManageContactsDto) {
    return this.smartLists.removeContacts(id, dto);
  }
}

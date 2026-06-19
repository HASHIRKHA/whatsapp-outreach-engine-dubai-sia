import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { Template } from '@prisma/client';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';

class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  body?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post()
  async create(@Body() dto: CreateTemplateDto): Promise<Template> {
    return this.templates.create(dto);
  }

  @Get()
  async findAll(): Promise<Template[]> {
    return this.templates.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Template> {
    return this.templates.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<Template> {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    return this.templates.delete(id);
  }
}

import { IsArray, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { LeadTemp } from '@prisma/client';

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  interest?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(LeadTemp)
  leadTemp?: LeadTemp;

  @IsOptional()
  @IsObject()
  vars?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

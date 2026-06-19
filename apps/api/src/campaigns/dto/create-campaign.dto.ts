import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { MediaType, SessionMode } from '@prisma/client';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(SessionMode)
  mode!: SessionMode;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  activeFrom?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  activeTo?: number;

  @IsOptional()
  @IsUrl({ require_tld: false }) // require_tld: false allows http://localhost in dev
  mediaUrl?: string;

  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;

  @IsOptional()
  @IsString()
  mediaMimeType?: string;

  @IsOptional()
  @IsString()
  mediaFilename?: string;
}

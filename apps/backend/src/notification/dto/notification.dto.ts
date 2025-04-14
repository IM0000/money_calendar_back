import { ContentType, NotificationMethod } from '@prisma/client';
import {
  IsNumber,
  IsEnum,
  IsString,
  IsOptional,
  IsBoolean,
  IsEmail,
} from 'class-validator';

export class CreateNotificationDto {
  @IsEnum(ContentType)
  contentType: ContentType;

  @IsNumber()
  contentId: number;

  @IsNumber()
  userId: number;
}

export class UpdateUserNotificationSettingsDto {
  @IsBoolean()
  @IsOptional()
  emailEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  pushEnabled?: boolean;

  @IsString()
  @IsOptional()
  preferredMethod?: string;
}

export class SendNotificationEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  subject: string;

  @IsString()
  content: string;
}

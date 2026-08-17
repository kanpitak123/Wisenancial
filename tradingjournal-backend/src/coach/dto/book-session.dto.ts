import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class BookSessionDto {
  @IsString()
  coachId!: string;

  @IsISO8601()
  slot!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  topic?: string;
}

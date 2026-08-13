import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ImportTradesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  broker!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  accountId!: string;
}

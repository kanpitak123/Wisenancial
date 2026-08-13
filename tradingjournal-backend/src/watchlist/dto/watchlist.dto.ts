import {
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class AddWatchlistDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  symbol!: string;
}

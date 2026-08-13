import { PortfolioType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class ListPortfoliosQueryDto {
  @IsOptional()
  @IsEnum(PortfolioType)
  type?: PortfolioType;
}

export class CreatePortfolioDto {
  @IsString()
  @IsNotEmpty({ message: 'กรุณาตั้งชื่อพอร์ต' })
  @MaxLength(100)
  name!: string;

  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'เงินทุนเริ่มต้นต้องเป็นตัวเลขไม่เกิน 2 ตำแหน่ง' },
  )
  @Min(0, { message: 'เงินทุนเริ่มต้นต้องไม่น้อยกว่า 0' })
  initial_balance!: number;

  @IsOptional()
  @IsEnum(PortfolioType)
  portfolio_type?: PortfolioType;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3,10}$/, {
    message: 'currency ต้องเป็นตัวอักษรภาษาอังกฤษพิมพ์ใหญ่ 3-10 ตัว',
  })
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color ต้องอยู่ในรูปแบบ HEX เช่น #58C5C0',
  })
  color?: string;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class UpdatePortfolioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'ชื่อพอร์ตห้ามเป็นค่าว่าง' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'เงินทุนเริ่มต้นต้องเป็นตัวเลขไม่เกิน 2 ตำแหน่ง' },
  )
  @Min(0, { message: 'เงินทุนเริ่มต้นต้องไม่น้อยกว่า 0' })
  initial_balance?: number;

  @IsOptional()
  @IsEnum(PortfolioType)
  portfolio_type?: PortfolioType;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3,10}$/, {
    message: 'currency ต้องเป็นตัวอักษรภาษาอังกฤษพิมพ์ใหญ่ 3-10 ตัว',
  })
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color ต้องอยู่ในรูปแบบ HEX เช่น #58C5C0',
  })
  color?: string | null;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

export class BuyStockDto {
  @IsString() @MaxLength(50) stock_symbol!: string;
  @IsOptional() @IsString() @MaxLength(100) stock_name?: string;
  @IsNumber() @IsPositive() shares_count!: number;
  @IsNumber() @IsPositive() purchase_price!: number;
  @IsOptional() @IsNumber() @Min(0) fees?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsDateString() purchase_date?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() @MaxLength(100) strategy?: string;
  @IsOptional() @IsString() @MaxLength(50) emotion?: string;

  // คอลัมน์เหล่านี้มีอยู่ใน stock_purchases อยู่แล้ว แค่ยังไม่เคยเปิดให้ส่งเข้ามา
  // (หน้า StockRecord ฝั่ง frontend ใช้ตั้งเป้าหมาย/จุดตัดขาดทุนและจัดกลุ่มด้วยโฟลเดอร์)
  @IsOptional() @IsNumber() @IsPositive() target_price?: number;
  @IsOptional() @IsNumber() @IsPositive() stop_loss?: number;
  @IsOptional() @IsString() @MaxLength(50) folder_name?: string;
  @IsOptional() @IsString() purchase_reason?: string;
  @IsOptional() @IsString() expectation?: string;
}

import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsInt,
  Min,
} from 'class-validator';

/**
 * ภาษาที่อยากให้ AI ตอบกลับมา — หน้าบ้านส่งมาจาก LanguageStore ตัวเดียวกับที่ตั้งภาษา UI
 *
 * optional ทุกที่โดยตั้งใจ: client เก่าที่ยังไม่ส่งมาต้องไม่พัง (ValidationPipe ตั้ง
 * forbidNonWhitelisted ไว้ ถ้าไม่ประกาศไว้ใน DTO การส่งมาจะกลายเป็น 400 แทน)
 * ฝั่ง service จะ resolve เป็นค่าเริ่มต้น 'th' ให้เอง
 */
export class AnalyzeChartDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  portfolioId?: number;

  @IsOptional()
  @IsIn(['th', 'en'])
  outputLanguage?: 'th' | 'en';

  @IsIn(['TRADER', 'INVESTOR'])
  portfolioType!: 'TRADER' | 'INVESTOR';

  @IsString()
  chartType!: string;

  data!: unknown;

  @IsOptional()
  @IsObject()
  extraContext?: Record<string, unknown>;

  /** Ignored: the model is fixed per feature. Accepted only so a stale client is not 400'd. */
  @IsOptional()
  @IsString()
  modelId?: string;

  /** true = free rule-based insight; anything else runs the AI (flat credits). */
  @IsOptional()
  @IsBoolean()
  useRuleBased?: boolean;
}

export class ReviewPortfolioDto {
  /** Ignored: the model is fixed per feature. Accepted only so a stale client is not 400'd. */
  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsIn(['th', 'en'])
  outputLanguage?: 'th' | 'en';

  @IsOptional()
  @IsArray()
  items?: unknown[];

  @IsOptional()
  @IsObject()
  analytics?: Record<string, unknown>;
}

export class EnrichNewsDto {
  @IsString()
  headline!: string;

  @IsString()
  summary!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(['en', 'th'])
  language?: 'en' | 'th';

  /** Ignored: the model is fixed per feature. Accepted only so a stale client is not 400'd. */
  @IsOptional()
  @IsString()
  modelId?: string;
}

export class RiskAnalysisDto {
  @IsArray()
  holdings!: Array<{
    symbol: string;
    quantity: number;
    weight?: number;
    beta?: number | null;
    debtToEquity?: number | null;
    peRatio?: number | null;
    currentPrice?: number;
  }>;

  /** Ignored: the model is fixed per feature. Accepted only so a stale client is not 400'd. */
  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsIn(['th', 'en'])
  outputLanguage?: 'th' | 'en';
}

export class QuizDto {
  @IsString()
  lessonTitle!: string;

  @IsString()
  lessonDescription!: string;

  @IsOptional()
  @IsIn(['th', 'en'])
  outputLanguage?: 'th' | 'en';
}

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

export class AnalyzeChartDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  portfolioId?: number;

  @IsIn(['TRADER', 'INVESTOR'])
  portfolioType!: 'TRADER' | 'INVESTOR';

  @IsString()
  chartType!: string;

  data!: unknown;

  @IsOptional()
  @IsObject()
  extraContext?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsBoolean()
  useRuleBased?: boolean;
}

export class ReviewPortfolioDto {
  @IsString()
  modelId!: string;

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

  @IsString()
  modelId!: string;
}

export class QuizDto {
  @IsString()
  lessonTitle!: string;

  @IsString()
  lessonDescription!: string;
}

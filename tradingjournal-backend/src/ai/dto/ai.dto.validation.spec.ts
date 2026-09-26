import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  AnalyzeChartDto,
  EnrichNewsDto,
  QuizDto,
  ReviewPortfolioDto,
  RiskAnalysisDto,
} from './ai.dto';

/**
 * The AI request bodies exactly as the frontend sends them, through the same ValidationPipe
 * settings as main.ts (whitelist + forbidNonWhitelisted).
 *
 * POST /ai/analyze answered 400 "property data should not exist" for every request because
 * `data` had no validator decorator, so the pipe treated it as a property that is not in the
 * DTO. Nothing exercised the DTOs through the pipe, so it went unnoticed.
 */

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validate = <T>(metatype: new () => T, body: unknown): Promise<T> =>
  pipe.transform(body, { type: 'body', metatype }) as Promise<T>;

const rejection = async (
  metatype: new () => unknown,
  body: unknown,
): Promise<string[]> => {
  try {
    await validate(metatype, body);
  } catch (error) {
    const response = (error as BadRequestException).getResponse() as {
      message: string[];
    };
    return response.message;
  }
  return [];
};

describe('POST /ai/analyze body (AnalyzeChartDto)', () => {
  const chart = {
    portfolioType: 'TRADER',
    chartType: 'monthly_growth',
    data: [{ month: '2026-08', pnl: 120 }],
    outputLanguage: 'th',
  };

  it('accepts what the frontend sends by default (free rule-based insight)', async () => {
    await expect(
      validate(AnalyzeChartDto, { ...chart, portfolioId: 15 }),
    ).resolves.toMatchObject({ chartType: 'monthly_growth' });
  });

  it('accepts the explicit AI click (useAi: true)', async () => {
    const dto = await validate(AnalyzeChartDto, { ...chart, useAi: true });

    expect(dto.useAi).toBe(true);
  });

  it.each([
    ['an array', [{ a: 1 }]],
    ['an object', { winRate: 61.5 }],
    ['a string', 'x'],
    ['a number', 3],
  ])('accepts chart data that is %s', async (_name, data) => {
    await expect(
      validate(AnalyzeChartDto, { ...chart, data }),
    ).resolves.toBeDefined();
  });

  it('accepts extraContext and stale client fields (modelId, useRuleBased)', async () => {
    await expect(
      validate(AnalyzeChartDto, {
        ...chart,
        extraContext: { period: '30d' },
        modelId: 'groq-llama3',
        useRuleBased: false,
      }),
    ).resolves.toBeDefined();
  });

  it('still requires the chart data', async () => {
    const { data: _omitted, ...withoutData } = chart;
    void _omitted;

    expect((await rejection(AnalyzeChartDto, withoutData)).join()).toMatch(
      /data/,
    );
  });

  it('still rejects a field that is not part of the DTO', async () => {
    expect(
      await rejection(AnalyzeChartDto, { ...chart, surprise: 1 }),
    ).toContain('property surprise should not exist');
  });

  it('rejects a non-boolean useAi (it must be exactly true to run the AI)', async () => {
    expect(
      (await rejection(AnalyzeChartDto, { ...chart, useAi: 'true' })).join(),
    ).toMatch(/useAi/);
  });
});

describe('the other AI request bodies', () => {
  it('portfolio review: language only, model ignored', async () => {
    await expect(
      validate(ReviewPortfolioDto, { outputLanguage: 'th' }),
    ).resolves.toBeDefined();
    await expect(
      validate(ReviewPortfolioDto, { outputLanguage: 'en', modelId: 'x' }),
    ).resolves.toBeDefined();
  });

  it('risk analysis: holdings + language', async () => {
    await expect(
      validate(RiskAnalysisDto, {
        holdings: [
          {
            symbol: 'AAPL',
            quantity: 6,
            weight: 0.6,
            currentPrice: 314.67,
            peRatio: 36.1,
            beta: 1.09,
            debtToEquity: 0.784,
          },
        ],
        outputLanguage: 'th',
      }),
    ).resolves.toBeDefined();
  });

  it('quiz and news enrichment', async () => {
    await expect(
      validate(QuizDto, {
        lessonTitle: 'T',
        lessonDescription: 'D',
        outputLanguage: 'en',
      }),
    ).resolves.toBeDefined();
    await expect(
      validate(EnrichNewsDto, {
        headline: 'H',
        summary: 'S',
        language: 'en',
      }),
    ).resolves.toBeDefined();
  });
});

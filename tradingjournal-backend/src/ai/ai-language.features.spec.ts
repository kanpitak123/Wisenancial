import * as fs from 'fs';
import * as path from 'path';
import type { GrowthCandidate } from '../stocks/stocks.service';
import { AiCompatibilityController } from './ai-compatibility.controller';
import { AiEducationService } from './ai-education.service';
import { AiRecommendationService } from './ai-recommendation.service';
import { AiRiskService } from './ai-risk.service';
import { AiService } from './ai.service';
import { NewsClassifierService } from './news-classifier.service';

/**
 * Every AI feature must (1) state the UI language in the system prompt, (2) restate it in
 * the user message, and (3) ask the manager to verify the answer's language. Runs each
 * feature for th and en against a mocked manager.
 *
 * A live Portfolio Review once came back in Korean for a Thai UI; the model saw a big
 * data payload and the one-line system instruction was not enough on its own.
 */

type Lang = 'th' | 'en';
const NAME: Record<Lang, string> = { th: 'Thai', en: 'English' };
const OTHER: Record<Lang, string> = { th: 'English', en: 'Thai' };

interface Captured {
  systemPrompt?: string;
  prompt: string;
  expectedLanguage?: string;
  languageProbe?: (data: never) => unknown;
}

/** A manager double that records the request and answers with `data`. */
function fakeManager(data: unknown, models = [{ id: 'claude-fast' }]) {
  const captured: { request?: Captured } = {};
  const answer = (request: Captured) => {
    captured.request = request;
    return Promise.resolve({
      data,
      model: 'claude-fast',
      usage: { inputTokens: 1, outputTokens: 1 },
      creditsCharged: 1,
      creditsRemaining: 9,
    });
  };

  return {
    captured,
    manager: {
      executeAiRequest: jest.fn(answer),
      executeSystemAiRequest: jest.fn(answer),
      listAvailableModels: () => models,
    },
  };
}

function expectLanguageEverywhere(captured: Captured | undefined, lang: Lang) {
  expect(captured).toBeDefined();
  const request = captured as Captured;

  // (1) system prompt
  expect(request.systemPrompt).toContain(`Respond only in ${NAME[lang]}`);
  expect(request.systemPrompt).not.toContain(`Respond only in ${OTHER[lang]}`);
  // (2) restated in the user message
  expect(request.prompt).toContain(`Respond only in ${NAME[lang]}.`);
  expect(request.prompt).not.toContain(`Respond only in ${OTHER[lang]}.`);
  // (3) verified by the manager
  expect(request.expectedLanguage).toBe(lang);
}

const holdings = [{ symbol: 'AAPL', quantity: 10, weight: 1 }];

describe.each<Lang>(['th', 'en'])('AI language instruction — %s', (lang) => {
  it('chart insight', async () => {
    const { manager, captured } = fakeManager({ insight: 'ok' });
    const service = new AiService(
      {} as never,
      manager as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.analyzeChart(1, {
      portfolioType: 'TRADER',
      chartType: 'equity_curve',
      data: {},
      modelId: 'claude-fast',
      outputLanguage: lang,
    });

    expectLanguageEverywhere(captured.request, lang);
    // the probe narrows the check to the insight text
    expect(captured.request?.languageProbe?.({ insight: 'x' } as never)).toBe(
      'x',
    );
  });

  it.each(['TRADER', 'INVESTOR'] as const)(
    'portfolio review (%s)',
    async (portfolioType) => {
      const { manager, captured } = fakeManager({ summary: 'ok' });
      const service = new AiService(
        {
          portfolios: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ portfolio_type: portfolioType }),
          },
        } as never,
        manager as never,
        {} as never,
        { overview: jest.fn().mockResolvedValue({}) } as never,
        { getHoldings: jest.fn().mockResolvedValue([]) } as never,
      );

      await service.reviewPortfolio(
        1,
        5,
        'claude-fast',
        undefined,
        undefined,
        lang,
      );

      expectLanguageEverywhere(captured.request, lang);
    },
  );

  it('risk analysis', async () => {
    const { manager, captured } = fakeManager({
      riskLevel: 'Moderate',
      riskScore: 50,
      analysisSummary: 'ok',
      keyRiskFactors: ['a'],
    });

    await new AiRiskService(manager as never).analyze(
      1,
      holdings,
      'claude-fast',
      lang,
    );

    expectLanguageEverywhere(captured.request, lang);
  });

  it('education quiz', async () => {
    const question = {
      question: 'q',
      options: ['a', 'b', 'c', 'd'],
      correctAnswer: 1,
      explanation: 'e',
    };
    const { manager, captured } = fakeManager({
      questions: [question, question],
    });

    await new AiEducationService(manager as never).generateQuiz(
      1,
      'Lesson',
      'About lessons',
      lang,
    );

    expectLanguageEverywhere(captured.request, lang);
  });

  it('growth recommendations (AI Picks)', async () => {
    const candidates: GrowthCandidate[] = [
      'TSLA',
      'NVDA',
      'AAPL',
      'PTT.BK',
      'CPALL.BK',
      'DELTA.BK',
    ].map((symbol) => ({
      symbol,
      name: `${symbol} Inc.`,
      sector: 'Technology',
      exchange: 'NASDAQ',
      asOf: '2026-06-30',
      metrics: {
        revenueGrowthYoY: 0.3,
        netMargin: 0.2,
        peRatio: 30,
        currentPrice: 100,
        avgDailyVolume3M: 1_000_000,
      },
    }));
    const pick = {
      symbol: 'TSLA',
      name: 'Tesla, Inc.',
      sector: 'Automotive',
      reasoning: {
        growth: 'g',
        profit: 'p',
        customerBase: 'c',
        liquidity: 'l',
      },
      aiSummary: 's',
    };
    const { manager, captured } = fakeManager([pick]);

    await new AiRecommendationService(
      manager as never,
      {
        getGrowthCandidates: jest.fn().mockResolvedValue(candidates),
      } as never,
    ).getGrowthRecommendations(1, lang);

    expectLanguageEverywhere(captured.request, lang);
  });

  it('news enrichment, user-triggered', async () => {
    const { manager, captured } = fakeManager({ aiSummary: 's' });

    await new AiService(
      {} as never,
      manager as never,
      {} as never,
      {} as never,
      {} as never,
    ).enrichUserNewsArticle(1, 'claude-fast', 'Headline', 'Summary', '', lang);

    expectLanguageEverywhere(captured.request, lang);
    // only the fields that follow the article language are checked
    expect(
      captured.request?.languageProbe?.({
        aiSummary: 'a',
        stockImpactAnalysis: 'b',
        aiTranslatedSummary: 'ไทย',
      } as never),
    ).toEqual(['a', 'b']);
  });

  it('news enrichment, system/cron', async () => {
    const { manager, captured } = fakeManager({ aiSummary: 's' });

    await new AiService(
      {} as never,
      manager as never,
      {} as never,
      {} as never,
      {} as never,
    ).enrichNewsArticle('Headline', 'Summary', '', lang);

    expectLanguageEverywhere(captured.request, lang);
  });

  it('news classifier (first pass)', async () => {
    const { manager, captured } = fakeManager({});

    // the answer is invalid on purpose; only the request matters here
    await new NewsClassifierService(manager as never)
      .classify({
        headline: 'Headline',
        summary: 'Summary',
        content: 'Content',
        language: lang,
      })
      .catch(() => undefined);

    expectLanguageEverywhere(captured.request, lang);
  });

  it('legacy /ai-advisor/analyze', async () => {
    const { manager, captured } = fakeManager({});
    const controller = new AiCompatibilityController(
      manager as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await controller.analyzeLegacyPortfolio(
      { user: { userId: 1 } },
      { holdings: [], modelId: 'claude-fast', outputLanguage: lang },
    );

    expectLanguageEverywhere(captured.request, lang);
  });
});

describe('AI language instruction — defaults', () => {
  it('no locale sent: Thai (matches the frontend default), still verified', async () => {
    const { manager, captured } = fakeManager({
      riskLevel: 'Moderate',
      riskScore: 50,
      analysisSummary: 'ok',
      keyRiskFactors: ['a'],
    });

    await new AiRiskService(manager as never).analyze(
      1,
      holdings,
      'claude-fast',
    );

    expectLanguageEverywhere(captured.request, 'th');
  });

  it('an unknown locale falls back to Thai instead of being passed to the model', async () => {
    const { manager, captured } = fakeManager({
      riskLevel: 'Moderate',
      riskScore: 50,
      analysisSummary: 'ok',
      keyRiskFactors: ['a'],
    });

    await new AiRiskService(manager as never).analyze(
      1,
      holdings,
      'claude-fast',
      'ko',
    );

    expectLanguageEverywhere(captured.request, 'th');
  });
});

/**
 * Structural guard: any file that calls the manager to run a prompt must carry the
 * language rule and ask for verification. A new AI feature that forgets fails here even
 * before anyone writes a behavioural test for it.
 */
describe('every AI prompt builder carries the language instruction (source guard)', () => {
  const root = path.resolve(__dirname, '..');
  const scanned = ['ai', 'news'];

  /** Calls the manager but is not a prompt builder of its own. */
  const EXEMPT: Record<string, string> = {
    'ai/ai-manager.service.ts': 'the manager itself',
    'ai/news-guardrails.executor.ts':
      'pass-through for the vendored guardrails module, which owns its prompt and validates its own envelope',
  };

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // vendored module: its prompts are validated by its own golden tests
        return entry.name === 'news-analysis' ? [] : sourceFiles(full);
      }
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
        ? [full]
        : [];
    });
  }

  const callers = scanned
    .flatMap((dir) => sourceFiles(path.join(root, dir)))
    .map((file) => ({
      file: path.relative(root, file).split(path.sep).join('/'),
      source: fs.readFileSync(file, 'utf8'),
    }))
    .filter(({ source }) => /\.execute(System)?AiRequest\b/.test(source))
    .filter(({ file }) => !(file in EXEMPT));

  it('finds the known callers (the scan itself works)', () => {
    const files = callers.map(({ file }) => file);
    expect(files).toEqual(
      expect.arrayContaining([
        'ai/ai.service.ts',
        'ai/ai-risk.service.ts',
        'ai/ai-education.service.ts',
        'ai/ai-recommendation.service.ts',
        'ai/ai-compatibility.controller.ts',
        'ai/news-classifier.service.ts',
      ]),
    );
  });

  it.each(callers.map(({ file, source }) => [file, source]))(
    '%s states the language and asks for verification',
    (_file, source) => {
      expect(source).toMatch(
        /outputLanguageRule|newsLanguageRule|buildNewsClassificationSystemPrompt/,
      );
      expect(source).toMatch(/withLanguage|buildNewsClassificationPrompt/);
      expect(source).toContain('expectedLanguage');
    },
  );
});

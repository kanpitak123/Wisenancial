import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AI_MODEL_REGISTRY,
  AI_SYSTEM_FALLBACK_ORDER,
  MIN_CREDITS_PER_CALL,
  MIN_CREDIT_BALANCE,
  calculateCredits,
  getModelPricing,
  isAiModelId,
  listAiModels,
  type AiModelId,
  type AiModelPricing,
  type AiProviderId,
} from './ai.models';
import { loadEnabledAiProviders } from './ai.config';
import {
  assessNumericGrounding,
  groundingCorrection,
  UngroundedNumbersError,
} from './ai-grounding';
import {
  assessOutputLanguage,
  languageCorrection,
  WrongLanguageError,
} from './ai-language';
import type { AiOutputLanguage } from './ai-prompt.shared';
import { classifyAiFailure, type AiFailureKind } from './ai-retry';
import type {
  AiTokenUsage,
  IAiProvider,
} from './providers/ai-provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenAiProvider } from './providers/openai.provider';

/** An answer the guards refused twice. Both kinds are surfaced as errors and never charged. */
type RejectedOutputError = WrongLanguageError | UngroundedNumbersError;

interface OutputRejection {
  code: string;
  correction: string;
  toError: () => RejectedOutputError;
}

const isRejectedOutput = (error: unknown): error is RejectedOutputError =>
  error instanceof WrongLanguageError ||
  error instanceof UngroundedNumbersError;

/**
 * Output guards. Each is optional; a request without them is neither checked nor retried.
 *
 * - Language: the answer's prose is checked against `expectedLanguage` (`languageProbe`
 *   narrows it to the fields meant to be in that language; default: the whole answer).
 * - Grounding: every percent/money figure in the answer must appear in `groundedIn` (the
 *   data the prompt was built from), see ai-grounding.ts.
 *
 * A failing answer is retried once with a correction appended to the user message; if the
 * second answer fails too, the request is refused (WrongLanguageError /
 * UngroundedNumbersError). A refused answer is never charged.
 */
export interface AiOutputGuard<T> {
  readonly expectedLanguage?: AiOutputLanguage;
  readonly languageProbe?: (data: T) => unknown;
  readonly groundedIn?: unknown;
  readonly groundingProbe?: (data: T) => unknown;
}

export interface AiRequest<T = unknown> extends AiOutputGuard<T> {
  readonly userId: number;
  readonly modelId: string;
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

export interface AiResponse<T> {
  readonly data: T;
  readonly model: AiModelId;
  readonly usage: AiTokenUsage;
  readonly creditsCharged: number;
  readonly creditsRemaining: number;
}

export interface AiModelOption {
  readonly id: AiModelId;
  readonly label: string;
  readonly creditsPer1kInput: number;
  readonly creditsPer1kOutput: number;
}

@Injectable()
export class AiManagerService {
  private readonly logger = new Logger(AiManagerService.name);
  private readonly providers: ReadonlyMap<AiProviderId, IAiProvider>;
  /**
   * AI_PROVIDERS allow-list (default: anthropic only). A provider outside it is
   * invisible to every path below even when its API key is set, so a parked provider
   * can neither answer nor bill; there is no silent fallback onto it.
   */
  private readonly enabledProviders: ReadonlySet<AiProviderId> =
    loadEnabledAiProviders();

  constructor(
    private readonly prisma: PrismaService,
    groq: GroqProvider,
    gemini: GeminiProvider,
    openai: OpenAiProvider,
    anthropic: AnthropicProvider,
  ) {
    this.providers = new Map<AiProviderId, IAiProvider>([
      [groq.id, groq],
      [gemini.id, gemini],
      [openai.id, openai],
      [anthropic.id, anthropic],
    ]);
  }

  listAvailableModels(): AiModelOption[] {
    return listAiModels()
      .filter((model) => this.isProviderUsable(model.provider))
      .map(({ id, label, creditsPer1kInput, creditsPer1kOutput }) => ({
        id,
        label,
        creditsPer1kInput,
        creditsPer1kOutput,
      }));
  }

  async getBalance(userId: number): Promise<number> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        ai_token_balance: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.ai_token_balance;
  }

  async executeAiRequest<T>(request: AiRequest<T>): Promise<AiResponse<T>> {
    const pricing = this.resolveModel(request.modelId);
    const provider = this.resolveProvider(pricing);

    const balance = await this.getBalance(request.userId);

    if (balance < MIN_CREDIT_BALANCE) {
      throw this.insufficientCredits(balance, MIN_CREDIT_BALANCE);
    }

    let result: {
      data: T;
      usage: AiTokenUsage;
    };

    const startedAt = Date.now();

    try {
      result = await this.generateWithGuards<T>(
        provider,
        pricing,
        request,
        (usage, code) =>
          this.logFailure(
            request.userId,
            pricing,
            Date.now() - startedAt,
            code,
            usage,
          ),
      );
    } catch (error) {
      // ตอบผิดภาษา/ตัวเลขนอกข้อมูลสองรอบ: ไม่ใช่ provider ล่ม จึงไม่ใช้ข้อความ
      // "provider unavailable" และไม่คิดเครดิต (ยังไม่ถึง chargeAndLog)
      if (isRejectedOutput(error)) {
        this.logger.error(
          `[${pricing.id}] ${error.tag} for user ${request.userId}: ${error.detail}`,
        );
        throw error;
      }

      const kind = classifyAiFailure(error);
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[${pricing.id}] ${kind} for user ${request.userId}: ${reason}`,
      );

      await this.logFailure(
        request.userId,
        pricing,
        Date.now() - startedAt,
        reason,
      );

      // ไม่ fallback ข้าม provider ให้อัตโนมัติ — เรตเครดิตต่าง model ห่างกันถึง 300 เท่า
      // (groq 1 vs claude 300 ต่อ 1k output) การสลับเงียบๆ = คิดเงินผู้ใช้เกินที่เขาเลือก
      // แทนที่ด้วยการบอกให้ชัดว่าเลือกตัวไหนแทนได้บ้าง
      throw this.providerUnavailable(pricing, kind, reason);
    }

    const exactCost = calculateCredits(
      pricing,
      result.usage.inputTokens,
      result.usage.outputTokens,
    );
    const creditsCharged = Math.max(MIN_CREDITS_PER_CALL, Math.ceil(exactCost));

    const creditsRemaining = await this.chargeAndLog(
      request.userId,
      pricing,
      result.usage,
      creditsCharged,
      Date.now() - startedAt,
    );

    return {
      data: result.data,
      model: pricing.id,
      usage: result.usage,
      creditsCharged,
      creditsRemaining,
    };
  }

  async executeSystemAiRequest<T>(request: {
    modelId?: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
    /**
     * Try only `modelId` — no fallback walk. For callers that run their own,
     * differently-prompted fallback afterward (e.g. Gemini news enrichment, whose
     * fallback re-runs the *existing* enrichment prompt on the *other* providers
     * rather than retrying the same provider with a different prompt).
     */
    preferredOnly?: boolean;
    /** Skip these providers entirely, e.g. to avoid retrying one that just failed. */
    excludeProviders?: AiProviderId[];
    expectedLanguage?: AiOutputLanguage;
    languageProbe?: (data: T) => unknown;
    groundedIn?: unknown;
    groundingProbe?: (data: T) => unknown;
  }): Promise<{
    data: T;
    model: AiModelId;
    usage: AiTokenUsage;
  }> {
    const chain = this.buildSystemChain(
      request.modelId,
      request.preferredOnly,
      request.excludeProviders,
    );

    if (chain.length === 0) {
      throw new ServiceUnavailableException(
        'No AI provider is configured on this server.',
      );
    }

    const attempted: string[] = [];

    for (const [index, pricing] of chain.entries()) {
      const provider = this.providers.get(pricing.provider);

      // buildSystemChain กรอง isProviderUsable() ไว้แล้ว แต่กันไว้ให้ type แคบลง
      if (!provider) {
        continue;
      }

      try {
        const result = await this.generateWithGuards<T>(
          provider,
          pricing,
          request,
          (usage, code) =>
            this.logger.warn(
              `[system:${pricing.id}] discarded an answer (${code}; ${usage.inputTokens} in / ${usage.outputTokens} out tokens)`,
            ),
        );

        if (index > 0) {
          this.logger.log(
            `[system] served by ${pricing.id} after ${index} fallback(s); tried ${attempted.join(' -> ')}`,
          );
        }

        return {
          data: result.data,
          model: pricing.id,
          usage: result.usage,
        };
      } catch (error) {
        if (isRejectedOutput(error)) {
          // ถูก guard ปฏิเสธสองรอบบน model นี้ — ลองตัวถัดไปใน chain ถ้ามี (ปกติไม่มี:
          // ตอนนี้ chain มี claude-fast ตัวเดียว) ไม่ใช่ error แบบ permanent
          attempted.push(`${pricing.id}(${error.tag})`);
          this.logger.warn(
            `[system:${pricing.id}] ${error.tag} after retry: ${error.detail}`,
          );
          continue;
        }

        const kind = classifyAiFailure(error);
        const reason = error instanceof Error ? error.message : String(error);

        attempted.push(`${pricing.id}(${kind})`);

        if (kind === 'permanent') {
          // คำขอเองมีปัญหา (prompt ผิด, model ไม่รองรับ, key ใช้ไม่ได้)
          // เจ้าอื่นก็ตอบเหมือนกัน วนต่อมีแต่เสียเวลาและเสียเงิน
          this.logger.error(
            `[system:${pricing.id}] permanent failure, not retrying: ${reason}`,
          );

          throw new ServiceUnavailableException(
            `AI provider "${pricing.provider}" rejected the request: ${reason}`,
          );
        }

        const next = chain[index + 1];

        if (next) {
          this.logger.warn(
            `[system:${pricing.id}] ${kind}: ${reason} — falling back to ${next.id}`,
          );
        } else {
          this.logger.error(
            `[system:${pricing.id}] ${kind}: ${reason} — no provider left`,
          );
        }
      }
    }

    throw new ServiceUnavailableException(
      `All AI providers are unavailable right now (tried ${attempted.join(', ')}).`,
    );
  }

  /**
   * ลำดับ model ที่จะลองสำหรับงานเบื้องหลัง
   *
   * ตัวที่ระบุมา (ถ้ามี) มาก่อนเสมอ แล้วต่อด้วย AI_SYSTEM_FALLBACK_ORDER ที่เหลือ
   * ข้าม provider ที่ไม่มี API key เพื่อไม่ให้เสีย attempt ไปกับตัวที่ล้มแน่นอน
   */
  private buildSystemChain(
    preferredModelId?: string,
    preferredOnly = false,
    excludeProviders?: AiProviderId[],
  ): AiModelPricing[] {
    const ordered: AiModelId[] = [];

    if (preferredModelId && isAiModelId(preferredModelId)) {
      ordered.push(preferredModelId);
    }

    if (!preferredOnly) {
      for (const modelId of AI_SYSTEM_FALLBACK_ORDER) {
        if (!ordered.includes(modelId)) {
          ordered.push(modelId);
        }
      }
    }

    return ordered
      .map((modelId) => getModelPricing(modelId))
      .filter(
        (pricing) =>
          this.isProviderUsable(pricing.provider) &&
          !excludeProviders?.includes(pricing.provider),
      );
  }

  private async chargeAndLog(
    userId: number,
    pricing: AiModelPricing,
    usage: AiTokenUsage,
    creditsCharged: number,
    latencyMs: number,
  ): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        const charged = await tx.users.updateMany({
          where: {
            id: userId,
            ai_token_balance: {
              gte: creditsCharged,
            },
          },
          data: {
            ai_token_balance: {
              decrement: creditsCharged,
            },
          },
        });

        if (charged.count !== 1) {
          const current = await tx.users.findUnique({
            where: { id: userId },
            select: {
              ai_token_balance: true,
            },
          });

          if (!current) {
            throw new NotFoundException('User not found');
          }

          throw this.insufficientCredits(
            current.ai_token_balance,
            creditsCharged,
          );
        }

        await tx.ai_usage_logs.create({
          data: {
            user_id: userId,
            model_used: pricing.id,
            provider: pricing.provider,
            tokens_input: usage.inputTokens,
            tokens_output: usage.outputTokens,
            credits_deducted: creditsCharged,
            latency_ms: latencyMs,
            status: 'SUCCESS',
          },
        });

        await tx.token_transactions.create({
          data: {
            user_id: userId,
            amount: -creditsCharged,
            type: 'AI_USAGE',
            description: `${pricing.id}: ${usage.inputTokens} input / ${usage.outputTokens} output tokens`,
          },
        });

        const updated = await tx.users.findUniqueOrThrow({
          where: { id: userId },
          select: {
            ai_token_balance: true,
          },
        });

        return updated.ai_token_balance;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  /**
   * Calls the provider and runs the request's output guards (language, numeric grounding)
   * on the answer. At most two provider calls: the second only after a rejected first
   * answer, with the guard's correction appended to the user message. The usage of a
   * discarded answer goes to `onDiscarded` (we paid for it, the user does not). Only the
   * accepted answer's usage is returned, so only that is ever billed.
   */
  private async generateWithGuards<T>(
    provider: IAiProvider,
    pricing: AiModelPricing,
    request: AiOutputGuard<T> & {
      prompt: string;
      systemPrompt?: string;
      temperature?: number;
      maxOutputTokens?: number;
    },
    onDiscarded: (usage: AiTokenUsage, code: string) => Promise<void> | void,
  ): Promise<{ data: T; usage: AiTokenUsage }> {
    let prompt = request.prompt;
    let lastRejection: OutputRejection | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await provider.generateJsonResponse<T>({
        upstreamModel: pricing.upstreamModel,
        prompt,
        systemPrompt: request.systemPrompt,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
      });

      const rejection = this.judgeOutput(result.data, request);
      if (!rejection) return result;

      lastRejection = rejection;
      await onDiscarded(result.usage, rejection.code);

      prompt = request.prompt + rejection.correction;
    }

    throw (lastRejection as OutputRejection).toError();
  }

  /** First guard the answer fails, or null when it passes all of them. */
  private judgeOutput<T>(
    data: T,
    guard: AiOutputGuard<T>,
  ): OutputRejection | null {
    const expected = guard.expectedLanguage;

    if (expected) {
      const verdict = assessOutputLanguage(
        guard.languageProbe ? guard.languageProbe(data) : data,
        expected,
      );

      if (!verdict.ok) {
        const reason = verdict.reason ?? 'wrong language';

        return {
          code: 'WRONG_LANGUAGE',
          correction: languageCorrection(expected),
          toError: () => new WrongLanguageError(expected, reason),
        };
      }
    }

    if (guard.groundedIn !== undefined) {
      const verdict = assessNumericGrounding(
        guard.groundingProbe ? guard.groundingProbe(data) : data,
        guard.groundedIn,
      );

      if (!verdict.ok) {
        const reason = verdict.reason ?? 'figures not found in the data';

        return {
          code: 'UNGROUNDED_NUMBERS',
          correction: groundingCorrection(verdict.ungrounded ?? []),
          toError: () => new UngroundedNumbersError(reason),
        };
      }
    }

    return null;
  }

  private async logFailure(
    userId: number,
    pricing: AiModelPricing,
    latencyMs: number,
    reason: string,
    usage: AiTokenUsage = { inputTokens: 0, outputTokens: 0 },
  ): Promise<void> {
    try {
      await this.prisma.ai_usage_logs.create({
        data: {
          user_id: userId,
          model_used: pricing.id,
          provider: pricing.provider,
          tokens_input: usage.inputTokens,
          tokens_output: usage.outputTokens,
          credits_deducted: 0,
          latency_ms: latencyMs,
          status: 'FAILED',
          error_code: reason.slice(0, 50),
        },
      });
    } catch {
      // Logging must never mask the provider error.
    }
  }

  /**
   * error ของฝั่งผู้ใช้ — ต้องบอกได้ว่าลองรุ่นไหนแทนได้
   *
   * ของเดิมคืนแค่ "provider X is unavailable" ผู้ใช้จึงไม่รู้ว่าควรทำอะไรต่อ
   * ทั้งที่ปกติมีอีก 3 รุ่นให้เลือกอยู่ในเมนู
   */
  private providerUnavailable(
    pricing: AiModelPricing,
    kind: AiFailureKind,
    reason: string,
  ) {
    const alternatives = this.listAvailableModels()
      .filter((model) => model.id !== pricing.id)
      .map((model) => model.id);

    const detail =
      kind === 'rate-limit'
        ? `Model "${pricing.id}" hit its rate limit.`
        : kind === 'permanent'
          ? `Model "${pricing.id}" rejected the request: ${reason}`
          : `Provider "${pricing.provider}" is unavailable right now.`;

    const hint =
      alternatives.length > 0
        ? ` Try another model: ${alternatives.join(', ')}.`
        : '';

    return new ServiceUnavailableException({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: 'AI_PROVIDER_UNAVAILABLE',
      message: `${detail}${hint}`,
      model: pricing.id,
      provider: pricing.provider,
      failureKind: kind,
      availableModels: alternatives,
    });
  }

  private insufficientCredits(balance: number, required: number) {
    return new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'INSUFFICIENT_CREDITS',
        message: `You need at least ${required} AI tokens to run this.`,
        balance,
        required,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private resolveModel(modelId: string): AiModelPricing {
    if (!isAiModelId(modelId)) {
      throw new BadRequestException(
        `Unknown AI model "${modelId}". Supported: ${Object.keys(
          AI_MODEL_REGISTRY,
        ).join(', ')}`,
      );
    }

    return getModelPricing(modelId);
  }

  private resolveProvider(pricing: AiModelPricing): IAiProvider {
    const provider = this.providers.get(pricing.provider);

    if (!this.enabledProviders.has(pricing.provider) || !provider) {
      // เช่น client ที่จำ id ของ provider ที่ปิดไว้ (groq/gemini/gpt-4o) ไว้ใน localStorage —
      // บอกตรง ๆ พร้อมรุ่นที่ใช้ได้ ไม่สลับไปรุ่นอื่นให้เอง เพราะเรตเครดิตต่างกัน
      const available = this.listAvailableModels().map((model) => model.id);
      throw new ServiceUnavailableException(
        `Model "${pricing.id}" is not enabled on this server.${
          available.length > 0 ? ` Available: ${available.join(', ')}.` : ''
        }`,
      );
    }

    if (!provider.isConfigured()) {
      throw new ServiceUnavailableException(
        `Model "${pricing.id}" is not available: ${pricing.provider} is not configured.`,
      );
    }

    return provider;
  }

  /** In AI_PROVIDERS and holding a usable API key. */
  private isProviderUsable(providerId: AiProviderId): boolean {
    return (
      this.enabledProviders.has(providerId) &&
      this.providers.get(providerId)?.isConfigured() === true
    );
  }
}

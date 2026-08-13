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
import type {
  AiTokenUsage,
  IAiProvider,
} from './providers/ai-provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenAiProvider } from './providers/openai.provider';

export interface AiRequest {
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
  private readonly logger = new Logger(
    AiManagerService.name,
  );
  private readonly providers: ReadonlyMap<
    AiProviderId,
    IAiProvider
  >;

  constructor(
    private readonly prisma: PrismaService,
    groq: GroqProvider,
    gemini: GeminiProvider,
    openai: OpenAiProvider,
    anthropic: AnthropicProvider,
  ) {
    this.providers = new Map<
      AiProviderId,
      IAiProvider
    >([
      [groq.id, groq],
      [gemini.id, gemini],
      [openai.id, openai],
      [anthropic.id, anthropic],
    ]);
  }

  listAvailableModels(): AiModelOption[] {
    return listAiModels()
      .filter(
        (model) =>
          this.providers
            .get(model.provider)
            ?.isConfigured() === true,
      )
      .map(
        ({
          id,
          label,
          creditsPer1kInput,
          creditsPer1kOutput,
        }) => ({
          id,
          label,
          creditsPer1kInput,
          creditsPer1kOutput,
        }),
      );
  }

  async getBalance(
    userId: number,
  ): Promise<number> {
    const user =
      await this.prisma.users.findUnique({
        where: { id: userId },
        select: {
          ai_token_balance: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    return user.ai_token_balance;
  }

  async executeAiRequest<T>(
    request: AiRequest,
  ): Promise<AiResponse<T>> {
    const pricing = this.resolveModel(
      request.modelId,
    );
    const provider =
      this.resolveProvider(pricing);

    const balance = await this.getBalance(
      request.userId,
    );

    if (balance < MIN_CREDIT_BALANCE) {
      throw this.insufficientCredits(
        balance,
        MIN_CREDIT_BALANCE,
      );
    }

    let result: {
      data: T;
      usage: AiTokenUsage;
    };

    const startedAt = Date.now();

    try {
      result =
        await provider.generateJsonResponse<T>({
          upstreamModel:
            pricing.upstreamModel,
          prompt: request.prompt,
          systemPrompt:
            request.systemPrompt,
          temperature:
            request.temperature,
          maxOutputTokens:
            request.maxOutputTokens,
        });
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : String(error);

      this.logger.error(
        `[${pricing.id}] request failed for user ${request.userId}: ${reason}`,
      );

      await this.logFailure(
        request.userId,
        pricing,
        Date.now() - startedAt,
        reason,
      );

      throw new ServiceUnavailableException(
        `AI provider "${pricing.provider}" is unavailable right now.`,
      );
    }

    const exactCost = calculateCredits(
      pricing,
      result.usage.inputTokens,
      result.usage.outputTokens,
    );
    const creditsCharged = Math.max(
      MIN_CREDITS_PER_CALL,
      Math.ceil(exactCost),
    );

    const creditsRemaining =
      await this.chargeAndLog(
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

  async executeSystemAiRequest<T>(
    request: {
      modelId?: string;
      prompt: string;
      systemPrompt?: string;
      temperature?: number;
      maxOutputTokens?: number;
    },
  ): Promise<{
    data: T;
    model: AiModelId;
    usage: AiTokenUsage;
  }> {
    const available =
      this.listAvailableModels();
    const selectedModel =
      request.modelId ??
      available.find(
        (model) =>
          model.id === 'groq-llama3',
      )?.id ??
      available.find(
        (model) =>
          model.id ===
          'gemini-2.5-flash',
      )?.id ??
      available[0]?.id;

    if (!selectedModel) {
      throw new ServiceUnavailableException(
        'No AI provider is configured on this server.',
      );
    }

    const pricing =
      this.resolveModel(selectedModel);
    const provider =
      this.resolveProvider(pricing);

    try {
      const result =
        await provider.generateJsonResponse<T>({
          upstreamModel:
            pricing.upstreamModel,
          prompt: request.prompt,
          systemPrompt:
            request.systemPrompt,
          temperature:
            request.temperature,
          maxOutputTokens:
            request.maxOutputTokens,
        });

      return {
        data: result.data,
        model: pricing.id,
        usage: result.usage,
      };
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : String(error);

      this.logger.error(
        `[system:${pricing.id}] ${reason}`,
      );

      throw new ServiceUnavailableException(
        `AI provider "${pricing.provider}" is unavailable right now.`,
      );
    }
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
        const charged =
          await tx.users.updateMany({
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
          const current =
            await tx.users.findUnique({
              where: { id: userId },
              select: {
                ai_token_balance: true,
              },
            });

          if (!current) {
            throw new NotFoundException(
              'User not found',
            );
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
            tokens_input:
              usage.inputTokens,
            tokens_output:
              usage.outputTokens,
            credits_deducted:
              creditsCharged,
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

        const updated =
          await tx.users.findUniqueOrThrow({
            where: { id: userId },
            select: {
              ai_token_balance: true,
            },
          });

        return updated.ai_token_balance;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  private async logFailure(
    userId: number,
    pricing: AiModelPricing,
    latencyMs: number,
    reason: string,
  ): Promise<void> {
    try {
      await this.prisma.ai_usage_logs.create({
        data: {
          user_id: userId,
          model_used: pricing.id,
          provider: pricing.provider,
          tokens_input: 0,
          tokens_output: 0,
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

  private insufficientCredits(
    balance: number,
    required: number,
  ) {
    return new HttpException(
      {
        statusCode:
          HttpStatus.PAYMENT_REQUIRED,
        error: 'INSUFFICIENT_CREDITS',
        message: `You need at least ${required} AI tokens to run this.`,
        balance,
        required,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private resolveModel(
    modelId: string,
  ): AiModelPricing {
    if (!isAiModelId(modelId)) {
      throw new BadRequestException(
        `Unknown AI model "${modelId}". Supported: ${Object.keys(
          AI_MODEL_REGISTRY,
        ).join(', ')}`,
      );
    }

    return getModelPricing(modelId);
  }

  private resolveProvider(
    pricing: AiModelPricing,
  ): IAiProvider {
    const provider =
      this.providers.get(
        pricing.provider,
      );

    if (!provider?.isConfigured()) {
      throw new ServiceUnavailableException(
        `Model "${pricing.id}" is not available: ${pricing.provider} is not configured.`,
      );
    }

    return provider;
  }
}

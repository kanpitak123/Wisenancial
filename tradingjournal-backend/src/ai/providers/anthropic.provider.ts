import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type {
  AiGenerateOptions,
  AiJsonResult,
  IAiProvider,
} from './ai-provider.interface';
import {
  AI_REQUEST_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TEMPERATURE,
  parseJsonResponse,
} from './ai-provider.interface';

@Injectable()
export class AnthropicProvider implements IAiProvider {
  readonly id = 'anthropic' as const;

  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic | null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    // timeout เดียวกับอีก 3 เจ้า — SDK ของ Anthropic ตั้ง default ไว้ 10 นาที
    // ซึ่งนานเกินกว่าที่ ai-manager จะรอไหวตอน fallback ข้าม provider
    this.client = apiKey
      ? new Anthropic({ apiKey, timeout: AI_REQUEST_TIMEOUT_MS })
      : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async generateJsonResponse<T>(
    options: AiGenerateOptions,
  ): Promise<AiJsonResult<T>> {
    if (!this.client) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    try {
      const response = await this.client.messages.create({
        model: options.upstreamModel,
        max_tokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: options.temperature ?? DEFAULT_TEMPERATURE,
        system: options.systemPrompt ?? 'Return valid JSON only.',
        messages: [
          {
            role: 'user',
            content: options.prompt,
          },
        ],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      return {
        data: parseJsonResponse<T>(text),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error: unknown) {
      const reason = this.describeError(error);
      this.logger.error(reason);
      throw new Error(reason);
    }
  }

  private describeError(error: unknown): string {
    if (error && typeof error === 'object') {
      const value = error as {
        status?: number | string;
        message?: string;
      };

      return `${value.status ?? 'network'} ${
        value.message ?? 'Anthropic request failed'
      }`;
    }

    return String(error);
  }
}

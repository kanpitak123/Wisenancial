import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type {
  AiGenerateOptions,
  AiJsonResult,
  IAiProvider,
} from './ai-provider.interface';
import { parseJsonResponse } from './ai-provider.interface';

@Injectable()
export class AnthropicProvider implements IAiProvider {
  readonly id = 'anthropic' as const;

  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic | null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
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
        max_tokens: options.maxOutputTokens ?? 1200,
        temperature: options.temperature ?? 0.2,
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

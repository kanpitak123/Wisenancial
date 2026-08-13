import { Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';
import type { AiProviderId } from '../ai.models';
import {
  AI_REQUEST_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TEMPERATURE,
  estimateTokens,
  parseJsonResponse,
  type AiGenerateOptions,
  type AiJsonResult,
  type IAiProvider,
} from './ai-provider.interface';

@Injectable()
export class GroqProvider implements IAiProvider {
  readonly id: AiProviderId = 'groq';

  private readonly logger = new Logger(GroqProvider.name);
  private readonly client: Groq | null;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    this.client = apiKey ? new Groq({ apiKey, timeout: AI_REQUEST_TIMEOUT_MS }) : null;
    if (!this.client) {
      this.logger.warn('GROQ_API_KEY not set; Groq models are unavailable');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async generateJsonResponse<T>(options: AiGenerateOptions): Promise<AiJsonResult<T>> {
    if (!this.client) {
      throw new Error('Groq client is not configured');
    }

    const systemPrompt = options.systemPrompt ?? 'You are a helpful assistant. Reply with valid JSON only.';

    const completion = await this.client.chat.completions.create({
      model: options.upstreamModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: options.prompt },
      ],
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error('Groq returned an empty response');
    }

    return {
      data: parseJsonResponse<T>(text),
      usage: {
        inputTokens:
          completion.usage?.prompt_tokens ?? estimateTokens(systemPrompt + options.prompt),
        outputTokens: completion.usage?.completion_tokens ?? estimateTokens(text),
      },
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, type AxiosInstance } from 'axios';
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

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Talks to the REST API directly rather than the `openai` SDK: the backend has
 * no OpenAI dependency installed, and the chat-completions contract is stable.
 */
@Injectable()
export class OpenAiProvider implements IAiProvider {
  readonly id: AiProviderId = 'openai';

  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly apiKey: string | undefined;
  private readonly http: AxiosInstance;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    if (!this.apiKey) {
      this.logger.warn('OPENAI_API_KEY not set; OpenAI models are unavailable');
    }
    this.http = axios.create({
      baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generateJsonResponse<T>(options: AiGenerateOptions): Promise<AiJsonResult<T>> {
    if (!this.apiKey) {
      throw new Error('OpenAI client is not configured');
    }

    const systemPrompt = options.systemPrompt ?? 'You are a helpful assistant. Reply with valid JSON only.';

    let payload: OpenAiChatResponse;
    try {
      const response = await this.http.post<OpenAiChatResponse>(
        '/chat/completions',
        {
          model: options.upstreamModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: options.prompt },
          ],
          temperature: options.temperature ?? DEFAULT_TEMPERATURE,
          max_tokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
        },
        { headers: { Authorization: `Bearer ${this.apiKey}` } },
      );
      payload = response.data;
    } catch (error) {
      throw new Error(`OpenAI request failed: ${describeAxiosError(error)}`);
    }

    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('OpenAI returned an empty response');
    }

    return {
      data: parseJsonResponse<T>(text),
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? estimateTokens(systemPrompt + options.prompt),
        outputTokens: payload.usage?.completion_tokens ?? estimateTokens(text),
      },
    };
  }
}

function describeAxiosError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: { message?: string } }>;
    const message = axiosError.response?.data?.error?.message ?? axiosError.message;
    return `${axiosError.response?.status ?? 'network'} ${message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

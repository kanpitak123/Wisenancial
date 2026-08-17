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

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Uses the generativelanguage REST endpoint directly (via axios) rather than
 * the `@google/generative-ai` SDK, so the app carries no vendor SDK dependency
 * for Gemini and every LLM call goes through the same billed manager path.
 */
@Injectable()
export class GeminiProvider implements IAiProvider {
  readonly id: AiProviderId = 'gemini';

  private readonly logger = new Logger(GeminiProvider.name);
  private readonly apiKey: string | undefined;
  private readonly http: AxiosInstance;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      this.logger.warn('GEMINI_API_KEY not set; Gemini models are unavailable');
    }
    this.http = axios.create({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generateJsonResponse<T>(
    options: AiGenerateOptions,
  ): Promise<AiJsonResult<T>> {
    if (!this.apiKey) {
      throw new Error('Gemini client is not configured');
    }

    const systemPrompt =
      options.systemPrompt ??
      'You are a helpful assistant. Reply with valid JSON only.';

    let payload: GeminiResponse;
    try {
      const response = await this.http.post<GeminiResponse>(
        `/models/${options.upstreamModel}:generateContent`,
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: options.temperature ?? DEFAULT_TEMPERATURE,
            maxOutputTokens:
              options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
            // เป็น thinking model — thinking tokens ถูกหักจาก maxOutputTokens
            // ทำให้ JSON ถูกตัดกลางคันแบบสุ่ม จึงกดการคิดให้ต่ำที่สุดสำหรับงาน
            // structured JSON (เร็วขึ้นและถูกลงด้วย)
            //
            // ตระกูล Gemini 3.x ไม่รับ thinkingBudget: 0 อีกแล้ว (ตอบ 400
            // "Request contains an invalid argument") ต้องใช้ thinkingLevel แทน
            thinkingConfig: { thinkingLevel: 'low' },
          },
        },
        { headers: { 'x-goog-api-key': this.apiKey } },
      );
      payload = response.data;
    } catch (error) {
      throw new Error(`Gemini request failed: ${describeAxiosError(error)}`);
    }

    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    return {
      data: parseJsonResponse<T>(text),
      usage: {
        inputTokens:
          payload.usageMetadata?.promptTokenCount ??
          estimateTokens(systemPrompt + options.prompt),
        outputTokens:
          payload.usageMetadata?.candidatesTokenCount ?? estimateTokens(text),
      },
    };
  }
}

function describeAxiosError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: { message?: string } }>;
    const message =
      axiosError.response?.data?.error?.message ?? axiosError.message;
    return `${axiosError.response?.status ?? 'network'} ${message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

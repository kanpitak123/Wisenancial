import type { SystemAiExecutor } from './news-analysis/types';
import type { AiManagerService } from './ai-manager.service';
import type { AiTokenUsage } from './providers/ai-provider.interface';

/**
 * The news-analysis guardrails prompt was validated against Claude only, so the shadow
 * second pass must never be answered by whichever provider happens to be next in
 * AI_SYSTEM_FALLBACK_ORDER (groq first).
 */
export const GUARDRAILS_MODEL_ID = 'claude-sonnet-5';

export interface GuardrailsCallRecord {
  model: string;
  usage: AiTokenUsage;
}

/**
 * The only door the vendored NewsAnalysisService gets to the AI layer.
 *
 * - System-paid only: it can call executeSystemAiRequest and nothing else, so no user's
 *   credit balance is ever touched (executeAiRequest is deliberately not reachable).
 * - Claude only: whatever modelId the module passes is overridden, and preferredOnly
 *   turns off the fallback walk, so an unconfigured/failed Claude is an error, not a
 *   silent Groq answer.
 * - Remembers whether the *provider call itself* threw. NewsAnalysisService swallows
 *   executor errors into an AI_OUTPUT_INVALID envelope, which would otherwise be
 *   indistinguishable from "the model answered but failed validation".
 *
 * One instance per analysed item; not shared between calls.
 */
export class ClaudeOnlySystemExecutor implements SystemAiExecutor {
  private providerFailed = false;
  private providerFailure: unknown;
  private readonly recorded: GuardrailsCallRecord[] = [];

  constructor(
    private readonly manager: Pick<AiManagerService, 'executeSystemAiRequest'>,
  ) {}

  /** True once the provider call threw (unavailable, unconfigured, rejected). */
  get failed(): boolean {
    return this.providerFailed;
  }

  get failure(): unknown {
    return this.providerFailure;
  }

  get calls(): readonly GuardrailsCallRecord[] {
    return this.recorded;
  }

  get totalUsage(): AiTokenUsage {
    return this.recorded.reduce<AiTokenUsage>(
      (sum, call) => ({
        inputTokens: sum.inputTokens + call.usage.inputTokens,
        outputTokens: sum.outputTokens + call.usage.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 },
    );
  }

  async executeSystemAiRequest<T>(request: {
    modelId?: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<{ data: T; model: string; usage: unknown }> {
    try {
      const result = await this.manager.executeSystemAiRequest<T>({
        modelId: GUARDRAILS_MODEL_ID,
        preferredOnly: true,
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
      });
      this.recorded.push({ model: result.model, usage: result.usage });
      return result;
    } catch (error) {
      this.providerFailed = true;
      this.providerFailure = error;
      throw error;
    }
  }
}

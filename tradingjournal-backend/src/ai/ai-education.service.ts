import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import type { QuizResponse } from './ai-feature.types';

@Injectable()
export class AiEducationService {
  constructor(private readonly manager: AiManagerService) {}

  async generateQuiz(
    userId: number,
    lessonTitle: string,
    lessonDescription: string,
  ) {
    const modelId = this.defaultModel();

    const result = await this.manager.executeAiRequest<QuizResponse>({
      userId,
      modelId,
      systemPrompt:
        'You create finance education quizzes. Return valid JSON only.',
      prompt: JSON.stringify({
        task: 'Generate exactly 2 multiple-choice questions',
        lessonTitle,
        lessonDescription,
        requiredShape: {
          questions: [
            {
              question: 'string',
              options: ['string', 'string', 'string', 'string'],
              correctAnswer: 'integer 0-3',
              explanation: 'string',
            },
          ],
        },
      }),
      maxOutputTokens: 1200,
    });

    const quiz = result.data;
    if (!Array.isArray(quiz?.questions) || quiz.questions.length !== 2) {
      throw new InternalServerErrorException(
        'AI returned an unusable quiz',
      );
    }

    quiz.questions.forEach((question, index) => {
      if (
        !question.question ||
        !Array.isArray(question.options) ||
        question.options.length !== 4 ||
        !Number.isInteger(question.correctAnswer) ||
        question.correctAnswer < 0 ||
        question.correctAnswer > 3
      ) {
        throw new InternalServerErrorException(
          `Invalid quiz question at index ${index}`,
        );
      }
    });

    return {
      data: quiz,
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
    };
  }

  private defaultModel(): string {
    const models = this.manager.listAvailableModels();
    const selected =
      models.find((model) => model.id === 'gemini-2.5-flash') ??
      models.find((model) => model.id === 'groq-llama3') ??
      models[0];

    if (!selected) {
      throw new ServiceUnavailableException(
        'No AI provider is configured on this server.',
      );
    }

    return selected.id;
  }
}

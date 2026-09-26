import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import {
  concisenessRule,
  outputLanguageRule,
  withLanguage,
  resolveOutputLanguage,
} from './ai-prompt.shared';
import type { QuizResponse } from './ai-feature.types';

@Injectable()
export class AiEducationService {
  constructor(private readonly manager: AiManagerService) {}

  async generateQuiz(
    userId: number,
    lessonTitle: string,
    lessonDescription: string,
    requestedLanguage?: string,
  ) {
    const outputLanguage = resolveOutputLanguage(requestedLanguage);

    const result = await this.manager.executeAiRequest<QuizResponse>({
      userId,
      feature: 'education_quiz',
      systemPrompt: [
        'You create finance education quizzes.',
        outputLanguageRule(outputLanguage),
        // ยังไม่ใส่ investmentGuardrail() ที่นี่ (เป็นเนื้อหาบทเรียน ไม่ใช่คำแนะนำลงทุน
        // — มีเทสล็อกไว้) แต่ conciseness ไม่เกี่ยวกับเรื่องนั้น explanation เป็น
        // ฟรีเท็กซ์ที่ยาวเกินได้จริง
        concisenessRule(),
        'Return valid JSON only.',
      ].join('\n'),
      prompt: JSON.stringify(
        withLanguage(
          {
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
          },
          outputLanguage,
        ),
      ),
      maxOutputTokens: 1600,
      expectedLanguage: outputLanguage,
    });

    const quiz = result.data;
    if (!Array.isArray(quiz?.questions) || quiz.questions.length !== 2) {
      throw new InternalServerErrorException('AI returned an unusable quiz');
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
}

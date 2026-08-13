import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { GOALS_API_PATH } from '../constants/goal.constants';
import type { ApiErrorResponse, GoalRecord, SetGoalPayload } from '../types/goal.types';

export function getGoalErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

export const goalService = {
  async getMonthlyTarget(portfolioId: number, year: number, month: number): Promise<number> {
    const response = await api.get<number>(`${GOALS_API_PATH}/portfolio/${portfolioId}`, {
      params: {
        year,
        month,
      },
    });

    return Number(response.data ?? 0);
  },

  async setMonthlyTarget(portfolioId: number, payload: SetGoalPayload): Promise<GoalRecord> {
    const response = await api.post<GoalRecord>(
      `${GOALS_API_PATH}/portfolio/${portfolioId}`,
      payload,
    );

    return response.data;
  },
};

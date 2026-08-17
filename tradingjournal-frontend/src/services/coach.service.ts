import { api } from 'src/boot/axios';
import type { BookSessionPayload, Coach, CoachReview, CoachSession } from 'src/types/coach.types';

/**
 * Coach Room service.
 *
 * Wired to the backend (NestJS CoachModule). Errors propagate to the caller so
 * the UI can surface a real error/empty state instead of fabricated data.
 *   GET  /coaches                     -> Coach[]
 *   GET  /coaches/:id                 -> Coach
 *   GET  /coaches/:id/reviews         -> CoachReview[]
 *   GET  /coaches/sessions/mine       -> CoachSession[]  (auth required)
 *   POST /coaches/sessions            -> CoachSession     (auth required)
 *   POST /coaches/sessions/:id/cancel -> CoachSession     (auth required)
 */
export const coachService = {
  async listCoaches(): Promise<Coach[]> {
    const { data } = await api.get<Coach[]>('/coaches');
    return data;
  },

  async getCoach(id: string): Promise<Coach | null> {
    const { data } = await api.get<Coach>(`/coaches/${encodeURIComponent(id)}`);
    return data;
  },

  async getReviews(coachId: string): Promise<CoachReview[]> {
    const { data } = await api.get<CoachReview[]>(
      `/coaches/${encodeURIComponent(coachId)}/reviews`,
    );
    return data;
  },

  async mySessions(): Promise<CoachSession[]> {
    const { data } = await api.get<CoachSession[]>('/coaches/sessions/mine');
    return data;
  },

  async bookSession(payload: BookSessionPayload): Promise<CoachSession> {
    const { data } = await api.post<CoachSession>('/coaches/sessions', payload);
    return data;
  },

  async cancelSession(id: string): Promise<CoachSession | null> {
    const { data } = await api.post<CoachSession>(
      `/coaches/sessions/${encodeURIComponent(id)}/cancel`,
      {},
    );
    return data;
  },
};

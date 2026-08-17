// Coach Room — 1:1 mentorship feature.
// This is scaffolding: the UI is fully functional against a mock service.
// TODO(backend): real implementation needs new database tables and endpoints
// (see coach.service.ts for the exact API contract).

export type CoachSpecialty =
  | 'DAY_TRADING'
  | 'SWING_TRADING'
  | 'OPTIONS'
  | 'RISK_MANAGEMENT'
  | 'PSYCHOLOGY'
  | 'VALUE_INVESTING';

export type SessionStatus = 'UPCOMING' | 'COMPLETED' | 'CANCELLED';

export interface Coach {
  id: string;
  name: string;
  avatarUrl: string | null;
  headline: { en: string; th: string };
  bio: { en: string; th: string };
  specialties: CoachSpecialty[];
  rating: number; // 0-5
  reviewCount: number;
  yearsExperience: number;
  /** Price per 1-hour session, in THB. */
  hourlyRateThb: number;
  languages: ('en' | 'th')[];
  /** ISO timestamps the coach is available to book. */
  availableSlots: string[];
}

export interface CoachReview {
  id: string;
  coachId: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface CoachSession {
  id: string;
  coachId: string;
  coachName: string;
  /** ISO timestamp of the scheduled session. */
  scheduledAt: string;
  durationMinutes: number;
  status: SessionStatus;
  topic: string;
  meetingUrl: string | null;
}

export interface BookSessionPayload {
  coachId: string;
  slot: string; // ISO timestamp
  topic: string;
}

export const SPECIALTY_META: Record<
  CoachSpecialty,
  { en: string; th: string; icon: string }
> = {
  DAY_TRADING: { en: 'Day Trading', th: 'เดย์เทรด', icon: 'bolt' },
  SWING_TRADING: { en: 'Swing Trading', th: 'สวิงเทรด', icon: 'swap_vert' },
  OPTIONS: { en: 'Options', th: 'ออปชัน', icon: 'tune' },
  RISK_MANAGEMENT: { en: 'Risk Management', th: 'บริหารความเสี่ยง', icon: 'shield' },
  PSYCHOLOGY: { en: 'Trading Psychology', th: 'จิตวิทยาการเทรด', icon: 'psychology' },
  VALUE_INVESTING: { en: 'Value Investing', th: 'การลงทุนเน้นคุณค่า', icon: 'savings' },
};

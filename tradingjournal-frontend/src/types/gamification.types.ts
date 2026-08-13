export type PortfolioType = 'TRADER' | 'INVESTOR';

export type MissionFrequency = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type MissionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CLAIMED' | 'EXPIRED';

export type MissionAudience = 'ALL' | 'TRADER' | 'INVESTOR';

export type MissionZone = 'DAILY' | 'MONTHLY' | 'INVITE' | 'ACHIEVEMENT';

export type MissionEventType =
  | 'LOGIN'
  | 'TRADE_CREATED'
  | 'TRADE_CLOSED'
  | 'JOURNAL_COMPLETED'
  | 'TRADE_IMPORTED'
  | 'STOCK_PURCHASED'
  | 'STOCK_SOLD'
  | 'DIVIDEND_RECEIVED'
  | 'PORTFOLIO_REVIEWED'
  | 'GOAL_COMPLETED'
  | 'POST_CREATED'
  | 'COMMENT_CREATED'
  | 'PROFILE_COMPLETED';

export interface Mission {
  id: number;
  user_mission_id: number;
  code: string;
  title: string;
  description: string | null;
  points: number;
  target_count: number;
  progress: number;
  status: MissionStatus;
  frequency: MissionFrequency;
  zone: MissionZone;
  audience: MissionAudience;
  event_type: MissionEventType;
  period_key: string;
  completed_at: string | null;
  claimed_at: string | null;
  expires_at: string | null;
  can_claim: boolean;
}

export interface GamificationBalances {
  points: number;
  ai_tokens: number;
}

export interface GamificationStreak {
  current: number;
  longest: number;
}

export interface GamificationOverview {
  balances: GamificationBalances;
  streak: GamificationStreak;
  rank: number | null;
  missions: Mission[];
  redemption: {
    points_per_token: number;
  };
}

export interface GamificationQuery {
  portfolio_type?: PortfolioType;
  frequency?: MissionFrequency;
  status?: MissionStatus;
  limit?: number;
}

export interface ClaimMissionResponse {
  success: boolean;
  mission_id: number;
  points_received: number;
  points_balance: number;
}

export interface RedeemTokensResponse {
  success: boolean;
  spent_points: number;
  received_tokens: number;
  balance: {
    points_balance: number;
    ai_token_balance: number;
  };
}

export interface LeaderboardEntry {
  rank: number;
  id: number;
  username: string;
  full_name: string;
  avatar_url: string | null;
  points_balance: number;
  current_streak: number;
  longest_streak: number;
}

export interface RecordGamificationEventPayload {
  event_type: MissionEventType;
  portfolio_type?: PortfolioType;
  increment?: number;
}

export interface RecordGamificationEventResponse {
  event_type: MissionEventType;
  updated_count: number;
  missions: Array<{
    id: number;
    mission_id: number;
    user_id: number;
    current_val: number;
    status: MissionStatus;
    period_key: string;
  }>;
}

export interface ApiErrorResponse {
  message?: string | string[];
}

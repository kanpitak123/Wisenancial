import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MissionAudience,
  MissionEventType,
  MissionFrequency,
  MissionStatus,
  PortfolioType,
  Prisma,
  type user_missions,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GAMIFICATION_CONSTANTS } from './gamification.constants';
import { GamificationQueryDto } from './dto/gamification-query.dto';

@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: number, query: GamificationQueryDto) {
    const [user, missions, rank] = await Promise.all([
      this.prisma.users.findUnique({
        where: { id: userId },
        select: {
          points_balance: true,
          ai_token_balance: true,
          current_streak: true,
          longest_streak: true,
        },
      }),
      this.getMissions(userId, query),
      this.getUserRank(userId),
    ]);

    if (!user) {
      throw new NotFoundException('ไม่พบผู้ใช้');
    }

    return {
      balances: {
        points: user.points_balance,
        ai_tokens: user.ai_token_balance,
      },
      streak: {
        current: user.current_streak,
        longest: user.longest_streak,
      },
      rank,
      missions,
      redemption: {
        points_per_token: GAMIFICATION_CONSTANTS.pointsPerToken,
      },
    };
  }

  async getMissions(userId: number, query: GamificationQueryDto) {
    await this.ensureAssignedMissions(
      userId,
      query.portfolio_type,
      query.frequency ?? MissionFrequency.DAILY,
    );

    const rows = await this.prisma.user_missions.findMany({
      where: {
        user_id: userId,
        ...(query.status
          ? {
              status: query.status,
            }
          : {}),
        ...(query.frequency || query.portfolio_type
          ? {
              missions: {
                ...(query.frequency
                  ? {
                      frequency: query.frequency,
                    }
                  : {}),
                ...(query.portfolio_type
                  ? {
                      audience: {
                        in: [
                          MissionAudience.ALL,
                          this.toAudience(query.portfolio_type),
                        ],
                      },
                    }
                  : {}),
              },
            }
          : {}),
      },
      include: {
        missions: true,
      },
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      take: query.limit ?? 20,
    });

    return rows.map((row) => ({
      id: row.mission_id,
      user_mission_id: row.id,
      code: row.missions.code,
      title: row.missions.title,
      description: row.missions.description,
      points: row.missions.points,
      target_count: row.missions.target_count,
      progress: row.current_val,
      status: row.status,
      frequency: row.missions.frequency,
      zone: row.missions.zone,
      audience: row.missions.audience,
      event_type: row.missions.event_type,
      period_key: row.period_key,
      completed_at: row.completed_at,
      claimed_at: row.claimed_at,
      expires_at: row.expires_at,
      can_claim: row.status === MissionStatus.COMPLETED,
    }));
  }

  async recordEvent(
    userId: number,
    eventType: MissionEventType,
    portfolioType?: PortfolioType,
    increment = 1,
  ) {
    if (!Number.isInteger(increment) || increment <= 0) {
      throw new BadRequestException('increment ต้องมากกว่า 0');
    }

    const audiences = portfolioType
      ? [MissionAudience.ALL, this.toAudience(portfolioType)]
      : [MissionAudience.ALL];

    const now = new Date();

    const missions = await this.prisma.missions.findMany({
      where: {
        is_active: true,
        event_type: eventType,
        audience: {
          in: audiences,
        },
        AND: [
          {
            OR: [
              {
                starts_at: null,
              },
              {
                starts_at: {
                  lte: now,
                },
              },
            ],
          },
          {
            OR: [
              {
                ends_at: null,
              },
              {
                ends_at: {
                  gte: now,
                },
              },
            ],
          },
        ],
      },
    });

    const results: user_missions[] = [];

    for (const mission of missions) {
      const assignment = await this.ensureMissionAssignment(userId, mission);

      if (
        assignment.status === MissionStatus.CLAIMED ||
        assignment.status === MissionStatus.EXPIRED
      ) {
        continue;
      }

      const nextValue = Math.min(
        mission.target_count,
        assignment.current_val + increment,
      );

      const completed = nextValue >= mission.target_count;

      const updated = await this.prisma.user_missions.update({
        where: {
          id: assignment.id,
        },
        data: {
          current_val: nextValue,
          status: completed
            ? MissionStatus.COMPLETED
            : MissionStatus.IN_PROGRESS,
          completed_at: completed ? (assignment.completed_at ?? now) : null,
        },
      });

      results.push(updated);
    }

    await this.updateStreak(userId, now);

    return {
      event_type: eventType,
      updated_count: results.length,
      missions: results,
    };
  }

  async claimMission(userId: number, missionId: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const userMission = await tx.user_missions.findFirst({
          where: {
            user_id: userId,
            mission_id: missionId,
            status: {
              in: [MissionStatus.COMPLETED, MissionStatus.CLAIMED],
            },
          },
          include: {
            missions: true,
          },
          orderBy: {
            created_at: 'desc',
          },
        });

        if (!userMission) {
          throw new NotFoundException('ไม่พบภารกิจที่สำเร็จแล้ว');
        }

        if (userMission.status === MissionStatus.CLAIMED) {
          throw new BadRequestException('รับรางวัลไปแล้ว');
        }

        if (userMission.current_val < userMission.missions.target_count) {
          throw new BadRequestException('ภารกิจยังไม่สำเร็จ');
        }

        const now = new Date();

        await tx.user_missions.update({
          where: {
            id: userMission.id,
          },
          data: {
            status: MissionStatus.CLAIMED,
            claimed_at: now,
          },
        });

        const reward = userMission.missions.points;

        const user = await tx.users.update({
          where: { id: userId },
          data: {
            points_balance: {
              increment: reward,
            },
          },
          select: {
            points_balance: true,
          },
        });

        await tx.point_transactions.create({
          data: {
            user_id: userId,
            amount: reward,
            type: 'MISSION_REWARD',
            description: `Mission ${userMission.missions.code}: ${userMission.missions.title}`,
          },
        });

        return {
          success: true,
          mission_id: missionId,
          points_received: reward,
          points_balance: user.points_balance,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async redeemPointsToTokens(userId: number, tokensToRedeem: number) {
    const requiredPoints =
      tokensToRedeem * GAMIFICATION_CONSTANTS.pointsPerToken;

    return this.prisma.$transaction(
      async (tx) => {
        const user = await tx.users.findUnique({
          where: { id: userId },
          select: {
            points_balance: true,
          },
        });

        if (!user) {
          throw new NotFoundException('ไม่พบผู้ใช้');
        }

        if (user.points_balance < requiredPoints) {
          throw new BadRequestException(
            `แต้มไม่พอ ต้องใช้ ${requiredPoints} แต้ม`,
          );
        }

        const updated = await tx.users.update({
          where: { id: userId },
          data: {
            points_balance: {
              decrement: requiredPoints,
            },
            ai_token_balance: {
              increment: tokensToRedeem,
            },
          },
          select: {
            points_balance: true,
            ai_token_balance: true,
          },
        });

        await tx.point_transactions.create({
          data: {
            user_id: userId,
            amount: -requiredPoints,
            type: 'REDEEM_TO_TOKEN',
            description: `Redeemed ${tokensToRedeem} AI tokens`,
          },
        });

        await tx.token_transactions.create({
          data: {
            user_id: userId,
            amount: tokensToRedeem,
            type: 'REDEEM_FROM_POINT',
            description: `Redeemed from ${requiredPoints} points`,
          },
        });

        return {
          success: true,
          spent_points: requiredPoints,
          received_tokens: tokensToRedeem,
          balance: updated,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async getLeaderboard(
    limit: number = GAMIFICATION_CONSTANTS.leaderboardLimit,
  ) {
    const safeLimit = Math.min(100, Math.max(1, limit));

    const users = await this.prisma.users.findMany({
      orderBy: [
        {
          points_balance: 'desc',
        },
        {
          longest_streak: 'desc',
        },
        { id: 'asc' },
      ],
      take: safeLimit,
      select: {
        id: true,
        username: true,
        full_name: true,
        avatar_url: true,
        points_balance: true,
        current_streak: true,
        longest_streak: true,
      },
    });

    return users.map((user, index) => ({
      rank: index + 1,
      ...user,
    }));
  }

  private async getUserRank(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        points_balance: true,
      },
    });

    if (!user) {
      return null;
    }

    const ahead = await this.prisma.users.count({
      where: {
        points_balance: {
          gt: user.points_balance,
        },
      },
    });

    return ahead + 1;
  }

  private async ensureAssignedMissions(
    userId: number,
    portfolioType: PortfolioType | undefined,
    frequency: MissionFrequency,
  ) {
    const now = new Date();
    const audiences = portfolioType
      ? [MissionAudience.ALL, this.toAudience(portfolioType)]
      : [MissionAudience.ALL];

    const missions = await this.prisma.missions.findMany({
      where: {
        is_active: true,
        frequency,
        audience: {
          in: audiences,
        },
        AND: [
          {
            OR: [
              {
                starts_at: null,
              },
              {
                starts_at: {
                  lte: now,
                },
              },
            ],
          },
          {
            OR: [
              {
                ends_at: null,
              },
              {
                ends_at: {
                  gte: now,
                },
              },
            ],
          },
        ],
      },
      orderBy: {
        id: 'asc',
      },
      take:
        frequency === MissionFrequency.DAILY
          ? GAMIFICATION_CONSTANTS.dailyMissionLimit
          : undefined,
    });

    for (const mission of missions) {
      await this.ensureMissionAssignment(userId, mission);
    }
  }

  private async ensureMissionAssignment(
    userId: number,
    mission: {
      id: number;
      frequency: MissionFrequency;
    },
  ) {
    const period = this.getPeriod(mission.frequency);

    return this.prisma.user_missions.upsert({
      where: {
        user_id_mission_id_period_key: {
          user_id: userId,
          mission_id: mission.id,
          period_key: period.key,
        },
      },
      update: {},
      create: {
        user_id: userId,
        mission_id: mission.id,
        period_key: period.key,
        expires_at: period.expiresAt,
      },
    });
  }

  private getPeriod(frequency: MissionFrequency) {
    const now = new Date();

    if (frequency === MissionFrequency.ONCE) {
      return {
        key: 'ONCE',
        expiresAt: null,
      };
    }

    if (frequency === MissionFrequency.DAILY) {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      return {
        key: this.dateKey(now),
        expiresAt: end,
      };
    }

    if (frequency === MissionFrequency.WEEKLY) {
      const start = new Date(now);
      const day = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      return {
        key: `${start.getFullYear()}-W${this.weekNumber(start)}`,
        expiresAt: end,
      };
    }

    const end = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    return {
      key: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        '0',
      )}`,
      expiresAt: end,
    };
  }

  private async updateStreak(userId: number, now: Date) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        current_streak: true,
        longest_streak: true,
        last_active_date: true,
      },
    });

    if (!user) {
      return;
    }

    const today = this.dateKey(now);
    const last = user.last_active_date
      ? this.dateKey(user.last_active_date)
      : null;

    if (last === today) {
      return;
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const nextStreak =
      last === this.dateKey(yesterday) ? user.current_streak + 1 : 1;

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        current_streak: nextStreak,
        longest_streak: Math.max(user.longest_streak, nextStreak),
        last_active_date: now,
      },
    });
  }

  private toAudience(type: PortfolioType) {
    return type === PortfolioType.TRADER
      ? MissionAudience.TRADER
      : MissionAudience.INVESTOR;
  }

  private dateKey(date: Date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private weekNumber(date: Date) {
    const first = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - first.getTime()) / 86_400_000);

    return Math.ceil((days + first.getDay() + 1) / 7);
  }
}

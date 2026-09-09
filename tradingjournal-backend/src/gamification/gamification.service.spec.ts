import { GamificationService } from './gamification.service';

describe('GamificationService', () => {
  it('should be defined', () => {
    const service =
      new GamificationService(
        {} as any,
      );

    expect(service).toBeDefined();
  });
});

/**
 * §7 QA bug: หน้าการ์ด "อันดับ" ของตัวเอง (getUserRank) เคยนับแค่
 * `points_balance > ของฉัน` ส่วนลิสต์ leaderboard เต็ม (getLeaderboard) เรียงด้วย
 * points_balance desc, longest_streak desc, id asc — บัญชีที่คะแนนเท่ากับคนอื่น
 * (เช่นบัญชีใหม่ 0 แต้ม ถ้า 0 คือคะแนนสูงสุดตอนนั้น) จึงได้ "#1" เสมอจากการ์ด ทั้งที่
 * ตำแหน่งจริงในลิสต์ต่ำกว่านั้นมากตาม tie-break ที่เหลือ
 */
describe('GamificationService.getUserRank — เรียงลำดับให้ตรงกับ getLeaderboard (§7)', () => {
  function makeService(
    user: { points_balance: number; longest_streak: number } | null,
    aheadCount: number,
  ) {
    const findUnique = jest.fn().mockResolvedValue(user);
    const count = jest.fn().mockResolvedValue(aheadCount);
    const service = new GamificationService({
      users: { findUnique, count },
    } as any);

    return { service, findUnique, count };
  }

  it('คะแนนเท่ากับคนอื่น (บัญชีใหม่ 0 แต้ม) -> นับ ahead ด้วย tie-break เดียวกับ getLeaderboard (longest_streak แล้วค่อย id) ไม่ใช่แค่ points_balance', async () => {
    const { service, count } = makeService({ points_balance: 0, longest_streak: 0 }, 10);

    const rank = await (service as any).getUserRank(42);

    expect(rank).toBe(11);
    expect(count).toHaveBeenCalledWith({
      where: {
        OR: [
          { points_balance: { gt: 0 } },
          { points_balance: 0, longest_streak: { gt: 0 } },
          { points_balance: 0, longest_streak: 0, id: { lt: 42 } },
        ],
      },
    });
  });

  it('นำโด่งไม่มีใครเสมอ -> ahead = 0 -> อันดับ 1', async () => {
    const { service } = makeService({ points_balance: 500, longest_streak: 12 }, 0);

    const rank = await (service as any).getUserRank(1);

    expect(rank).toBe(1);
  });

  it('ไม่พบผู้ใช้ -> คืน null ไม่ throw', async () => {
    const { service } = makeService(null, 0);

    const rank = await (service as any).getUserRank(999);

    expect(rank).toBeNull();
  });
});

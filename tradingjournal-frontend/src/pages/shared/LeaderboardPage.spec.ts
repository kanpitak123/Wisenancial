/**
 * LeaderboardPage — หน้าที่มาปิดช่องว่างของ GamificationStore
 *
 * fetchLeaderboard() กับ redeemTokens() มีในสโตร์มาตลอดแต่ไม่เคยมีใครเรียก (MissionDialog
 * ใช้แค่ missions/claim) เทสชุดนี้จึงเน้นสองเรื่องที่พังเงียบได้ง่ายที่สุด:
 *   1. ภารกิจต้องไม่หายไปจากหน้า แม้ backend ส่ง zone ที่หน้ายังไม่รู้จัก
 *   2. ปุ่มแลกแต้มต้องกดไม่ได้ตอนแต้มไม่ถึง 1 โทเคน (ไม่งั้นยิงไปโดน 400 เปล่าๆ)
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LeaderboardPage from './LeaderboardPage.vue';
import { useUserStore } from 'stores/UserStore';
import type * as GamificationServiceModule from 'src/services/gamification.service';

const fetchOverview = vi.fn();
const fetchLeaderboard = vi.fn();
const claimMission = vi.fn();
const redeemTokens = vi.fn();

vi.mock('src/services/gamification.service', async (importOriginal) => ({
  ...(await importOriginal<typeof GamificationServiceModule>()),
  gamificationService: {
    fetchOverview: (...args: unknown[]) => fetchOverview(...args),
    fetchLeaderboard: (...args: unknown[]) => fetchLeaderboard(...args),
    fetchMissions: vi.fn().mockResolvedValue([]),
    claimMission: (...args: unknown[]) => claimMission(...args),
    redeemTokens: (...args: unknown[]) => redeemTokens(...args),
    recordEvent: vi.fn(),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: '/Leaderboard', query: {}, meta: {} }),
}));

const mission = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  user_mission_id: id,
  code: `M${id}`,
  title: `ภารกิจ ${id}`,
  description: 'ทำให้ครบแล้วรับแต้ม',
  points: 50,
  target_count: 5,
  progress: 2,
  status: 'IN_PROGRESS',
  frequency: 'DAILY',
  zone: 'DAILY',
  audience: 'ALL',
  event_type: 'LOGIN',
  period_key: '2026-08-20',
  completed_at: null,
  claimed_at: null,
  expires_at: null,
  can_claim: false,
  ...over,
});

const entry = (rank: number, id: number, points: number) => ({
  rank,
  id,
  username: `user${id}`,
  full_name: `User ${id}`,
  avatar_url: null,
  points_balance: points,
  current_streak: 3,
  longest_streak: 9,
});

const overview = (missions: unknown[], points = 250) => ({
  balances: { points, ai_tokens: 4 },
  streak: { current: 3, longest: 9 },
  rank: 7,
  missions,
  redemption: { points_per_token: 10 },
});

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(LeaderboardPage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

describe('LeaderboardPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fetchOverview.mockResolvedValue(overview([]));
    fetchLeaderboard.mockResolvedValue([]);
  });

  it('โหลดสำเร็จ -> โชว์อันดับ/แต้ม/streak ของผู้ใช้จาก overview', async () => {
    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="lb-stat-rank"]').text()).toContain('#7');
    expect(wrapper.find('[data-test="lb-stat-points"]').text()).toContain('250');
    expect(wrapper.find('[data-test="lb-stat-streak"]').text()).toContain('3');
  });

  it('สามอันดับแรกขึ้นกระดานเกียรติยศ ที่เหลือลงลิสต์ด้านล่าง', async () => {
    fetchLeaderboard.mockResolvedValue([
      entry(1, 11, 900),
      entry(2, 12, 800),
      entry(3, 13, 700),
      entry(4, 14, 600),
    ]);

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="lb-hall-of-fame"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="lb-podium-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="lb-podium-3"]').exists()).toBe(true);
    // อันดับ 4 ต้องไม่ไปโผล่บนแท่น
    expect(wrapper.find('[data-test="lb-podium-4"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="lb-row-4"]').exists()).toBe(true);
  });

  it('แถวของตัวเองถูกไฮไลต์ให้หาเจอในลิสต์ยาวๆ', async () => {
    useUserStore().profile = { id: 14, username: 'user14' } as never;
    fetchLeaderboard.mockResolvedValue([
      entry(1, 11, 900),
      entry(2, 12, 800),
      entry(3, 13, 700),
      entry(4, 14, 600),
    ]);

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="lb-row-4"]').classes()).toContain('is-me');
  });

  it('ยังไม่มีใครบนกระดาน -> ขึ้น empty state ไม่ใช่ลิสต์ว่าง', async () => {
    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="lb-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="lb-hall-of-fame"]').exists()).toBe(false);
  });

  it('ภารกิจถูกจัดกลุ่มตามโซน และโซนที่ไม่มีภารกิจต้องไม่ขึ้นหัวข้อเปล่า', async () => {
    fetchOverview.mockResolvedValue(
      overview([
        mission(1, { zone: 'DAILY' }),
        mission(2, { zone: 'DAILY' }),
        mission(3, { zone: 'ACHIEVEMENT' }),
      ]),
    );

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="lb-zone-DAILY"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="lb-zone-ACHIEVEMENT"]').exists()).toBe(true);
    // ไม่มีภารกิจ MONTHLY/INVITE เลย จึงต้องไม่มีหัวข้อโซนโล่งๆ
    expect(wrapper.find('[data-test="lb-zone-MONTHLY"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="lb-zone-INVITE"]').exists()).toBe(false);
  });

  it('zone ที่หน้ายังไม่รู้จักต้องไม่ทำให้ภารกิจหายไปเงียบๆ', async () => {
    fetchOverview.mockResolvedValue(overview([mission(9, { zone: 'SEASONAL' })]));

    const wrapper = await mountPage();

    // ตกลงถัง ACHIEVEMENT ตามตัวเดิม ดีกว่าหายไปจากหน้าโดยไม่มีใครรู้
    expect(wrapper.find('[data-test="lb-zone-ACHIEVEMENT"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="lb-mission-9"]').exists()).toBe(true);
  });

  it('หัวโซนนับภารกิจที่ทำเสร็จแล้วรวมทั้งที่กดรับรางวัลไปแล้ว', async () => {
    fetchOverview.mockResolvedValue(
      overview([
        mission(1, { status: 'IN_PROGRESS' }),
        mission(2, { status: 'COMPLETED', can_claim: true }),
        mission(3, { status: 'CLAIMED' }),
      ]),
    );

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="lb-zone-DAILY"]').text()).toContain('2/3');
  });

  it('ภารกิจที่พร้อมรับรางวัลมีปุ่มกดรับ ส่วนที่รับแล้วปุ่มถูกปิด', async () => {
    fetchOverview.mockResolvedValue(
      overview([
        mission(1, { status: 'COMPLETED', can_claim: true }),
        mission(2, { status: 'CLAIMED' }),
      ]),
    );

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="lb-claim-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="lb-claimed-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="lb-claim-2"]').exists()).toBe(false);
  });

  it('กดรับรางวัล -> ยิง claim ด้วย id ของภารกิจนั้น', async () => {
    fetchOverview.mockResolvedValue(
      overview([mission(1, { status: 'COMPLETED', can_claim: true })]),
    );
    claimMission.mockResolvedValue({
      success: true,
      mission_id: 1,
      points_received: 50,
      points_balance: 300,
    });

    const wrapper = await mountPage();

    await wrapper.find('[data-test="lb-claim-1"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(claimMission).toHaveBeenCalledWith(1);
  });

  it('แต้มไม่ถึง 1 โทเคน -> ปุ่มแลกกดไม่ได้', async () => {
    fetchOverview.mockResolvedValue(overview([], 7));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="lb-redeem-btn"]').attributes('disabled')).toBeDefined();
  });

  it('แต้มพอ -> แลกได้เท่าจำนวนโทเคนที่ปัดลงแล้ว', async () => {
    // 250 แต้ม / 10 แต้มต่อโทเคน = 25 โทเคน
    redeemTokens.mockResolvedValue({
      success: true,
      spent_points: 250,
      received_tokens: 25,
      balance: { points_balance: 0, ai_token_balance: 29 },
    });

    const wrapper = await mountPage();

    await wrapper.find('[data-test="lb-redeem-btn"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(redeemTokens).toHaveBeenCalledWith(25);
  });
});

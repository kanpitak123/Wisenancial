<script setup lang="ts">
import { ref, computed, onMounted, watch, defineComponent, h } from 'vue';
import { useQuasar } from 'quasar';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import VueApexCharts from 'vue3-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { useAnalyticsStore } from 'stores/AnalyticsStore';
import { useAiStore } from 'stores/AiStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useGlobalFilterStore } from 'stores/GlobalFilterStore';
import { useInvestorPortfolioStore } from 'stores/InvestorPortfolioStore';
import { WsUpgradeNotice } from 'src/components/ui';
import AiPortfolioAdvisorCard from 'components/analytics/AiPortfolioAdvisorCard.vue';
import AiRiskAnalysisCard from 'components/analytics/AiRiskAnalysisCard.vue';
import PerformersSection from 'components/analytics/PerformersSection.vue';
import AverageCostCalculator from 'components/analytics/AverageCostCalculator.vue';
import PlExportCard from 'components/analytics/PlExportCard.vue';
import DividendTaxCard from 'components/analytics/DividendTaxCard.vue';
import DcaPredictorCard from 'components/analytics/DcaPredictorCard.vue';
import type { PortfolioRiskHolding } from 'src/types/ai.types';

// ── AiInsightPanel (inline component) ────────────────────────────────────────
const AiInsightPanel = defineComponent({
  name: 'AiInsightPanel',
  props: {
    chartType: { type: String, required: true },
    insight: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    lines: { type: Array as () => string[], default: () => [] },
  },
  emits: ['refresh'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          class: 'ai-panel h-full flex column',
          style: 'min-height: 300px',
        },
        [
          // Header
          h('div', { class: 'ai-panel-header row items-center justify-between q-mb-md' }, [
            h('div', { class: 'row items-center q-gutter-xs' }, [
              h('div', { class: 'ai-icon-box' }, [
                h(
                  'span',
                  { class: 'material-icons', style: 'font-size:16px;color:#fff' },
                  'auto_awesome',
                ),
              ]),
              h('span', { class: 'text-subtitle2 text-weight-bolder ai-title' }, 'Auto Insights'),
            ]),
            h(
              'button',
              {
                class: 'ai-refresh-btn',
                disabled: props.loading,
                onClick: () => emit('refresh'),
              },
              props.loading ? '...' : '↻ Refresh',
            ),
          ]),
          // Content
          props.loading
            ? h('div', { class: 'flex flex-center column flex-grow q-py-lg' }, [
                h('div', { class: 'ai-spinner q-mb-sm' }),
                h('div', { class: 'text-caption ai-muted' }, 'Analyzing your data…'),
              ])
            : props.lines.length
              ? h(
                  'div',
                  { class: 'ai-lines flex-grow' },
                  props.lines.map((line, i) =>
                    h('div', { key: i, class: 'ai-line' }, [
                      h('div', { class: 'ai-line-dot' }),
                      h('div', { class: 'ai-line-text' }, line),
                    ]),
                  ),
                )
              : h('div', { class: 'flex flex-center column flex-grow q-py-lg' }, [
                  h('span', { class: 'material-icons ai-empty-icon' }, 'insights'),
                  h('div', { class: 'text-caption ai-muted q-mt-sm' }, 'Click Refresh to analyze'),
                ]),
        ],
      );
  },
});

const $q = useQuasar();
const store = useAnalyticsStore();
const aiStore = useAiStore();
const portStore = usePortfolioStore();
const filterStore = useGlobalFilterStore();
const { safeLoad } = useSafeLoad();

// ── Store adapter layer (map legacy page calls to the refactored AnalyticsStore) ──
const tabsLoaded = ref(false);

const analyticsRange = () => ({
  ...(filterStore.apiStartDate ? { from: filterStore.apiStartDate } : {}),
  ...(filterStore.apiEndDate ? { to: filterStore.apiEndDate } : {}),
});

const loadDashboard = async () => {
  store.setDateRange(analyticsRange());
  await store.initialize(portStore.activePortfolioId ?? undefined);
};

// month เป็น 0-based
const loadCalendarData = async (month: number, year: number) => {
  const portfolioId = portStore.activePortfolioId;
  if (portfolioId === null) return;

  // ปฏิทิน daily P&L คิดจากรายการเทรดที่ปิดแล้ว จึงเป็นของพอร์ต TRADER เท่านั้น
  // การ์ดปฏิทินก็ v-if="store.isTrader" อยู่แล้ว และ AnalyticsService.assertType()
  // ตอบ 400 "Endpoint นี้ใช้กับ TRADER portfolio เท่านั้น" ถ้าพอร์ต INVESTOR ยิงเข้ามา
  // -> กันไว้ตรงนี้ที่เดียวเพื่อคุมทุกผู้เรียก (loadAllData / watcher วันที่ / prev-nextMonth)
  if (portStore.activePortfolio?.portfolio_type !== 'TRADER') return;

  const monthStr = String(month + 1).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  await store.loadDailyPnl(
    portfolioId,
    `${year}-${monthStr}-01`,
    `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
  );
};

const loadAnalysisTabs = async () => {
  await store.loadDetails(analyticsRange());
  tabsLoaded.value = true;
};

// ยิงขอ AI insight ของกราฟผ่าน AiStore (คิดเครดิตฝั่ง backend)
const analyze = (key: string, data: unknown) => {
  const portfolioId = portStore.activePortfolioId;
  return aiStore.analyzeChart({
    key,
    // ก่อน loadCore() จบ store.portfolioType ยังเป็น null — ใช้ประเภทของพอร์ตที่ active
    // เป็นตัวสำรองแทนการ fallback เป็น 'TRADER' เสมอ ไม่งั้นพอร์ตหุ้นจะถูกวิเคราะห์ผิดโหมด
    portfolioType: store.portfolioType ?? portStore.activeType,
    chartType: key,
    data,
    ...(portfolioId !== null ? { portfolioId } : {}),
  });
};

// Toggle timeframe ของกราฟ Account Growth ผ่าน AnalyticsStore.setTimeframe
const chartTimeframe = computed({
  get: () => store.timeframe,
  set: (value) => {
    void store.setTimeframe(value);
  },
});

const monthlySummary = computed(() => {
  const s = store.summary;
  const trader = s && 'total_trades' in s ? s : null;
  return {
    totalTrades: trader?.total_trades ?? 0,
    winRate: trader?.win_rate ?? 0,
    wins: trader?.wins ?? 0,
    losses: trader?.losses ?? 0,
  };
});

// ─── Main tab ─────────────────────────────────────────────────────────────────
type MainTab = 'dashboard' | 'growth' | 'performance' | 'winrate' | 'pnl' | 'allocation'
  | 'timeline' | 'ai' | 'tools';

const activeTab = ref<MainTab>('dashboard');

/**
 * ชุดแท็บของแต่ละโหมด
 *
 * Win Rate / Strategy / Emotion / Entry Reason เป็นคอนเซปต์ของการเทรด ไม่มีใน
 * พอร์ตหุ้น — AnalyticsStore.loadDetails() ก็โหลด timeline/allocation ให้ฝั่ง
 * INVESTOR แทนอยู่แล้ว แท็บจึงต้องเปลี่ยนตามให้ตรงกัน
 */
const TRADER_TABS = [
  { name: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { name: 'growth', icon: 'bar_chart', label: 'Monthly Growth' },
  { name: 'performance', icon: 'insights', label: 'Performance' },
  { name: 'winrate', icon: 'emoji_events', label: 'Win Rate' },
  { name: 'pnl', icon: 'attach_money', label: 'PnL Charts' },
] as const;

const INVESTOR_TABS = [
  { name: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { name: 'allocation', icon: 'donut_large', label: 'Allocation' },
  { name: 'timeline', icon: 'timeline', label: 'Timeline' },
  { name: 'ai', icon: 'auto_awesome', label: 'AI Insights' },
  { name: 'tools', icon: 'construction', label: 'Planning & Tools' },
] as const;

const mainTabs = computed(() => (store.isInvestor ? INVESTOR_TABS : TRADER_TABS));

// สลับโหมดแล้วแท็บเดิมอาจไม่มีอยู่ในชุดใหม่ -> เด้งกลับ Dashboard ที่มีทั้งสองโหมด
watch(mainTabs, (tabs) => {
  if (!tabs.some((tab) => tab.name === activeTab.value)) {
    activeTab.value = 'dashboard';
  }
});

// ─── Analysis sub-tabs ────────────────────────────────────────────────────────
const perfTab = ref<'strategy' | 'emotion' | 'trend' | 'entry_reason' | 'time_slot'>('strategy');
const winTab = ref<'position' | 'day' | 'month' | 'time'>('position');
const pnlTab = ref<'time' | 'day' | 'month'>('time');

// ─── แท็บ AI Insights / Planning & Tools (โหมด Stock) ─────────────────────────
const investorStore = useInvestorPortfolioStore();
const advancedLoaded = ref(false);

/**
 * performers อยู่ในชุด loadAdvanced() ซึ่งทุกเส้นยัง gate ด้วย PaidTierGuard
 * 403 จึงไม่ใช่ error ที่ต้องเด้ง notify — store ตั้ง paidAccessDenied ให้แล้ว
 * และ PerformersSection จะขึ้นการ์ดอัปเกรดแทน
 */
const loadAdvancedOnce = async () => {
  if (advancedLoaded.value || store.portfolioId === null) return;

  advancedLoaded.value = true;

  try {
    await store.loadAdvanced();
  } catch {
    // paidAccessDenied / error ถูกเก็บไว้ใน store แล้ว
  }
};

/**
 * section ฝั่ง Planning & Tools อ่านจาก InvestorPortfolioStore (sales / holdings)
 *
 * ใช้ store.portfolioId ไม่ใช่ portStore.activePortfolioId — ตัวใน AnalyticsStore คือตัวที่
 * resolve แล้วและเป็นตัวเดียวกับที่ทุก endpoint บนหน้านี้ยิงไป
 */
const loadInvestorTools = async () => {
  const portfolioId = store.portfolioId;

  if (portfolioId === null || investorStore.portfolioId === portfolioId) return;

  await safeLoad(() => investorStore.load(portfolioId), 'โหลดข้อมูลพอร์ตหุ้นไม่สำเร็จ');
};

/** หุ้นที่ถืออยู่ ในรูปแบบที่ /ai/portfolio/risk-analysis รับ */
const riskHoldings = computed<PortfolioRiskHolding[]>(() => {
  const holdings = store.holdings;
  const total = holdings.reduce(
    (sum, item) => sum + Number(item.market_value ?? item.cost_basis ?? 0),
    0,
  );

  return holdings.map((item) => {
    const value = Number(item.market_value ?? item.cost_basis ?? 0);

    return {
      symbol: item.symbol,
      quantity: Number(item.shares ?? item.quantity ?? 0),
      ...(total > 0 ? { weight: value / total } : {}),
      ...(item.market_price !== null ? { currentPrice: Number(item.market_price) } : {}),
    };
  });
});

/** ตัวเลือกสัญลักษณ์ของฟอร์ม DCA — หุ้นที่ถืออยู่จริงมาก่อน ผู้ใช้พิมพ์ตัวอื่นเพิ่มได้ */
// ==========================================
// Lifecycle & Watchers
// ==========================================

/**
 * 🌟 ฟังก์ชันแยกสำหรับโหลดข้อมูลทั้งหมด (เพื่อเรียกซ้ำได้)
 *
 * ใช้ allSettled ไม่ใช่ await ต่อกันเป็นทอด ๆ — endpoint เดียวพังต้องไม่ลากทั้งหน้าไปด้วย
 * (แพทเทิร์นเดียวกับ AnalyticsStore.loadDetails() ฝั่ง TRADER ที่แยก behavioral ออกจาก
 * monthlyGrowth/winRate) ก่อนหน้านี้ปฏิทินพังตัวเดียวแล้ว loadDashboard() ที่โหลดสำเร็จ
 * ไปแล้วก็ถูกโยน error ทับจน Dashboard/Allocation/Timeline/AI Insights/Planning & Tools
 * ว่างตามไปหมด
 */
const loadAllData = async () => {
  if (!portStore.activePortfolio) return; // ถ้าพอร์ตยังไม่มี ให้หยุดรอก่อน

  // ปฏิทินวิ่งตามเดือนล่าสุดของช่วงวันที่ที่เลือกไว้
  if (filterStore.apiEndDate) {
    const d = new Date(filterStore.apiEndDate);
    currentDate.value = new Date(d.getFullYear(), d.getMonth(), 1);
  }

  const results = await Promise.allSettled([
    // 1. โหลดกราฟและ Summary
    loadDashboard(),
    // 2. โหลดข้อมูลปฏิทิน (loadCalendarData ข้ามให้เองถ้าไม่ใช่พอร์ต TRADER)
    ...(filterStore.apiEndDate
      ? [loadCalendarData(currentDate.value.getMonth(), currentDate.value.getFullYear())]
      : []),
  ]);

  // ทุกตัวได้ยิงและเก็บผลของตัวเองแล้ว ค่อยรายงานตัวที่พังให้ safeLoad เด้งเตือน
  const failure = results.find((result) => result.status === 'rejected');

  if (failure?.status === 'rejected') {
    throw failure.reason;
  }
};

onMounted(async () => {
  // โหลดพอร์ตโฟลิโอให้เสร็จก่อน
  if (portStore.portfolios.length === 0) {
    await safeLoad(() => portStore.loadPortfolios(), 'โหลดพอร์ตโฟลิโอไม่สำเร็จ');
  }

  // พอพอร์ตมาแล้ว ค่อยยิงดึงข้อมูล Analytics
  if (portStore.activePortfolio) {
    await safeLoad(() => loadAllData(), 'โหลดข้อมูล Analytics ไม่สำเร็จ');
  }
});

const TAB_LOAD_FAILED = 'โหลดข้อมูลแท็บวิเคราะห์ไม่สำเร็จ';

/** โหลดข้อมูลของแท็บที่เปิดอยู่ — ใช้ร่วมกันทั้งตอนเปลี่ยนพอร์ต เปลี่ยนวันที่ และสลับแท็บ */
const loadActiveTabData = async () => {
  // loadAnalysisTabs() ต้องมีพอร์ตที่ active จริง ส่วนสองแท็บล่างอ่าน store.portfolioId ที่ resolve แล้ว
  if (activeTab.value !== 'dashboard' && !tabsLoaded.value && portStore.activePortfolio) {
    await loadAnalysisTabs();
  }

  // สองแท็บของโหมด Stock ใช้ข้อมูลคนละชุดกับ loadAnalysisTabs()
  if (activeTab.value === 'ai') {
    await loadAdvancedOnce();
  }

  if (activeTab.value === 'tools') {
    await loadInvestorTools();
  }
};

// 🌟 1. ดักจับถ้า User เปลี่ยนพอร์ตโฟลิโอ ให้โหลด Analytics ใหม่
watch(
  () => portStore.activePortfolio,
  async (newPort) => {
    if (!newPort) return;

    tabsLoaded.value = false;
    // เปลี่ยนพอร์ตแล้ว ชุด advanced ของพอร์ตเดิมใช้ไม่ได้ ต้องยอมให้โหลดใหม่
    advancedLoaded.value = false;

    // แยก safeLoad สองก้อน: ชุด dashboard พังต้องไม่กันไม่ให้แท็บที่เปิดอยู่โหลดข้อมูลของตัวเอง
    await safeLoad(() => loadAllData(), 'โหลดข้อมูล Analytics ไม่สำเร็จ');
    await safeLoad(() => loadActiveTabData(), TAB_LOAD_FAILED);
  },
);

/**
 * 🌟 2. ดักจับการเปลี่ยนวันที่ใน Header (ตัวคุมทั้งเว็บ)
 *
 * เดิมมี watcher ของ [apiStartDate, apiEndDate] สองตัวทำงานซ้ำกัน — เปลี่ยนวันครั้งเดียว
 * ยิง API ซ้ำสองรอบ และตัวที่สองยังยิงปฏิทินโดยไม่เช็คประเภทพอร์ต จึงยุบเหลือตัวเดียว
 * (Hybrid Calendar: loadAllData() ขยับปฏิทินไปเดือนล่าสุดของช่วงวันที่ให้อยู่แล้ว)
 */
watch(
  () => [filterStore.apiStartDate, filterStore.apiEndDate],
  async () => {
    if (!portStore.activePortfolio) return; // กันเหนียว

    tabsLoaded.value = false; // สั่งรีเซ็ตให้โหลด Analysis Tabs ใหม่
    await safeLoad(() => loadAllData(), 'โหลดข้อมูล Analytics ไม่สำเร็จ');
    await safeLoad(() => loadActiveTabData(), TAB_LOAD_FAILED);
  },
);

// 🌟 3. สลับ Tab โหลด Lazy-load
watch(activeTab, async () => {
  await safeLoad(() => loadActiveTabData(), TAB_LOAD_FAILED);
});

// ==========================================
// Summary Cards Setup
// ==========================================
/** สรุปฝั่งหุ้น — อ่านจาก InvestorAnalyticsSummary ที่ store โหลดมาให้แล้ว */
const investorSummary = computed(() => {
  const summary = store.summary;
  return summary && 'invested_cost' in summary ? summary : null;
});

const money = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const investorStats = computed(() => {
  const summary = investorSummary.value;
  const totalPnl = summary?.total_pnl ?? 0;
  const unrealized = summary?.unrealized_pnl ?? 0;

  return [
    {
      label: 'Portfolio Value',
      value: money(summary?.current_value ?? 0),
      icon: 'account_balance_wallet',
      bgClass: 'bg-icon-primary',
      textClass: 'text-primary',
      valClass: 'text-main',
    },
    {
      label: 'Total P&L',
      value: money(totalPnl),
      icon: totalPnl >= 0 ? 'trending_up' : 'trending_down',
      bgClass: totalPnl >= 0 ? 'bg-icon-positive' : 'bg-icon-negative',
      textClass: totalPnl >= 0 ? 'text-positive' : 'text-negative',
      valClass: totalPnl >= 0 ? 'text-positive' : 'text-negative',
    },
    {
      label: 'Unrealized',
      value: money(unrealized),
      icon: 'show_chart',
      bgClass: unrealized >= 0 ? 'bg-icon-positive' : 'bg-icon-negative',
      textClass: unrealized >= 0 ? 'text-positive' : 'text-negative',
      valClass: unrealized >= 0 ? 'text-positive' : 'text-negative',
    },
    {
      label: 'Holdings',
      value: String(summary?.open_holdings ?? 0),
      icon: 'inventory_2',
      bgClass: 'bg-icon-purple',
      textClass: 'text-purple-4',
      valClass: 'text-purple-4',
    },
  ];
});

const traderStats = computed(() => [
  {
    label: 'Total Trades',
    value: monthlySummary.value.totalTrades,
    icon: 'tag',
    bgClass: 'bg-icon-primary',
    textClass: 'text-primary',
    valClass: 'text-main',
  },
  {
    label: 'Win Rate',
    value: `${monthlySummary.value.winRate}%`,
    icon: 'pie_chart',
    bgClass: 'bg-icon-purple',
    textClass: 'text-purple-4',
    valClass: 'text-purple-4',
  },
  {
    label: 'Wins',
    value: monthlySummary.value.wins,
    icon: 'emoji_events',
    bgClass: 'bg-icon-positive',
    textClass: 'text-positive',
    valClass: 'text-positive',
  },
  {
    label: 'Losses',
    value: monthlySummary.value.losses,
    icon: 'trending_down',
    bgClass: 'bg-icon-negative',
    textClass: 'text-negative',
    valClass: 'text-negative',
  },
]);

const summaryStats = computed(() => (store.isInvestor ? investorStats.value : traderStats.value));

// ==========================================
// Chart Setup
// ==========================================
const chartOptions = computed<ApexOptions>(() => ({
  chart: {
    type: 'area',
    toolbar: { show: false },
    fontFamily: 'inherit',
    background: 'transparent',
  },
  colors: ['#4c8a87'],
  fill: {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] },
  },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  xaxis: {
    categories: store.chartData.categories,
    labels: { style: { colors: $q.dark.isActive ? '#7d8c89' : '#789191' } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: {
      formatter: (val: number) => `$${val.toLocaleString()}`,
      style: { colors: $q.dark.isActive ? '#7d8c89' : '#789191' },
    },
  },
  grid: {
    borderColor: $q.dark.isActive ? '#394141' : '#dae7e5',
    strokeDashArray: 4,
  },
  theme: { mode: $q.dark.isActive ? 'dark' : 'light' },
  tooltip: { theme: $q.dark.isActive ? 'dark' : 'light' },
}));

// ==========================================
// Calendar Setup
// ==========================================
const currentDate = ref(new Date());

const calendarMonthYear = computed(() =>
  currentDate.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
);

const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push({ day: null, dateStr: '', pnl: 0 });
  for (let i = 1; i <= daysInMonth; i++) {
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(i).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    days.push({ day: i, dateStr, pnl: store.dailyPnl[dateStr] || 0 }); // 👈 ดึงข้อมูลตรงนี้
  }
  return days;
});

// 🌟 เวลากดเลื่อน ให้ไปดึง API เฉพาะปฏิทินมา (ไม่กวน Store หลัก)
const prevMonth = async () => {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() - 1,
    1,
  );
  await loadCalendarData(currentDate.value.getMonth(), currentDate.value.getFullYear());
};

const nextMonth = async () => {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() + 1,
    1,
  );
  await loadCalendarData(currentDate.value.getMonth(), currentDate.value.getFullYear());
};

// ==========================================
// Analysis Tab — Chart Helpers
// ==========================================
const isDark = computed(() => $q.dark.isActive);

const cc = computed(() => ({
  green: isDark.value ? 'rgba(52,211,153,1)' : 'rgba(16,185,129,1)',
  greenBg: isDark.value ? 'rgba(52,211,153,0.15)' : 'rgba(16,185,129,0.12)',
  red: isDark.value ? 'rgba(248,113,113,1)' : 'rgba(239,68,68,1)',
  redBg: isDark.value ? 'rgba(248,113,113,0.15)' : 'rgba(239,68,68,0.1)',
  accent: isDark.value ? 'rgba(155,197,192,1)' : 'rgba(76,138,135,1)',
  accentBg: isDark.value ? 'rgba(155,197,192,0.15)' : 'rgba(76,138,135,0.12)',
  text: isDark.value ? '#7d8c89' : '#789191',
  grid: isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  cardBg: isDark.value ? '#1f2323' : '#fdfefe',
  border: isDark.value ? '#394141' : '#dae7e5',
}));

/* โดนัท Allocation ไม่เคยกำหนดสีเอง เลยตกไปใช้ชุด default ของ ApexCharts ซึ่งเป็น
   ฟ้า/เหลืองสด ตัดกับหน้าโทน teal — ชุดนี้คุมความสว่างให้ใกล้กันทุกสี จะได้อ่านออก
   ทั้ง light (#f6f9f9) และ dark (#151819) โดยไม่ต้องแยกสองชุด */
const DONUT_PALETTE = [
  '#4c8a87',
  '#c98a3e',
  '#6b8fc4',
  '#a86a8f',
  '#5ca36b',
  '#c9705f',
  '#8a7fc0',
  '#3f7f8f',
];

// ─── Allocation (โหมด Stock) ──────────────────────────────────────────────────
const allocationSeries = computed(() => store.allocation.map((item) => Number(item.value)));

const allocationOpts = computed<ApexOptions>(() => ({
  chart: { type: 'donut', fontFamily: 'inherit', background: 'transparent' },
  colors: DONUT_PALETTE,
  labels: store.allocation.map((item) => item.symbol),
  legend: { position: 'bottom', labels: { colors: cc.value.text } },
  dataLabels: { enabled: true, formatter: (val: number) => `${Number(val).toFixed(1)}%` },
  stroke: { width: 0 },
  theme: { mode: isDark.value ? 'dark' : 'light' },
  tooltip: {
    theme: isDark.value ? 'dark' : 'light',
    y: { formatter: (val: number) => money(val) },
  },
}));

// Shared ApexCharts options factory
function barOpts(extra: Partial<ApexOptions> = {}): ApexOptions {
  return {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'inherit',
    },
    dataLabels: { enabled: false },
    plotOptions: { bar: { borderRadius: 5, columnWidth: '60%' } },
    grid: { borderColor: cc.value.grid, strokeDashArray: 4 },
    xaxis: {
      labels: { style: { colors: cc.value.text, fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: cc.value.text, fontSize: '11px' } } },
    theme: { mode: isDark.value ? 'dark' : 'light' },
    tooltip: { theme: isDark.value ? 'dark' : 'light' },
    legend: { labels: { colors: cc.value.text } },
    ...extra,
  };
}

const fmt = (n: number) =>
  (n >= 0 ? '+' : '') +
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Monthly Growth ────────────────────────────────────────────────────────────
const growthChartSeries = computed(() => [
  {
    name: 'Monthly PnL ($)',
    data: store.monthlyGrowth.map((d) => d.pnl),
  },
]);
const growthChartOpts = computed<ApexOptions>(() =>
  barOpts({
    colors: store.monthlyGrowth.map((d) => (d.pnl >= 0 ? cc.value.green : cc.value.red)),
    xaxis: {
      categories: store.monthlyGrowth.map((d) => d.label),
      labels: { style: { colors: cc.value.text, fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    tooltip: {
      theme: isDark.value ? 'dark' : 'light',
      y: { formatter: (v: number) => fmt(v) },
    },
  }),
);

// ── Performance ───────────────────────────────────────────────────────────────
const currentPerfData = computed(() => store.behavioral?.[perfTab.value] ?? []);

const perfWinLossSeries = computed(() => [
  { name: 'Win', data: currentPerfData.value.map((d) => d.win_count) },
  { name: 'Loss', data: currentPerfData.value.map((d) => d.loss_count) },
]);
const perfWinLossOpts = computed<ApexOptions>(() =>
  barOpts({
    colors: [cc.value.green, cc.value.red],
    xaxis: {
      categories: currentPerfData.value.map((d) => d.label),
      labels: { style: { colors: cc.value.text, fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
  }),
);

const perfPnlSeries = computed(() => [
  {
    name: 'Total PnL ($)',
    data: currentPerfData.value.map((d) => d.total_pnl),
  },
]);
const perfPnlOpts = computed<ApexOptions>(() =>
  barOpts({
    colors: currentPerfData.value.map((d) => (d.total_pnl >= 0 ? cc.value.green : cc.value.red)),
    xaxis: {
      categories: currentPerfData.value.map((d) => d.label),
      labels: { style: { colors: cc.value.text, fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    tooltip: { theme: isDark.value ? 'dark' : 'light', y: { formatter: (v: number) => fmt(v) } },
  }),
);

// ── Win Rate ──────────────────────────────────────────────────────────────────
function winRateSeries(data: { win: number; loss: number }[]) {
  return [
    { name: 'Win', data: data.map((d) => d.win) },
    { name: 'Loss', data: data.map((d) => d.loss) },
  ];
}
function winRateOpts(labels: string[]): ApexOptions {
  return barOpts({
    colors: [cc.value.green, cc.value.red],
    xaxis: {
      categories: labels,
      labels: { style: { colors: cc.value.text, fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
  });
}

// 🟢 1. สร้างตัวกรองเอาเฉพาะ BUY กับ SELL (ตัด deposit/withdraw)
const validPositions = computed(() =>
  (store.winRate?.by_position ?? []).filter((d) => d.position === 'BUY' || d.position === 'SELL'),
);

// 🟢 2. เรียกใช้ validPositions แทน store.winRateByPosition
const wrPositionSeries = computed(() => winRateSeries(validPositions.value));
const wrPositionOpts = computed(() =>
  winRateOpts(validPositions.value.map((d) => d.position ?? '')),
);

const wrDaySeries = computed(() => winRateSeries(store.winRate?.by_day ?? []));
const wrDayOpts = computed(() =>
  winRateOpts((store.winRate?.by_day ?? []).map((d) => d.day ?? '')),
);
const wrMonthSeries = computed(() => winRateSeries(store.winRate?.by_month ?? []));
const wrMonthOpts = computed(() =>
  winRateOpts((store.winRate?.by_month ?? []).map((d) => d.month ?? '')),
);
const wrTimeSeries = computed(() => winRateSeries(store.winRate?.by_slot ?? []));

// 🟢 3. เพิ่มการเอียงตัวหนังสือ -45 องศาให้ Time of Day (00:00-00:30 จะได้ไม่ซ้อนทับกัน)
const wrTimeOpts = computed(() => {
  const opts = winRateOpts((store.winRate?.by_slot ?? []).map((d) => d.slot ?? ''));
  if (opts.xaxis && opts.xaxis.labels) {
    opts.xaxis.labels.rotate = -45;
  }
  return opts;
});

// ── AI Insight helpers ────────────────────────────────────────────────────────
const aiInsight = (key: string) => aiStore.insights[key]?.insight ?? '';
const aiLoading = (key: string) => aiStore.loadingInsight[key] ?? false;
const aiLines = (key: string) =>
  aiInsight(key)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

// ── Refresh handlers ──────────────────────────────────────────────────────────
const refreshGrowth = () => {
  if (store.monthlyGrowth.length) void analyze('monthly_growth', store.monthlyGrowth);
};

const refreshPerf = () => {
  if (!store.behavioral || !perfTab.value) return;
  const validKeys = ['strategy', 'emotion', 'trend', 'entry_reason', 'time_slot'] as const;
  if (!validKeys.includes(perfTab.value)) return;
  const key = `performance_${perfTab.value}`;
  const data = store.behavioral[perfTab.value];
  if (data?.length) void analyze(key, data);
};

const refreshWinRate = () => {
  const map: Record<string, object> = {
    position: store.winRate?.by_position ?? [],
    day: store.winRate?.by_day ?? [],
    month: store.winRate?.by_month ?? [],
    time: store.winRate?.by_slot ?? [],
  };
  const key = `winrate_${winTab.value}`;
  const data = map[winTab.value];
  if (data) void analyze(key, data);
};

const refreshPnl = () => {
  const map: Record<string, object> = {
    time: store.winRate?.pnl_by_slot ?? [],
    day: store.winRate?.pnl_by_day ?? [],
    month: store.winRate?.pnl_by_month ?? [],
  };
  const key = `pnl_${pnlTab.value}`;
  const data = map[pnlTab.value];
  if (data) void analyze(key, data);
};
const pnlTimeSeries = computed(() => [
  {
    name: 'PnL ($)',
    data: (store.winRate?.pnl_by_slot ?? []).map((d) => d.total_pnl),
  },
]);
const pnlTimeOpts = computed<ApexOptions>(() =>
  barOpts({
    colors: (store.winRate?.pnl_by_slot ?? []).map((d) =>
      d.total_pnl >= 0 ? cc.value.green : cc.value.red,
    ),
    xaxis: {
      categories: (store.winRate?.pnl_by_slot ?? []).map((d) => d.slot ?? ''),
      labels: { style: { colors: cc.value.text, fontSize: '10px' }, rotate: -45 },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    tooltip: { theme: isDark.value ? 'dark' : 'light', y: { formatter: (v: number) => fmt(v) } },
  }),
);

function pnlGroupedSeries(data: { profit: number; loss: number }[]) {
  return [
    { name: 'Profit ($)', data: data.map((d) => d.profit) },
    { name: 'Loss ($)', data: data.map((d) => d.loss) },
  ];
}
const pnlDaySeries = computed(() => pnlGroupedSeries(store.winRate?.pnl_by_day ?? []));
const pnlDayOpts = computed(() =>
  barOpts({
    colors: [cc.value.green, cc.value.red],
    xaxis: {
      categories: (store.winRate?.pnl_by_day ?? []).map((d) => d.day ?? ''),
      labels: { style: { colors: cc.value.text, fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
  }),
);
const pnlMonthSeries = computed(() => pnlGroupedSeries(store.winRate?.pnl_by_month ?? []));
const pnlMonthOpts = computed(() =>
  barOpts({
    colors: [cc.value.green, cc.value.red],
    xaxis: {
      categories: (store.winRate?.pnl_by_month ?? []).map((d) => d.month ?? ''),
      labels: { style: { colors: cc.value.text, fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
  }),
);
</script>

<template>
  <q-page class="analytics-page q-pa-md q-pa-sm-md">
    <!-- ── Main Tab Bar ────────────────────────────────────────────────────── -->
    <div class="tabs-sticky">
      <q-tabs
        v-model="activeTab"
        dense
        no-caps
        indicator-color="primary"
        active-color="primary"
        align="left"
        class="main-tabs compact-tabs"
        narrow-indicator
      >
        <q-tab
          v-for="tab in mainTabs"
          :key="tab.name"
          :name="tab.name"
          :icon="tab.icon"
          :label="tab.label"
        />
      </q-tabs>
    </div>

    <!-- loading spinner for analysis tabs -->
    <div
      v-if="store.isLoadingDetails && activeTab !== 'dashboard'"
      class="flex flex-center q-py-xl column text-muted"
    >
      <q-spinner-dots size="40px" color="primary" class="q-mb-sm" />
      <div class="text-caption">Loading analysis data…</div>
    </div>

    <template v-else>
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- TAB: DASHBOARD (หน้าเดิมทั้งหมด)                                   -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <div v-show="activeTab === 'dashboard'">
        <!-- Summary Cards -->
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-6 col-sm-6 col-md-3" v-for="(stat, index) in summaryStats" :key="index">
            <q-card class="dashboard-card stat-card h-full q-pa-md flex column justify-between">
              <div class="kpi-top row items-center no-wrap q-mb-sm">
                <div class="icon-box q-mr-sm" :class="[stat.bgClass, stat.textClass]">
                  <q-icon :name="stat.icon" size="16px" />
                </div>
                <div class="stat-label text-muted text-weight-bold ellipsis">
                  {{ stat.label }}
                </div>
              </div>
              <div>
                <div class="stat-val text-weight-bolder tracking-tight" :class="stat.valClass">
                  {{ stat.value }}
                </div>
              </div>
            </q-card>
          </div>
        </div>

        <!-- Account Growth Chart -->
        <q-card class="dashboard-card q-pa-md q-mb-md">
          <div class="row items-center justify-between q-mb-md header-divider q-pb-sm">
            <div class="text-subtitle1 text-weight-bold text-main flex items-center">
              <q-icon name="show_chart" class="q-mr-sm" size="sm" color="primary" />
              Account Growth
            </div>
            <q-btn-toggle
              v-model="chartTimeframe"
              unelevated
              rounded
              class="filter-toggle text-weight-bold"
              toggle-color="primary"
              :color="$q.dark.isActive ? 'grey-9' : 'grey-2'"
              :text-color="$q.dark.isActive ? 'grey-4' : 'grey-7'"
              :options="[
                { label: '1M', value: '1M' },
                { label: '3M', value: '3M' },
                { label: '6M', value: '6M' },
                { label: '9M', value: '9M' },
                { label: '1Y', value: '1Y' },
              ]"
              size="12px"
            />
          </div>
          <VueApexCharts
            type="area"
            height="320"
            :options="chartOptions"
            :series="store.chartData.series"
          />
        </q-card>

        <!-- Monthly Calendar — daily P&L มีเฉพาะพอร์ต TRADER -->
        <q-card v-if="store.isTrader" class="dashboard-card q-pa-md">
          <div class="row items-center justify-between q-mb-md header-divider q-pb-sm">
            <div class="text-subtitle1 text-weight-bold text-main flex items-center">
              <q-icon name="calendar_month" class="q-mr-sm" size="sm" color="primary" />
              Monthly Calendar
            </div>
            <div class="row items-center calendar-nav">
              <q-btn flat round dense icon="chevron_left" class="text-main" @click="prevMonth" />
              <div
                class="text-subtitle2 text-weight-bold text-main q-px-sm"
                style="min-width: 130px; text-align: center"
              >
                {{ calendarMonthYear }}
              </div>
              <q-btn flat round dense icon="chevron_right" class="text-main" @click="nextMonth" />
            </div>
          </div>

          <div
            class="calendar-grid text-weight-bold text-muted q-mb-sm text-uppercase"
            style="font-size: 11px"
          >
            <div
              class="text-center tracking-wide"
              v-for="d in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']"
              :key="d"
            >
              {{ d }}
            </div>
          </div>
          <div class="calendar-grid">
            <div
              v-for="(item, index) in calendarDays"
              :key="index"
              class="calendar-cell"
              :class="{
                'cell-positive': item.pnl > 0,
                'cell-negative': item.pnl < 0,
                'is-empty': !item.day,
              }"
            >
              <template v-if="item.day">
                <div class="day-number text-weight-medium">{{ item.day }}</div>
                <div
                  v-if="item.pnl !== 0"
                  class="pnl-amount text-weight-bold"
                  :class="item.pnl > 0 ? 'text-positive' : 'text-negative'"
                >
                  <span v-if="item.pnl > 0">+</span
                  >{{ item.pnl > 0 ? `$${item.pnl}` : `-$${Math.abs(item.pnl)}` }}
                </div>
                <div v-else class="pnl-amount text-muted text-weight-medium" style="opacity: 0.5">
                  $0
                </div>
              </template>
            </div>
          </div>
        </q-card>
      </div>
      <!-- end dashboard -->

      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- TAB: ALLOCATION (โหมด Stock)                                        -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <div v-if="activeTab === 'allocation' && !store.isLoadingDetails">
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-5">
            <q-card class="dashboard-card q-pa-md h-full">
              <div class="text-subtitle1 text-weight-bold text-main q-mb-md header-divider q-pb-sm">
                <q-icon name="donut_large" class="q-mr-sm" size="sm" color="primary" />
                Portfolio Allocation
              </div>

              <VueApexCharts
                v-if="store.allocation.length > 0"
                type="donut"
                height="320"
                :options="allocationOpts"
                :series="allocationSeries"
              />
              <div v-else class="q-pa-xl text-center text-muted">ยังไม่มีข้อมูลการจัดสรร</div>
            </q-card>
          </div>

          <div class="col-12 col-md-7">
            <q-card class="dashboard-card q-pa-md h-full">
              <div class="text-subtitle1 text-weight-bold text-main q-mb-md header-divider q-pb-sm">
                <q-icon name="table_rows" class="q-mr-sm" size="sm" color="primary" />
                Weights
              </div>

              <q-table
                v-if="store.allocation.length > 0"
                flat
                dense
                class="custom-table bg-transparent"
                :rows="store.allocation"
                row-key="symbol"
                hide-pagination
                hide-bottom
                :rows-per-page-options="[0]"
                :columns="[
                  { name: 'symbol', label: 'Symbol', field: 'symbol', align: 'left' },
                  { name: 'value', label: 'Value', field: 'value', align: 'right' },
                  { name: 'weight', label: 'Weight', field: 'weight', align: 'right' },
                ]"
              >
                <template v-slot:body-cell-value="props">
                  <q-td :props="props" class="text-main text-weight-bold text-body2">
                    {{ money(Number(props.row.value)) }}
                  </q-td>
                </template>
                <template v-slot:body-cell-weight="props">
                  <q-td :props="props" class="text-body2">
                    <q-linear-progress
                      :value="Number(props.row.weight) / 100"
                      size="6px"
                      color="primary"
                      class="q-mb-xs"
                      rounded
                    />
                    {{ Number(props.row.weight).toFixed(2) }}%
                  </q-td>
                </template>
              </q-table>
              <div v-else class="q-pa-xl text-center text-muted">ยังไม่มีข้อมูลการจัดสรร</div>
            </q-card>
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- TAB: TIMELINE (โหมด Stock)                                          -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <div v-if="activeTab === 'timeline' && !store.isLoadingDetails">
        <q-card class="dashboard-card q-pa-md">
          <div class="text-subtitle1 text-weight-bold text-main q-mb-md header-divider q-pb-sm">
            <q-icon name="timeline" class="q-mr-sm" size="sm" color="primary" />
            Cash & Position Timeline
          </div>

          <q-table
            v-if="store.timeline.length > 0"
            flat
            dense
            class="custom-table bg-transparent"
            :rows="store.timeline"
            row-key="id"
            :rows-per-page-options="[25, 50, 0]"
            :columns="[
              { name: 'date', label: 'Date', field: 'occurred_at', align: 'left' },
              { name: 'type', label: 'Type', field: 'type', align: 'left' },
              { name: 'description', label: 'Description', field: 'description', align: 'left' },
              { name: 'amount', label: 'Amount', field: 'amount', align: 'right' },
            ]"
          >
            <template v-slot:body-cell-date="props">
              <q-td :props="props" class="text-muted text-body2">
                {{ new Date(props.row.occurred_at).toLocaleDateString('en-GB') }}
              </q-td>
            </template>
            <template v-slot:body-cell-type="props">
              <q-td :props="props">
                <q-chip size="sm" class="text-weight-bold custom-chip">{{ props.row.type }}</q-chip>
              </q-td>
            </template>
            <template v-slot:body-cell-description="props">
              <q-td :props="props" class="text-main text-body2">
                {{ props.row.description ?? '—' }}
              </q-td>
            </template>
            <template v-slot:body-cell-amount="props">
              <q-td
                :props="props"
                class="text-body2 text-weight-bolder"
                :class="Number(props.row.amount) >= 0 ? 'text-positive' : 'text-negative'"
              >
                {{ Number(props.row.amount) >= 0 ? '+' : '' }}{{ money(Number(props.row.amount)) }}
              </q-td>
            </template>
          </q-table>
          <div v-else class="q-pa-xl text-center text-muted">ยังไม่มีความเคลื่อนไหว</div>
        </q-card>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- TAB: AI INSIGHTS (โหมด Stock)                                       -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <div v-if="activeTab === 'ai'" class="stack-lg" data-test="analytics-tab-ai">
        <AiPortfolioAdvisorCard
          :portfolio-id="store.portfolioId"
          :has-holdings="riskHoldings.length > 0"
        />

        <AiRiskAnalysisCard :holdings="riskHoldings" />

        <div
          v-if="store.isLoadingAdvanced"
          class="flex flex-center q-py-lg column text-muted"
          data-test="performers-loading"
        >
          <q-spinner-dots size="32px" color="primary" class="q-mb-sm" />
          <div class="text-caption">Loading performers…</div>
        </div>
        <PerformersSection v-else />
      </div>

      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- TAB: PLANNING & TOOLS (โหมด Stock)                                  -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <div v-if="activeTab === 'tools'" class="stack-lg" data-test="analytics-tab-tools">
        <AverageCostCalculator />
        <PlExportCard />
        <DividendTaxCard :portfolio-id="store.portfolioId" />
        <DcaPredictorCard />
      </div>

      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- TAB: MONTHLY GROWTH                                                 -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <div v-if="activeTab === 'growth' && !store.isLoadingDetails">
        <div class="row q-col-gutter-md q-mb-md">
          <!-- Chart -->
          <div class="col-12 col-md-8">
            <q-card class="dashboard-card q-pa-md">
              <div class="section-header q-mb-md">
                <div class="text-subtitle1 text-weight-bold text-main">Monthly PnL</div>
                <div class="text-caption text-muted">Profit & Loss per calendar month</div>
              </div>
              <VueApexCharts
                v-if="store.monthlyGrowth.length"
                type="bar"
                height="260"
                :options="growthChartOpts"
                :series="growthChartSeries"
              />
              <div v-else class="empty-state">No data yet</div>
            </q-card>
          </div>
          <!-- AI Panel -->
          <div class="col-12 col-md-4">
            <AiInsightPanel
              chart-type="monthly_growth"
              :insight="aiInsight('monthly_growth')"
              :loading="aiLoading('monthly_growth')"
              :lines="aiLines('monthly_growth')"
              @refresh="refreshGrowth"
            />
          </div>
        </div>

        <!-- Stat cards instead of table -->
        <div class="row q-col-gutter-md">
          <div v-for="row in store.monthlyGrowth" :key="row.month" class="col-6 col-sm-4 col-md-3">
            <q-card class="dashboard-card q-pa-md">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">{{ row.label }}</div>
              <div
                class="text-subtitle1 text-weight-bolder q-mb-xs"
                :class="row.pnl >= 0 ? 'text-positive' : 'text-negative'"
              >
                {{ fmt(row.pnl) }}
              </div>
              <div class="row items-center justify-between">
                <div class="text-caption text-muted">{{ row.trade_count }} trades</div>
                <span
                  class="wr-badge"
                  :class="
                    row.trade_count > 0 && row.win_count / row.trade_count >= 0.5
                      ? 'wr-good'
                      : 'wr-bad'
                  "
                >
                  {{
                    row.trade_count > 0
                      ? ((row.win_count / row.trade_count) * 100).toFixed(0)
                      : '0'
                  }}%
                </span>
              </div>
            </q-card>
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- TAB: PERFORMANCE                                                    -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <div v-if="activeTab === 'performance' && !store.isLoadingDetails">
        <!-- /analytics/:id/behavioral ยัง gate ด้วย PaidTierGuard — แพ็กฟรีต้องรู้ว่าทำไมว่าง
             (แท็บอื่นบนหน้านี้เป็นของฟรีหมดแล้ว จึงบล็อกเฉพาะแท็บนี้) -->
        <WsUpgradeNotice
          v-if="store.behavioralAccessDenied"
          data-test="analytics-behavioral-upgrade"
          message-th="การวิเคราะห์พฤติกรรมการเทรด (กลยุทธ์ / อารมณ์ / ช่วงเวลา) เปิดให้เฉพาะสมาชิกแบบชำระเงิน"
          message-en="Behavioral analytics (strategy, emotion, time-of-day) is available on paid plans."
        />

        <template v-else>
        <div class="dashboard-card q-pa-sm q-mb-md">
          <q-tabs
            v-model="perfTab"
            dense
            no-caps
            indicator-color="primary"
            active-color="primary"
            align="left"
            class="main-tabs"
          >
            <q-tab name="strategy" label="Strategy" />
            <q-tab name="emotion" label="Emotion" />
            <q-tab name="trend" label="Trend" />
            <q-tab name="entry_reason" label="Entry Reason" />
            <q-tab name="time_slot" label="Time of Day" />
          </q-tabs>
        </div>

        <div class="row q-col-gutter-md q-mb-md">
          <!-- Charts stacked left -->
          <div class="col-12 col-md-8">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-card class="dashboard-card q-pa-md">
                  <div class="section-header q-mb-md">
                    <div class="text-subtitle2 text-weight-bold text-main capitalize">
                      {{ perfTab.replace('_', ' ') }} — Win vs Loss
                    </div>
                  </div>
                  <VueApexCharts
                    v-if="currentPerfData.length"
                    type="bar"
                    height="220"
                    :options="perfWinLossOpts"
                    :series="perfWinLossSeries"
                  />
                  <div v-else class="empty-state">No data</div>
                </q-card>
              </div>
              <div class="col-12 col-sm-6">
                <q-card class="dashboard-card q-pa-md">
                  <div class="section-header q-mb-md">
                    <div class="text-subtitle2 text-weight-bold text-main capitalize">
                      {{ perfTab.replace('_', ' ') }} — Total PnL
                    </div>
                  </div>
                  <VueApexCharts
                    v-if="currentPerfData.length"
                    type="bar"
                    height="220"
                    :options="perfPnlOpts"
                    :series="perfPnlSeries"
                  />
                  <div v-else class="empty-state">No data</div>
                </q-card>
              </div>
            </div>
          </div>
          <!-- AI Panel right -->
          <div class="col-12 col-md-4">
            <AiInsightPanel
              :chart-type="`performance_${perfTab}`"
              :insight="aiInsight(`performance_${perfTab}`)"
              :loading="aiLoading(`performance_${perfTab}`)"
              :lines="aiLines(`performance_${perfTab}`)"
              @refresh="refreshPerf"
            />
          </div>
        </div>

        <!-- Stat cards -->
        <div class="row q-col-gutter-sm">
          <div v-for="row in currentPerfData" :key="row.label" class="col-6 col-sm-4 col-md-3">
            <q-card class="dashboard-card q-pa-md">
              <div class="text-caption text-muted text-weight-bold q-mb-xs ellipsis">
                {{ row.label }}
              </div>
              <div
                class="text-subtitle2 text-weight-bolder q-mb-xs"
                :class="row.total_pnl >= 0 ? 'text-positive' : 'text-negative'"
              >
                {{ fmt(row.total_pnl) }}
              </div>
              <div class="row items-center justify-between">
                <div class="text-caption text-muted">
                  {{ row.win_count }}W / {{ row.loss_count }}L
                </div>
                <span class="wr-badge" :class="row.win_rate >= 50 ? 'wr-good' : 'wr-bad'"
                  >{{ row.win_rate }}%</span
                >
              </div>
            </q-card>
          </div>
        </div>
        </template>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- TAB: WIN RATE                                                       -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <div v-if="activeTab === 'winrate' && !store.isLoadingDetails">
        <div class="dashboard-card q-pa-sm q-mb-md">
          <q-tabs
            v-model="winTab"
            dense
            no-caps
            indicator-color="primary"
            active-color="primary"
            align="left"
            class="main-tabs"
          >
            <q-tab name="position" label="BUY / SELL" />
            <q-tab name="day" label="Day of Week" />
            <q-tab name="month" label="Month" />
            <q-tab name="time" label="Time of Day" />
          </q-tabs>
        </div>

        <div class="row q-col-gutter-md q-mb-md">
          <!-- Chart left -->
          <div class="col-12 col-md-8">
            <q-card class="dashboard-card q-pa-md">
              <div class="section-header q-mb-md">
                <div class="text-subtitle1 text-weight-bold text-main">
                  Win / Loss
                  <span v-if="winTab === 'position'"> by Position</span>
                  <span v-else-if="winTab === 'day'"> by Day of Week</span>
                  <span v-else-if="winTab === 'month'"> by Month</span>
                  <span v-else> by Time of Day</span>
                </div>
              </div>
              <!-- Position -->
              <template v-if="winTab === 'position'">
                <VueApexCharts
                  type="bar"
                  height="260"
                  :options="wrPositionOpts"
                  :series="wrPositionSeries"
                />
              </template>
              <!-- Day -->
              <template v-else-if="winTab === 'day'">
                <VueApexCharts type="bar" height="260" :options="wrDayOpts" :series="wrDaySeries" />
              </template>
              <!-- Month -->
              <template v-else-if="winTab === 'month'">
                <VueApexCharts
                  type="bar"
                  height="260"
                  :options="wrMonthOpts"
                  :series="wrMonthSeries"
                />
              </template>
              <!-- Time -->
              <template v-else>
                <div style="overflow-x: auto">
                  <div :style="{ minWidth: (store.winRate?.by_slot ?? []).length * 40 + 'px' }">
                    <VueApexCharts
                      type="bar"
                      height="260"
                      :options="wrTimeOpts"
                      :series="wrTimeSeries"
                    />
                  </div>
                </div>
              </template>
            </q-card>
          </div>
          <!-- AI Panel right -->
          <div class="col-12 col-md-4">
            <AiInsightPanel
              :chart-type="`winrate_${winTab}`"
              :insight="aiInsight(`winrate_${winTab}`)"
              :loading="aiLoading(`winrate_${winTab}`)"
              :lines="aiLines(`winrate_${winTab}`)"
              @refresh="refreshWinRate"
            />
          </div>
        </div>

        <!-- Stat cards for position summary -->
        <div v-if="winTab === 'position'" class="row q-col-gutter-md">
          <div v-for="pos in validPositions" :key="pos.position" class="col-6 col-md-3">
            <q-card class="dashboard-card q-pa-md text-center">
              <div class="text-caption text-muted text-weight-bold text-uppercase q-mb-xs">
                {{ pos.position }}
              </div>
              <div
                class="text-h5 text-weight-bolder q-mb-xs"
                :class="pos.win_rate >= 50 ? 'text-positive' : 'text-negative'"
              >
                {{ pos.win_rate }}%
              </div>
              <div class="text-caption text-muted">
                {{ pos.win }}W / {{ pos.loss }}L / {{ pos.win + pos.loss }} trades
              </div>
            </q-card>
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- TAB: PNL CHARTS                                                     -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <div v-if="activeTab === 'pnl' && !store.isLoadingDetails">
        <div class="dashboard-card q-pa-sm q-mb-md">
          <q-tabs
            v-model="pnlTab"
            dense
            no-caps
            indicator-color="primary"
            active-color="primary"
            align="left"
            class="main-tabs"
          >
            <q-tab name="time" label="Time of Day" />
            <q-tab name="day" label="Day of Week" />
            <q-tab name="month" label="Month" />
          </q-tabs>
        </div>

        <div class="row q-col-gutter-md q-mb-md">
          <!-- Chart left -->
          <div class="col-12 col-md-8">
            <q-card class="dashboard-card q-pa-md">
              <div class="section-header q-mb-md">
                <div class="text-subtitle1 text-weight-bold text-main">
                  Aggregate PnL
                  <span v-if="pnlTab === 'time'"> — Time of Day</span>
                  <span v-else-if="pnlTab === 'day'"> — Day of Week</span>
                  <span v-else> — Month</span>
                </div>
              </div>
              <template v-if="pnlTab === 'time'">
                <div style="overflow-x: auto">
                  <div :style="{ minWidth: (store.winRate?.pnl_by_slot ?? []).length * 40 + 'px' }">
                    <VueApexCharts
                      type="bar"
                      height="260"
                      :options="pnlTimeOpts"
                      :series="pnlTimeSeries"
                    />
                  </div>
                </div>
              </template>
              <template v-else-if="pnlTab === 'day'">
                <VueApexCharts
                  type="bar"
                  height="260"
                  :options="pnlDayOpts"
                  :series="pnlDaySeries"
                />
              </template>
              <template v-else>
                <VueApexCharts
                  type="bar"
                  height="260"
                  :options="pnlMonthOpts"
                  :series="pnlMonthSeries"
                />
              </template>
            </q-card>
          </div>
          <!-- AI Panel right -->
          <div class="col-12 col-md-4">
            <AiInsightPanel
              :chart-type="`pnl_${pnlTab}`"
              :insight="aiInsight(`pnl_${pnlTab}`)"
              :loading="aiLoading(`pnl_${pnlTab}`)"
              :lines="aiLines(`pnl_${pnlTab}`)"
              @refresh="refreshPnl"
            />
          </div>
        </div>

        <!-- Stat cards summary -->
        <div class="row q-col-gutter-sm">
          <template v-if="pnlTab === 'time'">
            <div
              v-for="row in (store.winRate?.pnl_by_slot ?? []).filter((d) => d.total_pnl !== 0)"
              :key="row.slot"
              class="col-6 col-sm-4 col-md-3"
            >
              <q-card class="dashboard-card q-pa-sm">
                <div class="text-caption text-muted q-mb-xs">{{ row.slot }}</div>
                <div
                  class="text-subtitle2 text-weight-bolder"
                  :class="row.total_pnl >= 0 ? 'text-positive' : 'text-negative'"
                >
                  {{ fmt(row.total_pnl) }}
                </div>
                <div class="text-caption text-muted">{{ row.trade_count }} trades</div>
              </q-card>
            </div>
          </template>
          <template v-else-if="pnlTab === 'day'">
            <div
              v-for="row in store.winRate?.pnl_by_day ?? []"
              :key="row.day"
              class="col-6 col-sm-4 col-md-3"
            >
              <q-card class="dashboard-card q-pa-sm">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">{{ row.day }}</div>
                <div
                  class="text-subtitle2 text-weight-bolder"
                  :class="row.net >= 0 ? 'text-positive' : 'text-negative'"
                >
                  {{ fmt(row.net) }}
                </div>
                <div class="row text-caption text-muted">
                  <span class="text-positive q-mr-xs">+{{ row.profit.toFixed(0) }}</span>
                  <span class="text-negative">{{ row.loss.toFixed(0) }}</span>
                </div>
              </q-card>
            </div>
          </template>
          <template v-else>
            <div
              v-for="row in store.winRate?.pnl_by_month ?? []"
              :key="row.month"
              class="col-6 col-sm-4 col-md-3"
            >
              <q-card class="dashboard-card q-pa-sm">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">{{ row.month }}</div>
                <div
                  class="text-subtitle2 text-weight-bolder"
                  :class="row.net >= 0 ? 'text-positive' : 'text-negative'"
                >
                  {{ fmt(row.net) }}
                </div>
                <div class="row text-caption text-muted">
                  <span class="text-positive q-mr-xs">+{{ row.profit.toFixed(0) }}</span>
                  <span class="text-negative">{{ row.loss.toFixed(0) }}</span>
                </div>
              </q-card>
            </div>
          </template>
        </div>
      </div>
      <!-- end pnl --> </template
    ><!-- end v-else loading -->
  </q-page>
</template>

<style scoped>
/* ==========================================================
   CSS Variables
========================================================== */
/* หน้านี้เคยประกาศ palette ของตัวเองเป็นชุด slate/น้ำเงิน (#f8fafc / #1e293b /
   #eff6ff) ค้างมาตั้งแต่ก่อน rebrand แล้ว override token teal/sage ของ app.scss
   ทับทั้งหน้า — ค่าใน :root ของ mockup ตรงกับ app.scss เป๊ะ จึงยกกลับมาใช้ชุดกลาง
   เหมือนที่ทำกับ DashboardPage

   ผลพลอยได้: การ์ดลูกในแท็บ AI (AiPortfolioAdvisorCard / AiRiskAnalysisCard /
   PerformersSection) อ่าน --bg-card-soft จากที่นี่ ตอน dark mode จึงเคยได้สี
   slate #1e293b ปนเข้าไป ทั้งที่ตัวเองใช้ token กลางล้วน ตอนนี้ตรงกันแล้ว */
.analytics-page {
  --bg-page: #f6f9f9;
  --bg-card: #fdfefe;
  --bg-card-soft: #f0f5f4;
  --text-main: #1b3636;
  --text-muted: #789191;
  --border-color: #dae7e5;
  --shadow-card: 0 1px 2px rgba(27, 54, 54, 0.04), 0 12px 32px -12px rgba(27, 54, 54, 0.1);
  --shadow-hover: 0 1px 2px rgba(27, 54, 54, 0.05), 0 18px 40px -14px rgba(27, 54, 54, 0.18);

  --accent-200: #cde5e2;
  --accent-300: #b0d4cf;
  --accent-400: #9bc5c0;
  --accent-500: #85b6b0;
  --accent-600: #64a6a0;
  --accent-700: #4c8a87;
  --accent-800: #336160;
  --accent-900: #1b3636;

  --bg-icon-primary: #e7f4f2;
  --bg-icon-positive: #f0fdf4;
  --bg-icon-warning: #fffbeb;
  --bg-icon-negative: #fef2f2;
  --bg-icon-purple: #faf5ff;

  --table-hover: #f0f5f4;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
  transition: background-color 0.3s ease;
}

.body--dark .analytics-page {
  --bg-page: #151819;
  --bg-card: #1f2323;
  --bg-card-soft: #282e2e;
  --text-main: #f4f6f5;
  --text-muted: #7d8c89;
  --border-color: #394141;
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.2), 0 20px 44px -16px rgba(0, 0, 0, 0.55);
  --shadow-hover: 0 1px 2px rgba(0, 0, 0, 0.25), 0 26px 52px -18px rgba(0, 0, 0, 0.65);

  --bg-icon-primary: rgba(133, 182, 176, 0.18);
  --bg-icon-positive: rgba(74, 222, 128, 0.15);
  --bg-icon-warning: rgba(251, 191, 36, 0.15);
  --bg-icon-negative: rgba(248, 113, 113, 0.15);
  --bg-icon-purple: rgba(168, 85, 247, 0.15);

  --table-hover: rgba(255, 255, 255, 0.03);
}

/* แท็บ AI Insights / Planning & Tools วางการ์ดเรียงลงมาเป็นคอลัมน์เดียว */
.stack-lg {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ==========================================================
   Cards & Icon Boxes
========================================================== */
.dashboard-card {
  background: var(--bg-card);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
}

/* ── Stat card hover — เหมือน Journal ── */
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-hover);
}

.header-divider {
  border-bottom: 1px solid var(--border-color);
}

.icon-box {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.bg-icon-primary {
  background-color: var(--bg-icon-primary);
}
.bg-icon-positive {
  background-color: var(--bg-icon-positive);
}
.bg-icon-negative {
  background-color: var(--bg-icon-negative);
}
.bg-icon-purple {
  background-color: var(--bg-icon-purple);
}

/* ตัวเลข KPI: 34px -> 22px ตามแบบ + JetBrains Mono/tabular-nums กันคอลัมน์ตัวเลข
   ขยับเวลาค่าเปลี่ยน (แบบเดียวกับ DashboardPage) */
.stat-val {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 1.4rem;
  line-height: 1.9rem;
}
.stat-label {
  font-size: 12.5px;
  min-width: 0;
}
.kpi-top {
  min-height: 32px;
}
.text-main {
  color: var(--text-main);
}
.text-muted {
  color: var(--text-muted);
}
.tracking-tight {
  letter-spacing: -0.02em;
}
.tracking-wide {
  letter-spacing: 0.05em;
}

@media (max-width: 599px) {
  .stat-val {
    font-size: 1.2rem;
    line-height: 1.5rem;
  }
  .stat-label {
    font-size: 11px;
  }
  .icon-box {
    width: 28px;
    height: 28px;
  }
  .icon-box .q-icon {
    font-size: 14px !important;
  }
}

/* Filter Toggle */
.filter-toggle {
  border: 1px solid var(--border-color);
}
.filter-toggle :deep(.q-btn) {
  padding: 0 12px;
}

/* ==========================================================
   Calendar Styles
========================================================== */
.calendar-nav {
  background: var(--bg-page);
  border-radius: 20px;
  border: 1px solid var(--border-color);
  padding: 2px;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}

.calendar-cell {
  border: 1px solid var(--border-color);
  background-color: var(--bg-card);
  border-radius: 10px;
  height: 85px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: all 0.2s ease;
}

.calendar-cell.is-empty {
  border: none;
  background-color: transparent !important;
}

.calendar-cell:not(.is-empty):hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border-color: var(--q-primary);
}
:global(.body--dark) .calendar-cell:not(.is-empty):hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.cell-positive {
  background-color: var(--bg-icon-positive) !important;
  border-color: rgba(34, 197, 94, 0.3) !important;
}

.cell-negative {
  background-color: var(--bg-icon-negative) !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
}

.day-number {
  font-size: 0.85em;
  color: var(--text-muted);
}

.pnl-amount {
  text-align: right;
  font-size: 1.05em;
  letter-spacing: -0.01em;
}

/* ==========================================================
   Tabs
========================================================== */
.main-tabs :deep(.q-tab) {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  padding: 0 14px;
  min-height: 40px;
  color: var(--text-muted);
  border-radius: 8px;
}
.main-tabs :deep(.q-tab--active) {
  color: var(--q-primary);
}
.main-tabs :deep(.q-tabs__content) {
  gap: 2px;
}

/* แถบแท็บหลักลอยค้างหัวหน้าตามแบบ — ดึงขอบออกไปชนขอบเพจ (q-pa-md = 16px)
   ไม่งั้นการ์ดที่เลื่อนผ่านด้านล่างจะโผล่ตรงช่องว่างซ้าย/ขวา */
.tabs-sticky {
  position: sticky;
  top: 0;
  z-index: 5;
  margin: 0 -16px 16px;
  padding: 6px 16px 12px;
  background: var(--bg-page);
}

/* Compact top tab bar — pill style, auto-width */
.compact-tabs {
  display: inline-flex;
  background: var(--bg-card);
  border-radius: 999px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-card);
  padding: 4px;
  width: auto;
}
.compact-tabs :deep(.q-tabs__content) {
  flex-wrap: nowrap;
  overflow: visible;
}
.compact-tabs :deep(.q-tab) {
  border-radius: 999px;
  min-height: 34px;
  padding: 0 18px;
  font-weight: 700;
}
/* แท็บที่เลือกใช้ gradient accent-500 -> accent-900 ตามแบบ แทนสีทึบใบเดียว */
.compact-tabs :deep(.q-tab--active) {
  background: linear-gradient(135deg, var(--accent-500), var(--accent-900));
  color: #fff !important;
}
.compact-tabs :deep(.q-tabs__indicator) {
  display: none;
}

/* ==========================================================
   Section Header
========================================================== */
.section-header {
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 10px;
}

/* ==========================================================
   Analysis Tables
========================================================== */
.analysis-table :deep(thead tr th) {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}
.analysis-table :deep(tbody tr td) {
  padding: 9px 12px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-main);
}
.analysis-table :deep(tbody tr:last-child td) {
  border-bottom: none;
}
.analysis-table :deep(tbody tr:hover td) {
  background: var(--bg-icon-primary);
}

/* ==========================================================
   Tables — Allocation / Timeline
========================================================== */
.custom-table {
  color: var(--text-main);
}
.custom-table :deep(th) {
  font-weight: 800;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-color);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.05em;
  padding: 10px 12px;
  white-space: nowrap;
}
.custom-table :deep(td) {
  border-bottom: 1px solid var(--border-color);
  padding: 11px 12px;
  font-size: 12.5px;
}
.custom-table :deep(tbody tr:last-child td) {
  border-bottom: none;
}
.custom-table :deep(tbody tr:hover) {
  background-color: var(--table-hover) !important;
}

.custom-chip {
  border-radius: 6px;
  padding: 2px 10px;
  background: var(--bg-card-soft);
  color: var(--text-secondary, var(--text-muted));
}

/* ==========================================================
   Win Rate Badge
========================================================== */
.wr-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}
.wr-good {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
.wr-bad {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}
.body--dark .wr-good {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.3);
}
.body--dark .wr-bad {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.3);
}

/* ==========================================================
   Perf Mini Card
========================================================== */
.perf-mini-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  transition: border-color 0.2s;
}
.perf-mini-card:hover {
  border-color: var(--q-primary);
}

/* ==========================================================
   AI Insight Panel
========================================================== */
.ai-panel {
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-card);
  padding: 18px;
}

.ai-panel-header {
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.ai-icon-box {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent-400), var(--accent-800));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ai-title {
  color: var(--text-main);
}
.ai-muted {
  color: var(--text-muted);
}

.ai-refresh-btn {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-soft);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}
.ai-refresh-btn:hover {
  border-color: var(--accent-400);
  color: var(--accent-800);
}
.body--dark .ai-refresh-btn:hover {
  color: var(--accent-400);
}
.ai-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-700);
  border-radius: 50%;
  animation: ai-spin 0.8s linear infinite;
}
@keyframes ai-spin {
  to {
    transform: rotate(360deg);
  }
}

.ai-lines {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 14px;
}

.ai-line {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  background: var(--bg-card-soft);
  border-radius: 10px;
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}
.ai-line:hover {
  border-color: var(--accent-300);
}

.ai-line-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-700);
  flex-shrink: 0;
  margin-top: 5px;
}

.ai-line-text {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-main);
}

.ai-empty-icon {
  font-size: 36px !important;
  color: var(--text-muted);
  opacity: 0.3;
}

.ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

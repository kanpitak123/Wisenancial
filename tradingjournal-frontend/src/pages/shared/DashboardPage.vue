<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useJournalStore } from 'stores/JournalStore';
import type { Trade } from 'src/types/trade.types';
import { useGoalStore } from 'stores/GoalStore';
import { useAnalyticsStore } from 'stores/AnalyticsStore';
import { useDividendStore } from 'stores/DividendStore';
import { useInvestorPortfolioStore } from 'stores/InvestorPortfolioStore';
import { useWorkspace } from 'src/composables/useWorkspace';
import VueApexCharts from 'vue3-apexcharts';
import { useQuasar } from 'quasar';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import type { ApexOptions } from 'apexcharts';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import { SHARE_QR_OPTIONS, SHARE_QR_TARGET_URL } from 'src/constants/share.constants';
import { assetClassOf, buildActivityCsv, buildDividendCsv, downloadCsv } from 'src/utils/csv-export';
import type { InvestorActivity } from 'src/types/investor-portfolio.types';

const $q = useQuasar();
const portStore = usePortfolioStore();
const journalStore = useJournalStore();
const goalStore = useGoalStore();
const analyticsStore = useAnalyticsStore();
const dividendStore = useDividendStore();
const investorStore = useInvestorPortfolioStore();

// หน้านี้เป็น shared — โหมด Forex อ่านจาก JournalStore, โหมด Stock อ่านจาก InvestorPortfolioStore
const { isTrader, isInvestor } = useWorkspace();

// Toggle timeframe ของกราฟ Portfolio Growth ผ่าน AnalyticsStore.setTimeframe
const chartTimeframe = computed({
  get: () => analyticsStore.timeframe,
  set: (value) => {
    void analyticsStore.setTimeframe(value);
  },
});

// ── Tax Report ────────────────────────────────────────────────────────────────
const showTaxDialog = ref(false);
const TAX_RATE = 0.15; // 15% capital gains (estimated)
const currentTaxYear = computed(() => new Date().getFullYear());

const taxMonthly = computed(() => {
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const year = currentTaxYear.value;
  const map: Record<number, { profit: number; loss: number; count: number }> = {};
  for (let i = 0; i < 12; i++) map[i] = { profit: 0, loss: 0, count: 0 };

  journalStore.trades.forEach((t) => {
    const d = new Date(t.closed_at ?? t.opened_at ?? '');
    if (d.getFullYear() !== year) return;
    const m = d.getMonth();
    const pnl = Number(t.pnl);
    map[m]!.count++;
    if (pnl > 0) map[m]!.profit += pnl;
    else map[m]!.loss += Math.abs(pnl);
  });

  return MONTHS.map((month, i) => ({
    month,
    profit: map[i]!.profit,
    loss: map[i]!.loss,
    net: map[i]!.profit - map[i]!.loss,
  }));
});

const annualNet = computed(() => taxMonthly.value.reduce((s, r) => s + r.net, 0));

const taxRows = computed(() => {
  // Group trades by year-month
  const map: Record<string, { profit: number; loss: number; count: number; label: string }> = {};
  journalStore.trades.forEach((t) => {
    const d = new Date(t.closed_at ?? t.opened_at ?? '');
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    if (!map[key]) map[key] = { profit: 0, loss: 0, count: 0, label };
    const pnl = Number(t.pnl);
    map[key].count++;
    if (pnl > 0) map[key].profit += pnl;
    else map[key].loss += Math.abs(pnl);
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      ...v,
      net: v.profit - v.loss,
      taxable: Math.max(0, v.profit - v.loss),
      tax: Math.max(0, v.profit - v.loss) * TAX_RATE,
    }));
});

const printTaxReport = () => {
  const el = document.getElementById('tax-print-area');
  if (!el) return;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"><title>Tax Report</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:28px}
      h1{font-size:18px;font-weight:800;margin-bottom:4px}
      h2{font-size:13px;font-weight:700;margin:20px 0 8px;color:#334155;text-transform:uppercase;letter-spacing:.04em}
      .sub{font-size:12px;color:#64748b;margin-bottom:16px}
      .meta{display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #1e293b}
      table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px}
      thead tr{background:#1e293b;color:#fff}
      thead th{padding:8px 10px;text-align:left;font-weight:700;letter-spacing:.03em}
      thead th.r{text-align:right}
      tbody tr{border-bottom:1px solid #e2e8f0}
      tbody tr:nth-child(even){background:#f8fafc}
      tbody td{padding:7px 10px}
      tbody td.r{text-align:right;font-variant-numeric:tabular-nums}
      .profit{color:#16a34a;font-weight:600}
      .loss{color:#dc2626;font-weight:600}
      .tax{color:#7c3aed;font-weight:700}
      tfoot tr{background:#1e293b;color:#fff;font-weight:700}
      tfoot td{padding:8px 10px}
      tfoot td.r{text-align:right}
      .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
      .card{border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px}
      .card.hl{background:#faf5ff;border-color:#c4b5fd}
      .card-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:4px}
      .card-val{font-size:16px;font-weight:800}
      .disclaimer{border-top:1px solid #e2e8f0;padding-top:12px;font-size:9px;color:#94a3b8;line-height:1.6}
      .disclaimer strong{color:#64748b}
      .sig-row{display:flex;justify-content:flex-end;gap:40px;margin:24px 0 16px}
      .sig{text-align:center}
      .sig-line{width:150px;border-bottom:1px solid #1e293b;height:30px;margin-bottom:4px}
      .sig-label{font-size:10px;color:#64748b}
      @media print{body{padding:16px}}
    </style>
  </head><body>${el.innerHTML}
  <script>window.onload=function(){window.print()}<'/script>
  </body></html>`);
  win.document.close();
};

const { safeLoad } = useSafeLoad();

/** โหลดข้อมูลที่ผูกกับพอร์ต — เรียกซ้ำได้ทุกครั้งที่พอร์ต/โหมดเปลี่ยน */
const loadPortfolioData = async () => {
  const port = portStore.activePortfolio;
  if (!port) return;

  // โหมด Stock ไม่มีการ์ด Goal บนหน้านี้แล้ว (GoalsPage เป็นของ Forex อย่างเดียว)
  // เลยไม่ต้องยิง /goals ทิ้งเปล่าๆ — แต่ต้องมีปันผลไว้ให้แท็บประวัติกิจกรรมแทน
  if (isInvestor.value) {
    // InvestorStore.initialize() โหลดให้แล้วตอน boot/สลับโหมด — ยิงซ้ำเฉพาะตอนเปลี่ยนพอร์ตในหน้านี้
    if (dividendStore.portfolioId !== port.id) {
      await safeLoad(() => dividendStore.load(port.id), 'โหลดเงินปันผลไม่สำเร็จ');
    }
    return;
  }

  const today = new Date();
  // โหลด goal ทันทีตอนเปิดหน้า (month+1 เพราะ GoalStore ใช้ 1-based month)
  await safeLoad(
    () => goalStore.loadGoalByMonth(port.id, today.getFullYear(), today.getMonth() + 1),
    'โหลดเป้าหมายประจำเดือนไม่สำเร็จ',
  );
};

onMounted(async () => {
  if (portStore.portfolios.length === 0) {
    await safeLoad(() => portStore.loadPortfolios(), 'โหลดพอร์ตโฟลิโอไม่สำเร็จ');
  }

  await loadPortfolioData();
});

// สลับโหมดหรือเปลี่ยนพอร์ต -> activePortfolio เปลี่ยน ต้องโหลดใหม่
// (เดิมหน้านี้ไม่มี watcher เลย ข้อมูลของโหมดก่อนหน้าจึงค้างอยู่บนจอ)
watch(() => portStore.activePortfolio, () => void loadPortfolioData());

// ==========================================
// 1. Calendar Navigation & Setup
// ==========================================
const currentDate = ref(new Date());

const calendarMonthYear = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
});

// โหลด Daily PnL ของเดือนที่เลือก (m เป็น 0-based)
const loadCalendarPnl = (y: number, m: number) => {
  const port = portStore.activePortfolio;
  if (!port) return;
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  void analyticsStore.loadDailyPnl(port.id, from, to);
};

const prevMonth = () => {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() - 1,
    1,
  );
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth();
  loadCalendarPnl(y, m);
  // GoalStore ใช้ 1-based month
  const port = portStore.activePortfolio;
  if (port) void goalStore.loadGoalByMonth(port.id, y, m + 1);
};

const nextMonth = () => {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() + 1,
    1,
  );
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth();
  loadCalendarPnl(y, m);
  // GoalStore ใช้ 1-based month
  const port = portStore.activePortfolio;
  if (port) void goalStore.loadGoalByMonth(port.id, y, m + 1);
};

const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];

  for (let i = 0; i < firstDay; i++) {
    days.push({ day: null, dateStr: '', pnl: 0 });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(i).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    const pnl = analyticsStore.dailyPnl[dateStr] || 0;

    days.push({ day: i, dateStr, pnl });
  }

  // Always pad to exactly 42 cells (6 rows × 7 cols) to keep fixed height
  while (days.length < 42) {
    days.push({ day: null, dateStr: '', pnl: 0 });
  }

  return days;
});

// Check if the currently viewed month is in the past
const isMonthInPast = computed(() => {
  const today = new Date();
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth();
  return y < today.getFullYear() || (y === today.getFullYear() && m < today.getMonth());
});

// Goal status badge label
const goalStatusLabel = computed(() => {
  if (monthlyGoal.value.progressPercent >= 100) return '🎯 Done';
  if (isMonthInPast.value) {
    // Past month: succeeded if ≥100%, failed otherwise
    return monthlyGoal.value.progressPercent >= 100 ? '✅ Successful' : '❌ Failed';
  }
  return monthlyGoal.value.progressPercent >= 50 ? 'On Track' : 'Behind';
});

const goalStatusClass = computed(() => {
  if (monthlyGoal.value.progressPercent >= 100) return 'badge-done';
  if (isMonthInPast.value) {
    return monthlyGoal.value.progressPercent >= 100 ? 'badge-done' : 'badge-failed';
  }
  return monthlyGoal.value.progressPercent >= 50 ? 'badge-on-track' : 'badge-behind';
});

// ==========================================
// 2. ข้อมูลพอร์ตฟอลิโอ
// ==========================================
const activePort = computed(() => portStore.activePortfolio);
const currentBalance = computed(() => activePort.value?.current_balance || 0);
const growthPercentage = computed(() => {
  const port = activePort.value;
  const initial = Number(port?.initial_balance ?? 0);
  if (!port || initial === 0) return 0;

  // คำนวณ: ((ปัจจุบัน - เริ่มต้น) / เริ่มต้น) * 100
  return ((Number(port.current_balance) - initial) / initial) * 100;
});

// ── โหมด Stock: สรุปพอร์ตมาจาก InvestorPortfolioStore ไม่ใช่ journalStore.trades ────
const investorSummary = computed(() => investorStore.summary);
const investorHoldings = computed(() => investorStore.holdings);
const investorActivity = computed(() => investorStore.dashboard?.recent_activity ?? []);

/** สัญลักษณ์สกุลเงินของพอร์ตที่ active — พอร์ตหุ้นไทยไม่ได้เป็นดอลลาร์เสมอไป */
const currencySymbol = computed(() => {
  const currency = activePort.value?.currency ?? 'USD';
  return currency === 'USD' ? '$' : `${currency} `;
});

const formatMoney = (value: number, signed = false) => {
  const sign = signed && value >= 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${currencySymbol.value}${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * เงินแบบย่อสำหรับตัวเลขใหญ่บนการ์ดแชร์ — ไม่โชว์ทศนิยมเพื่อไม่ให้ล้นการ์ด แต่ยังต้อง
 * ใช้สัญลักษณ์สกุลเงินของพอร์ตชุดเดียวกับ formatMoney() (พอร์ตหุ้นไทยไม่ใช่ดอลลาร์)
 */
const formatShareMoney = (value: number, signed = false) => {
  const sign = signed && value >= 0 ? '+' : value < 0 ? '-' : '';

  return `${sign}${currencySymbol.value}${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
};
// ==========================================
// 3. ฟิลเตอร์ Trades (สำหรับ Top Cards)
// ==========================================
const monthlyTrades = computed(() => {
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth();
  return journalStore.trades.filter((t) => {
    const d = new Date(t.closed_at ?? t.opened_at ?? '');
    return d.getMonth() === m && d.getFullYear() === y;
  });
});

const totalTrades = computed(() => monthlyTrades.value.length);
const winningTrades = computed(() => monthlyTrades.value.filter((t) => Number(t.pnl) > 0).length);
const losingTrades = computed(() => monthlyTrades.value.filter((t) => Number(t.pnl) < 0).length);

const winRate = computed(() => {
  if (totalTrades.value === 0) return 0;
  return (winningTrades.value / totalTrades.value) * 100;
});

const totalPnL = computed(() => {
  return monthlyTrades.value.reduce((sum, t) => sum + Number(t.pnl), 0);
});

// ==========================================
// 3b. การ์ดสรุปด้านบน — เนื้อหาต่างกันตามโหมด
// ==========================================
interface StatCard {
  label: string;
  icon: string;
  tone: 'primary' | 'warning' | 'positive' | 'negative';
  value: string;
  subLabel: string;
}

const tone = (value: number): StatCard['tone'] => (value >= 0 ? 'positive' : 'negative');

const traderStatCards = computed<StatCard[]>(() => [
  {
    label: 'Current Balance',
    icon: 'account_balance_wallet',
    tone: 'primary',
    value: formatMoney(Number(currentBalance.value)),
    subLabel: 'All Time',
  },
  {
    label: 'Net PnL',
    icon: totalPnL.value >= 0 ? 'trending_up' : 'trending_down',
    tone: tone(totalPnL.value),
    value: formatMoney(totalPnL.value, true),
    subLabel: `In ${calendarMonthYear.value}`,
  },
  {
    label: 'Win Rate',
    icon: 'pie_chart',
    tone: 'warning',
    value: `${winRate.value.toFixed(1)}%`,
    subLabel: `Win ${winningTrades.value} • Loss ${losingTrades.value}`,
  },
  {
    label: 'Growth',
    icon: growthPercentage.value >= 0 ? 'trending_up' : 'trending_down',
    tone: tone(growthPercentage.value),
    value: `${growthPercentage.value > 0 ? '+' : ''}${growthPercentage.value.toFixed(2)}%`,
    subLabel: 'All Time',
  },
]);

const investorStatCards = computed<StatCard[]>(() => {
  const summary = investorSummary.value;

  const portfolioValue = summary?.portfolio_value ?? Number(activePort.value?.current_balance ?? 0);
  const totalPnl = summary?.total_pnl ?? 0;
  const unrealized = summary?.unrealized_pnl ?? 0;

  return [
    {
      label: 'Portfolio Value',
      icon: 'account_balance_wallet',
      tone: 'primary',
      value: formatMoney(portfolioValue),
      subLabel: `Cash ${formatMoney(summary?.cash ?? 0)}`,
    },
    {
      label: 'Total P&L',
      icon: totalPnl >= 0 ? 'trending_up' : 'trending_down',
      tone: tone(totalPnl),
      value: formatMoney(totalPnl, true),
      subLabel: `Realized ${formatMoney(summary?.realized_pnl ?? 0, true)}`,
    },
    {
      label: 'Unrealized',
      icon: 'show_chart',
      tone: tone(unrealized),
      value: formatMoney(unrealized, true),
      subLabel: `Cost ${formatMoney(summary?.invested_cost ?? 0)}`,
    },
    {
      label: 'Total Return',
      icon: 'percent',
      tone: tone(summary?.total_return_percent ?? 0),
      value: `${(summary?.total_return_percent ?? 0) > 0 ? '+' : ''}${(
        summary?.total_return_percent ?? 0
      ).toFixed(2)}%`,
      subLabel: `Dividends ${formatMoney(summary?.dividends ?? 0)}`,
    },
  ];
});

const statCards = computed(() =>
  isInvestor.value ? investorStatCards.value : traderStatCards.value,
);

/**
 * การ์ดใบแรกของ statCards (ยอดรวมพอร์ต) ถูกยกขึ้นไปเป็น hero ด้านบน ส่วนที่เหลือ
 * เรียงเป็น KPI 3 ใบ — ไม่ได้เพิ่ม/ตัดข้อมูลใดๆ แค่แบ่งชุดเดิมไปวางคนละที่ตามแบบ
 * ทั้งสองโหมดมี 4 ใบเท่ากัน (ใบ 0 = มูลค่า, ใบ 1 = กำไร/ขาดทุน) จึง map ได้ตรงกัน
 */
const heroCard = computed(() => statCards.value[0]);
const heroDeltaCard = computed(() => statCards.value[1]);
const kpiCards = computed(() => statCards.value.slice(1));

/** เส้นกราฟจิ๋วใน hero — ใช้ series ชุดเดียวกับกราฟใหญ่ ไม่ได้ยิงข้อมูลเพิ่ม */
const heroSparklineOptions = computed<ApexOptions>(() => ({
  chart: {
    type: 'area',
    sparkline: { enabled: true },
    background: 'transparent',
    animations: { enabled: false },
  },
  colors: ['#4c8a87'],
  stroke: { curve: 'smooth', width: 2.5, lineCap: 'round' },
  fill: {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0, stops: [0, 100] },
  },
  tooltip: { enabled: false },
  theme: { mode: $q.dark.isActive ? 'dark' : 'light' },
}));

// ==========================================
// 3c. โหมด Stock — Asset allocation / Top movers / ประวัติกิจกรรม
// ==========================================

/** สีของโดนัท กำหนดเองเพื่อให้ legend ที่เขียนมือใช้สีเดียวกับสไลซ์ */
const ALLOCATION_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#6366f1',
] as const;

/**
 * สัดส่วนสินทรัพย์คำนวณจาก investorStore.holdings ที่โหลดมาแล้ว ไม่ได้ยิง
 * /analytics/portfolio/:id/allocation
 *
 * สูตรตรงกับ backend เป๊ะ (analytics/investor-analytics.service.ts -> allocation()):
 *   value = market_value ?? cost_basis, weight = value / total * 100
 * เพราะ endpoint นั้นก็ map มาจาก getHoldings() ชุดเดียวกับที่ payload ของ
 * /investor/portfolios/:id/dashboard ส่งมาให้หน้านี้อยู่แล้ว — ผลลัพธ์จึงเท่ากัน
 * แต่ไม่ต้องยิงเพิ่ม และไม่ติด PaidTierGuard ที่ครอบ AnalyticsController ทั้งตัว
 */
const allocationRows = computed(() => {
  const rows = investorHoldings.value
    .map((holding) => ({
      symbol: holding.symbol,
      value: Number(holding.market_value ?? holding.cost_basis ?? 0),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return rows.map((row, index) => ({
    ...row,
    weight: total > 0 ? (row.value / total) * 100 : 0,
    // แยกไทย/ต่างประเทศจากสัญลักษณ์จริง (.BK) ด้วยตัวเดียวกับที่ CSV ภาษีใช้
    assetClass: assetClassOf(row.symbol),
    color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length] as string,
  }));
});

/** สรุปหุ้นไทย vs หุ้นต่างประเทศ — รวมยอดจาก allocationRows ชุดเดียวกัน */
const allocationByClass = computed(() => {
  const totals = new Map<string, number>();

  for (const row of allocationRows.value) {
    totals.set(row.assetClass, (totals.get(row.assetClass) ?? 0) + row.value);
  }

  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);

  return [...totals.entries()]
    .map(([label, value]) => ({
      label,
      value,
      weight: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
});

const allocationSeries = computed(() => allocationRows.value.map((row) => row.value));

const allocationOptions = computed<ApexOptions>(() => ({
  chart: { type: 'donut', fontFamily: 'inherit', background: 'transparent' },
  labels: allocationRows.value.map((row) => row.symbol),
  colors: allocationRows.value.map((row) => row.color),
  // legend ของ Apex โชว์ได้แค่ชื่อ — เขียนเองด้านข้างเพื่อให้มีมูลค่ากับ % ด้วย
  legend: { show: false },
  dataLabels: { enabled: false },
  stroke: { width: 0 },
  plotOptions: { pie: { donut: { size: '70%' } } },
  theme: { mode: $q.dark.isActive ? 'dark' : 'light' },
  tooltip: {
    theme: $q.dark.isActive ? 'dark' : 'light',
    y: { formatter: (value: number) => formatMoney(value) },
  },
}));

const MOVERS_LIMIT = 5;

/**
 * Top gainers/losers คิดจาก unrealized_percent ที่ backend คำนวณมาต่อ holding อยู่แล้ว
 * ไม่ต้องเพิ่ม endpoint ใหม่ (มี /analytics/:id/performers อยู่ แต่ติด PaidTierGuard
 * และหน้านี้ไม่ได้เรียก loadAdvanced())
 */
const rankedHoldings = computed(() =>
  investorHoldings.value
    .filter((holding) => holding.unrealized_percent !== null)
    .map((holding) => ({
      symbol: holding.symbol,
      name: holding.name ?? null,
      percent: Number(holding.unrealized_percent),
      pnl: Number(holding.unrealized_pnl ?? 0),
    })),
);

const topGainers = computed(() =>
  rankedHoldings.value
    .filter((row) => row.percent > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, MOVERS_LIMIT),
);

const topLosers = computed(() =>
  rankedHoldings.value
    .filter((row) => row.percent < 0)
    .sort((a, b) => a.percent - b.percent)
    .slice(0, MOVERS_LIMIT),
);

type ActivityTab = 'trades' | 'dividends';

const activityTab = ref<ActivityTab>('trades');

const ACTIVITY_PREVIEW_LIMIT = 8;

/**
 * timeline = log เต็มของพอร์ต, recent_activity = ตัวย่อที่แถมมากับ payload dashboard
 * เลือกตัวเต็มก่อนเสมอ เพื่อให้สิ่งที่แสดงกับสิ่งที่ export เป็นชุดเดียวกัน
 */
const activityRows = computed<InvestorActivity[]>(() =>
  investorStore.timeline.length > 0 ? investorStore.timeline : investorActivity.value,
);

const dividendRows = computed(() => dividendStore.activeItems);

const exportActivityCsv = () => {
  const portfolio = activePort.value;
  const isDividends = activityTab.value === 'dividends';
  const rowCount = isDividends ? dividendRows.value.length : activityRows.value.length;

  if (rowCount === 0) {
    $q.notify({ type: 'warning', message: 'ไม่มีข้อมูลให้ export', position: 'top' });
    return;
  }

  const slug = (portfolio?.name || 'portfolio').toLowerCase().replace(/\s+/g, '-');
  const currency = portfolio?.currency ?? 'USD';
  const stamp = new Date().toISOString().slice(0, 10);

  if (isDividends) {
    downloadCsv(
      `dividends-${slug}-${stamp}.csv`,
      buildDividendCsv(dividendRows.value, currency),
    );
  } else {
    downloadCsv(`activity-${slug}-${stamp}.csv`, buildActivityCsv(activityRows.value, currency));
  }

  $q.notify({ type: 'positive', message: 'ดาวน์โหลดไฟล์ CSV แล้ว', position: 'top' });
};

// ==========================================
// 4. Performance Insights (Pair, Strategy, Trend, Emotion, Reason)
// ==========================================
const getCategoryStats = (categoryKey: keyof Trade) => {
  const summary: Record<string, number> = {};

  monthlyTrades.value.forEach((t) => {
    const val = t[categoryKey];
    if (typeof val !== 'string' || val === '') return;
    if (!summary[val]) summary[val] = 0;
    summary[val] += Number(t.pnl);
  });

  const summaryArray = Object.entries(summary).map(([name, pnl]) => ({ name, pnl }));
  const defaultStat = { name: '-', pnl: 0 };

  if (summaryArray.length === 0) {
    return { best: defaultStat, worst: defaultStat };
  }

  const sortedDesc = [...summaryArray].sort((a, b) => b.pnl - a.pnl);
  const sortedAsc = [...summaryArray].sort((a, b) => a.pnl - b.pnl);

  const best = sortedDesc[0] || defaultStat;
  const worst = sortedAsc[0] || defaultStat;

  return {
    best: best.pnl > 0 ? best : defaultStat,
    worst: worst.pnl < 0 ? worst : defaultStat,
  };
};

const pairStats = computed(() => getCategoryStats('pair'));

const insightsData = computed(() => [
  { label: 'Strategy', icon: 'lightbulb', stats: getCategoryStats('strategy') },
  { label: 'Trend', icon: 'show_chart', stats: getCategoryStats('trend') },
  { label: 'Emotion', icon: 'mood', stats: getCategoryStats('emotion') },
  { label: 'Reason', icon: 'psychology', stats: getCategoryStats('entry_reason') },
]);

// ==========================================
// 5. Chart
// ==========================================
const chartOptions = computed<ApexOptions>(() => ({
  chart: {
    type: 'area',
    toolbar: { show: false },
    fontFamily: 'inherit',
    background: 'transparent',
    zoom: { enabled: false },
  },
  // accent-700 ของธีม teal/sage — เดิมเป็นน้ำเงิน #1976D2 ที่ค้างมาจากก่อน rebrand
  colors: ['#4c8a87'],
  fill: {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] },
  },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  xaxis: {
    type: 'category',
    categories: analyticsStore.chartData?.categories || [],
    labels: {
      show: true, // เปิดให้แสดงวันที่
      style: {
        colors: $q.dark.isActive ? '#7d8c89' : '#789191',
        fontSize: '12px', // ขนาดตัวหนังสือแกน X
        fontFamily: 'inherit',
        fontWeight: 500,
      },
      rotate: -45, // เอียงตัวหนังสือไม่ให้ซ้อนกัน
    },
    axisBorder: {
      show: true,
      color: $q.dark.isActive ? '#394141' : '#dae7e5',
    },
    axisTicks: { show: false },
    tooltip: { enabled: false },
  },
  yaxis: {
    labels: {
      formatter: (val: number) => `${currencySymbol.value}${val.toLocaleString()}`,
      style: { fontSize: '11px' },
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
// 6. เป้าหมายรายเดือน & Recent Trades
// ==========================================
const monthlyGoal = computed(() => goalStore.monthlyPlan);

const recentTrades = computed(() => {
  return journalStore.trades
    .filter((t) => t.trade_type === 'BUY' || t.trade_type === 'SELL')
    .slice(0, 5);
});
const shareDialogOpen = ref(false);

const isSavingImage = ref(false);

/**
 * Investor (Stock) equivalents of the Trader-only stats above — คนละชุดข้อมูลเพราะ
 * win rate / best pair ไม่มีความหมายสำหรับพอร์ตหุ้นระยะยาว การ์ดแชร์ฝั่งนี้เลยใช้
 * best holding by unrealized return% และสัดส่วนพอร์ต (allocationRows ที่มีอยู่แล้ว)
 * แทน — ไม่ยิง API เพิ่ม ใช้ store เดิมที่โหลดไว้แล้วสำหรับการ์ด Asset Allocation
 */
const shareBestHolding = computed(() => {
  const ranked = investorHoldings.value
    .map((h) => {
      const cost = Number(h.cost_basis ?? 0);
      const pnl = Number(h.unrealized_pnl ?? 0);

      return { symbol: h.symbol, returnPercent: cost > 0 ? (pnl / cost) * 100 : 0 };
    })
    .sort((a, b) => b.returnPercent - a.returnPercent);

  return ranked[0] ?? { symbol: '-', returnPercent: 0 };
});

/** สัดส่วนพอร์ตสำหรับแถบ allocation ในการ์ดแชร์ — top 3 โดยน้ำหนัก + รวม "Others" ที่เหลือ */
const shareAllocationTop = computed(() => {
  const rows = allocationRows.value;
  const top = rows.slice(0, 3).map((r) => ({ label: r.symbol, weight: r.weight, color: r.color }));
  const restWeight = rows.slice(3).reduce((sum, r) => sum + r.weight, 0);

  if (restWeight > 0.5) {
    top.push({ label: 'Others', weight: restWeight, color: 'var(--text-muted)' });
  }

  return top;
});

/**
 * เส้น "Monthly Momentum" บนการ์ดแชร์ (ฝั่ง Trader) — กำไรสะสมของเดือนที่กำลังดูอยู่
 *
 * อ่านจาก analyticsStore.dailyPnl ชุดเดียวกับปฏิทินด้านบนของหน้านี้ (โหลดโดย
 * loadCalendarPnl) ไม่ได้ยิง endpoint เพิ่มและไม่ได้ประมาณค่าวันที่ไม่มีข้อมูล
 * จุดสุดท้ายของเส้นจึงเท่ากับตัวเลข "month p&l" ที่โชว์อยู่บนการ์ดใบเดียวกันเสมอ
 *
 * ตัดท้ายที่วันสุดท้ายที่มี P&L จริง ไม่ลากเส้นแบนไปจนสิ้นเดือน — เดือนปัจจุบันที่เพิ่ง
 * ผ่านไปครึ่งเดือนจะได้ไม่ดูเหมือนหยุดเทรดไปแล้ว
 */
const shareMomentum = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStr = String(month + 1).padStart(2, '0');
  const monthLabel = currentDate.value.toLocaleDateString('en-GB', { month: 'short' });

  const categories: string[] = [];
  const data: number[] = [];
  let cumulative = 0;
  let lastDayWithPnl = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
    const pnl = analyticsStore.dailyPnl[dateStr];

    if (pnl !== undefined) {
      cumulative += Number(pnl);
      lastDayWithPnl = day;
    }

    categories.push(`${day} ${monthLabel}`);
    // ปัดที่นี่ไม่ใช่ตอน render เพราะ Apex เอาค่าดิบไปคิดสเกลแกน Y ด้วย
    data.push(Number(cumulative.toFixed(2)));
  }

  return {
    categories: categories.slice(0, lastDayWithPnl),
    data: data.slice(0, lastDayWithPnl),
  };
});

/**
 * ต้องมีอย่างน้อย 2 จุดถึงจะเป็น "เส้น" ได้ — เดือนที่มี P&L วันเดียวจะได้จุดลอยๆ
 * จุดเดียวกลางการ์ด ซึ่งดูเหมือนบั๊กมากกว่าข้อมูล
 */
const hasShareMomentum = computed(() => shareMomentum.value.data.length >= 2);

/** ปิดท้ายเดือนเป็นบวกไหม — ใช้เลือกสีเส้นให้ตรงกับความจริง ไม่ได้เขียวไว้ก่อนตามเรฟ */
const shareMomentumIsUp = computed(() => {
  const data = shareMomentum.value.data;
  return (data[data.length - 1] ?? 0) >= 0;
});

const SHARE_MOMENTUM_UP = '#4c8a87';
const SHARE_MOMENTUM_DOWN = '#e5484d';

const shareMomentumSeries = computed(() => [
  { name: 'Cumulative P&L', data: shareMomentum.value.data },
]);

const shareMomentumOptions = computed<ApexOptions>(() => {
  const stroke = shareMomentumIsUp.value ? SHARE_MOMENTUM_UP : SHARE_MOMENTUM_DOWN;
  const isDark = $q.dark.isActive;
  const axisColor = isDark ? '#7d8c89' : '#8a9b98';

  return {
    chart: {
      type: 'area',
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: false },
      parentHeightOffset: 0,
      // ต้องปิด — html2canvas ถ่ายภาพทันทีที่กด Save ถ้า animation ยังวิ่งอยู่
      // เส้นจะติดไปในไฟล์แค่ครึ่งเดียว (สาเหตุเดียวกับที่ heroSparklineOptions ปิดไว้)
      animations: { enabled: false },
    },
    colors: [stroke],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2.5, lineCap: 'round' },
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.32, opacityTo: 0, stops: [0, 100] },
    },
    grid: {
      borderColor: isDark ? '#394141' : '#dae7e5',
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 4, bottom: 0, left: 4 },
    },
    markers: { size: 0 },
    legend: { show: false },
    tooltip: { enabled: false },
    xaxis: {
      categories: shareMomentum.value.categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
      // ตัวเลขวันที่ทุกวันจะทับกันจนอ่านไม่ออกบนการ์ดกว้าง ~380px — ให้ Apex
      // เว้นระยะเองแล้วเหลือราว 5 หลักเหมือนในเรฟ
      tickAmount: Math.min(4, Math.max(1, shareMomentum.value.categories.length - 1)),
      labels: {
        rotate: 0,
        hideOverlappingLabels: true,
        style: { fontSize: '8px', fontWeight: 600, colors: axisColor },
      },
    },
    yaxis: {
      labels: {
        style: { fontSize: '8px', fontWeight: 600, colors: axisColor },
        formatter: (value: number) => formatShareMoney(value, value !== 0),
      },
    },
    theme: { mode: isDark ? 'dark' : 'light' },
  };
});

/**
 * QR บน footer ของการ์ดแชร์ — generate เป็น data URL แล้ว render เป็น <img>
 * ไม่ใช่ <canvas> เพราะ html2canvas โคลน DOM ก่อนวาด และ canvas ที่ถูกโคลนจะกลาย
 * เป็นผืนว่าง (บริบทการวาดไม่ได้ถูกโคลนตามไปด้วย) — <img> ที่มี data URL ปลอดภัยกว่า
 */
const shareQrDataUrl = ref('');

const buildShareQr = async () => {
  if (shareQrDataUrl.value) return;

  try {
    shareQrDataUrl.value = await QRCode.toDataURL(SHARE_QR_TARGET_URL, {
      ...SHARE_QR_OPTIONS,
      color: { ...SHARE_QR_OPTIONS.color },
    });
  } catch (error) {
    // QR พังไม่ควรทำให้การ์ดแชร์ทั้งใบเปิดไม่ได้ — footer จะซ่อน QR ไปเฉยๆ
    console.error('Failed to build share QR code:', error);
    shareQrDataUrl.value = '';
  }
};

/**
 * สร้างตอนเปิด dialog ไม่ใช่ตอน mount หน้า — คนส่วนใหญ่เข้า Dashboard โดยไม่กด Share
 * และ toDataURL() เป็น async จึงต้องเสร็จก่อนที่ html2canvas จะเริ่มถ่าย
 */
watch(shareDialogOpen, (isOpen) => {
  if (isOpen) void buildShareQr();
});

/**
 * html2canvas โคลน DOM ณ วินาทีที่ถูกเรียก แล้ววาดจากสิ่งที่เห็นตอนนั้น — อะไรที่ยัง
 * โหลด/วาดไม่เสร็จจะกลายเป็นช่องว่างในไฟล์ PNG โดยไม่มี error ให้จับ จึงต้องรอสองอย่าง
 * ก่อนกดชัตเตอร์:
 *
 *   1. <svg> ของ ApexCharts — Apex วาดแบบ async หลัง mount ถ้าถ่ายก่อนจะได้กรอบเปล่า
 *   2. <img> ทุกตัวในการ์ด (QR) — data URL ก็ยังต้องรอ decode
 */
const waitForShareCardReady = async (element: HTMLElement) => {
  if (hasShareMomentum.value) {
    for (let attempt = 0; attempt < 40 && !element.querySelector('.apexcharts-svg'); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  await Promise.all(
    [...element.querySelectorAll('img')].map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        }),
    ),
  );

  // เว้นสอง frame ให้เบราว์เซอร์ paint สิ่งที่เพิ่งเสร็จออกมาจริงก่อน
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
  );
};

const downloadStatsImage = async () => {
  const element = document.getElementById('share-image-area');
  if (!element) return;

  isSavingImage.value = true;
  try {
    // QR สร้างตอนเปิด dialog อยู่แล้ว แต่กันกรณีกด Save เร็วกว่าที่ toDataURL() จะเสร็จ
    await buildShareQr();
    await waitForShareCardReady(element);

    const canvas = await html2canvas(element, {
      backgroundColor: $q.dark.isActive ? '#1f2323' : '#fdfefe',
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const link = document.createElement('a');
    const portfolioSlug = (activePort.value?.name || 'stats').toLowerCase().replace(/\s+/g, '-');
    link.download = `wisenancial-${portfolioSlug}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    $q.notify({
      type: 'positive',
      message: 'Image saved!',
      icon: 'check_circle',
      position: 'top',
      timeout: 2000,
    });
  } catch (error) {
    console.error('Failed to generate image:', error);
    $q.notify({
      type: 'negative',
      message: 'Failed to save image. Please try again.',
      position: 'top',
    });
  } finally {
    isSavingImage.value = false;
  }
};
</script>

<template>
  <q-page class="dashboard-page q-pa-md q-pa-lg-xl">
    <div class="row items-center justify-between q-mb-md q-mt-xs">
      <div class="text-subtitle2 text-muted q-mt-xs">
        Current Portfolio:
        <span class="text-primary text-weight-bold q-ml-xs">{{
          activePort?.name || 'No portfolio selected'
        }}</span>
      </div>

      <div class="row q-gutter-sm">
        <!-- รายงานภาษีคำนวณจาก trades ของฝั่ง Forex — โหมด Stock ยังไม่มีตัวเทียบ -->
        <q-btn
          v-if="activePort && isTrader"
          unelevated
          dense
          icon="receipt_long"
          label="Tax"
          class="btn-outline-modern text-weight-bold q-px-sm"
          @click="showTaxDialog = true"
        >
          <q-tooltip>Trading P&amp;L Tax Summary</q-tooltip>
        </q-btn>

        <!-- การ์ดแชร์ — เนื้อหาแตกต่างกันตามโหมด (ดู q-dialog ด้านล่าง) Trader โชว์ win
             rate/trades/best pair จาก journalStore.trades, Investor โชว์ total
             return/holdings/best performer จาก investorStore ที่โหลดไว้แล้ว -->
        <q-btn
          v-if="activePort"
          unelevated
          dense
          icon="ios_share"
          label="Share"
          color="primary"
          class="share-btn-main text-weight-bold q-px-sm"
          @click="shareDialogOpen = true"
        >
          <q-tooltip class="bg-primary text-white text-weight-bold shadow-4"
            >Share your stats</q-tooltip
          >
        </q-btn>
      </div>
    </div>

    <q-banner
      v-if="!activePort"
      class="custom-banner warning-banner rounded-borders q-mb-md q-pa-sm"
    >
      <template v-slot:avatar><q-icon name="warning" size="sm" /></template>
      <div class="text-weight-medium text-body2">
        You haven't selected a portfolio yet. Please select one to view the Dashboard.
      </div>
    </q-banner>

    <template v-else>
      <q-card v-if="heroCard" class="hero-card q-mb-md" data-test="hero-card">
        <div class="hero-left">
          <div class="hero-eyebrow">{{ heroCard.label }}</div>
          <div class="hero-value">{{ heroCard.value }}</div>

          <div v-if="heroDeltaCard" class="hero-delta" :class="`text-${heroDeltaCard.tone}`">
            <q-icon
              :name="heroDeltaCard.icon"
              size="16px"
              :class="heroDeltaCard.tone === 'primary' ? 'text-main' : ''"
            />
            <span>{{ heroDeltaCard.value }}</span>
            <span class="hero-delta-sub">{{ heroDeltaCard.label }}</span>
          </div>

          <div class="hero-sub">{{ heroCard.subLabel }}</div>
        </div>

        <div v-if="analyticsStore.chartData" class="hero-spark">
          <VueApexCharts
            type="area"
            width="100%"
            height="76"
            :options="heroSparklineOptions"
            :series="analyticsStore.chartData.series"
          />
        </div>
      </q-card>

      <div class="row q-col-gutter-md q-mb-lg">
        <div v-for="card in kpiCards" :key="card.label" class="col-12 col-sm-4">
          <q-card class="dashboard-card stat-card h-full q-pa-md flex column justify-between">
            <div class="row items-center no-wrap q-mb-sm kpi-top">
              <div class="icon-box" :class="`bg-icon-${card.tone} text-${card.tone}`">
                <q-icon :name="card.icon" size="17px" />
              </div>
              <div class="text-muted text-weight-bold stat-label q-ml-sm ellipsis">
                {{ card.label }}
              </div>
            </div>
            <div>
              <div
                class="stat-val text-weight-bolder tracking-tight"
                :class="card.tone === 'primary' ? 'text-main' : `text-${card.tone}`"
              >
                {{ card.value }}
              </div>
              <div class="text-muted text-weight-medium stat-sub-label">{{ card.subLabel }}</div>
            </div>
          </q-card>
        </div>
      </div>

      <div class="row q-mb-lg">
        <div class="col-12">
          <q-card class="dashboard-card h-full flex column overflow-hidden">
            <div class="q-pa-sm q-px-md header-divider flex items-center justify-between">
              <div class="text-subtitle1 text-weight-bold text-main flex items-center q-px-xs">
                <q-icon name="insights" color="primary" size="sm" class="q-mr-sm" />
                Portfolio Growth
              </div>
              <q-btn-toggle
                v-model="chartTimeframe"
                unelevated
                rounded
                class="filter-toggle text-weight-bold q-mr-sm"
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
                size="11px"
              />
            </div>

            <div
              class="chart-container flex-grow q-mt-xs q-px-md"
              style="min-width: 0; width: 100%"
            >
              <VueApexCharts
                v-if="analyticsStore.chartData"
                type="area"
                width="100%"
                height="320"
                :options="chartOptions"
                :series="analyticsStore.chartData.series"
                style="min-height: 380px"
              />
            </div>
          </q-card>
        </div>
      </div>

      <!-- Insights จาก pair/strategy/emotion เป็นแนวคิดของฝั่ง Forex เท่านั้น -->
      <div v-if="isTrader" class="row q-col-gutter-md q-col-gutter-lg-lg q-mb-lg items-stretch">
        <div class="col-12 col-md-4">
          <q-card class="dashboard-card h-full flex column q-pa-md">
            <div class="text-subtitle1 text-weight-bold text-main q-mb-sm flex items-center">
              <div class="icon-box-sm bg-icon-primary text-primary q-mr-sm">
                <q-icon name="currency_exchange" size="16px" />
              </div>
              Pair Performance
            </div>

            <div class="column q-gutter-y-md flex-grow-1 justify-center q-pb-xs">
              <div
                class="inner-card bg-icon-positive flex column justify-center q-px-md q-py-lg relative-position overflow-hidden"
              >
                <div class="row items-center justify-between z-top">
                  <div>
                    <div
                      class="text-caption text-positive text-weight-bold text-uppercase tracking-wide"
                      style="font-size: 10px"
                    >
                      Best Pair
                    </div>
                    <div
                      class="text-h5 text-weight-bolder text-main q-mt-xs"
                      style="line-height: 1"
                    >
                      {{ pairStats.best.name }}
                    </div>
                  </div>
                  <div class="text-subtitle1 text-positive text-weight-bolder z-top">
                    +${{
                      pairStats.best.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })
                    }}
                  </div>
                </div>
                <q-icon
                  name="trending_up"
                  class="absolute text-positive opacity-20"
                  size="80px"
                  style="right: -10px; bottom: -15px; z-index: 0"
                />
              </div>

              <div
                class="inner-card bg-icon-negative flex column justify-center q-px-md q-py-lg relative-position overflow-hidden"
              >
                <div class="row items-center justify-between z-top">
                  <div>
                    <div
                      class="text-caption text-negative text-weight-bold text-uppercase tracking-wide"
                      style="font-size: 10px"
                    >
                      Worst Pair
                    </div>
                    <div
                      class="text-h5 text-weight-bolder text-main q-mt-xs"
                      style="line-height: 1"
                    >
                      {{ pairStats.worst.name }}
                    </div>
                  </div>
                  <div class="text-subtitle1 text-negative text-weight-bolder z-top">
                    {{
                      pairStats.worst.pnl === 0
                        ? '$0.00'
                        : '-$' +
                          Math.abs(pairStats.worst.pnl).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })
                    }}
                  </div>
                </div>
                <q-icon
                  name="trending_down"
                  class="absolute text-negative opacity-20"
                  size="80px"
                  style="right: -10px; bottom: -15px; z-index: 0"
                />
              </div>
            </div>
          </q-card>
        </div>

        <div class="col-12 col-md-8">
          <q-card class="dashboard-card h-full flex column q-pa-md">
            <div class="text-subtitle1 text-weight-bold text-main q-mb-sm flex items-center">
              <div class="icon-box-sm bg-icon-primary text-primary q-mr-sm">
                <q-icon name="troubleshoot" size="16px" />
              </div>
              Trading Insights
            </div>

            <div class="row q-col-gutter-sm flex-grow-1">
              <div v-for="item in insightsData" :key="item.label" class="col-12 col-sm-6">
                <div
                  class="inner-card bg-card-soft h-full column justify-between q-pa-sm transition-hover"
                >
                  <div class="row items-center q-mb-xs q-px-xs">
                    <q-icon
                      :item="item.icon"
                      :name="item.icon"
                      size="16px"
                      class="text-muted q-mr-sm"
                    />
                    <span class="text-subtitle2 text-main text-weight-bold">{{ item.label }}</span>
                  </div>

                  <div class="column q-gutter-y-xs">
                    <div class="row items-center justify-between insight-pill bg-card shadow-sm">
                      <div class="row items-center text-ellipsis" style="max-width: 65%">
                        <div class="icon-micro bg-icon-positive text-positive q-mr-xs">
                          <q-icon name="arrow_upward" size="12px" text-weight-bolder />
                        </div>
                        <span class="text-caption text-main text-weight-bold text-ellipsis">{{
                          item.stats.best.name
                        }}</span>
                      </div>
                      <div class="text-caption text-positive text-weight-bolder">
                        +${{
                          item.stats.best.pnl.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })
                        }}
                      </div>
                    </div>

                    <div class="row items-center justify-between insight-pill bg-card shadow-sm">
                      <div class="row items-center text-ellipsis" style="max-width: 65%">
                        <div class="icon-micro bg-icon-negative text-negative q-mr-xs">
                          <q-icon name="arrow_downward" size="12px" text-weight-bolder />
                        </div>
                        <span class="text-caption text-main text-weight-bold text-ellipsis">{{
                          item.stats.worst.name
                        }}</span>
                      </div>
                      <div class="text-caption text-negative text-weight-bolder">
                        {{
                          item.stats.worst.pnl === 0
                            ? '$0.00'
                            : '-$' +
                              Math.abs(item.stats.worst.pnl).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              })
                        }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </q-card>
        </div>
      </div>

      <!-- Goal + ปฏิทิน = ของฝั่ง Forex ทั้งแถว
           การ์ด Goal อ่านจาก GoalStore ที่คิดจาก trades ของ Forex ส่วน Goals เวอร์ชัน stock
           (สเปก 5.6) ยังเป็นงานค้าง — ดูหมายเหตุที่ route /Goals ใน router/routes.ts -->
      <div v-if="isTrader" class="row q-col-gutter-md q-col-gutter-lg-lg q-mb-lg items-stretch">
        <div class="col-12 col-md-4">
          <q-card class="dashboard-card h-full flex column q-pa-md">
            <!-- Header -->
            <div class="row items-center justify-between q-mb-md header-divider q-pb-sm">
              <div class="flex items-center">
                <div class="icon-box-sm bg-icon-primary text-primary q-mr-sm">
                  <q-icon name="track_changes" size="16px" />
                </div>
                <span class="text-subtitle1 text-weight-bold text-main">
                  Goal — {{ monthlyGoal.monthName }}
                </span>
              </div>
              <span
                v-if="monthlyGoal.targetProfit > 0"
                class="goal-status-badge"
                :class="goalStatusClass"
              >
                {{ goalStatusLabel }}
              </span>
            </div>

            <!-- Has Goal -->
            <div v-if="monthlyGoal.targetProfit > 0" class="column flex-grow-1 q-gutter-y-sm">
              <!-- Progress bar + percent -->
              <div>
                <div class="row items-center justify-between q-mb-xs">
                  <span class="text-caption text-muted text-weight-bold">PROGRESS</span>
                  <span class="text-subtitle2 text-weight-bolder text-primary">
                    {{ monthlyGoal.progressPercent.toFixed(1) }}%
                  </span>
                </div>
                <q-linear-progress
                  :value="Math.min(monthlyGoal.progressPercent / 100, 1)"
                  rounded
                  size="10px"
                  class="goal-progress-bar"
                  :color="monthlyGoal.progressPercent >= 100 ? 'positive' : 'primary'"
                  :track-color="$q.dark.isActive ? 'grey-9' : 'grey-3'"
                />
              </div>

              <!-- Achieved / Target -->
              <div class="goal-amount-row flex-grow-1" style="min-height: 0">
                <div class="goal-amount-block column justify-center" style="flex: 1">
                  <div class="goal-amount-label">Achieved</div>
                  <div
                    class="text-h6 text-weight-bolder"
                    :class="monthlyGoal.totalAchieved >= 0 ? 'text-positive' : 'text-negative'"
                  >
                    {{ monthlyGoal.totalAchieved >= 0 ? '+' : '-' }}${{
                      Math.abs(monthlyGoal.totalAchieved).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })
                    }}
                  </div>
                  <div class="text-caption text-muted q-mt-xs">of month target</div>
                </div>
                <div class="goal-amount-divider" />
                <div class="goal-amount-block column justify-center" style="flex: 1">
                  <div class="goal-amount-label">Target</div>
                  <div class="text-h6 text-weight-bolder text-main">
                    ${{
                      monthlyGoal.targetProfit.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                      })
                    }}
                  </div>
                  <div class="text-caption text-muted q-mt-xs">monthly goal</div>
                </div>
              </div>

              <!-- Remaining -->
              <div class="goal-remaining-box">
                <div class="column">
                  <span class="goal-amount-label">Remaining</span>
                  <span
                    class="text-caption text-muted"
                    v-if="!isMonthInPast && monthlyGoal.remainingTarget > 0"
                    >Keep going!</span
                  >
                </div>
                <span
                  class="text-subtitle2 text-weight-bolder"
                  :class="monthlyGoal.remainingTarget <= 0 ? 'text-positive' : 'text-warning'"
                >
                  {{
                    monthlyGoal.remainingTarget <= 0
                      ? 'Goal reached! 🎉'
                      : '$' +
                        monthlyGoal.remainingTarget.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })
                  }}
                </span>
              </div>

              <!-- Past month result banner -->
              <div
                v-if="isMonthInPast"
                class="goal-result-banner"
                :class="
                  monthlyGoal.progressPercent >= 100 ? 'goal-result-success' : 'goal-result-fail'
                "
              >
                <q-icon
                  :name="
                    monthlyGoal.progressPercent >= 100 ? 'emoji_events' : 'sentiment_dissatisfied'
                  "
                  size="18px"
                  class="q-mr-xs"
                />
                {{
                  monthlyGoal.progressPercent >= 100
                    ? 'Target achieved this month!'
                    : `Fell short by $${monthlyGoal.remainingTarget.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                }}
              </div>
            </div>

            <!-- No Goal -->
            <div v-else class="column flex-grow-1 justify-center items-center q-pa-lg">
              <q-icon
                name="outlined_flag"
                size="36px"
                class="text-muted q-mb-sm"
                style="opacity: 0.4"
              />
              <div class="text-body2 text-muted text-center" style="opacity: 0.6">
                No goal set for this month
              </div>
            </div>
          </q-card>
        </div>

        <!-- ปฏิทิน daily P&L มีเฉพาะพอร์ต TRADER (backend ไม่คืนค่าให้พอร์ตหุ้น) -->
        <div class="col-12 col-md-8">
          <q-card class="dashboard-card h-full flex column">
            <div class="q-pa-sm q-px-md header-divider flex items-center justify-between">
              <div class="text-subtitle1 text-weight-bold text-main flex items-center q-px-xs">
                <q-icon name="calendar_month" color="primary" size="sm" class="q-mr-sm" />
                Trading Calendar
              </div>
              <div class="row items-center calendar-nav q-mr-sm">
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

            <div class="q-pa-md flex-grow">
              <div
                class="calendar-grid text-weight-bold text-muted q-mb-sm text-uppercase"
                style="font-size: 11px"
              >
                <div class="text-center tracking-wide">Sun</div>
                <div class="text-center tracking-wide">Mon</div>
                <div class="text-center tracking-wide">Tue</div>
                <div class="text-center tracking-wide">Wed</div>
                <div class="text-center tracking-wide">Thu</div>
                <div class="text-center tracking-wide">Fri</div>
                <div class="text-center tracking-wide">Sat</div>
              </div>

              <!-- Fixed 6-row grid: always 42 cells -->
              <div class="calendar-grid calendar-fixed-grid">
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
                      >{{
                        item.pnl > 0
                          ? `$${item.pnl.toFixed(2)}`
                          : `-$${Math.abs(item.pnl).toFixed(2)}`
                      }}
                    </div>
                    <div
                      v-else
                      class="pnl-amount text-muted text-weight-medium"
                      style="opacity: 0.5"
                    >
                      $0
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </q-card>
        </div>
      </div>

      <div v-if="isTrader" class="row">
        <div class="col-12">
          <q-card class="dashboard-card h-full">
            <div class="q-pa-sm q-px-md header-divider flex items-center justify-between">
              <div class="text-subtitle1 text-weight-bold text-main flex items-center q-px-xs">
                <q-icon name="history" color="primary" size="sm" class="q-mr-sm" />
                Recent Trades
              </div>
              <q-btn
                flat
                dense
                color="primary"
                label="View All"
                icon-right="chevron_right"
                class="text-weight-bold q-pr-sm"
                to="/journal"
              />
            </div>

            <div class="q-pa-sm q-px-md">
              <q-table
                v-if="recentTrades.length > 0"
                flat
                dense
                class="custom-table bg-transparent"
                :rows="recentTrades"
                row-key="id"
                hide-pagination
                hide-bottom
                :rows-per-page-options="[0]"
                :columns="[
                  { name: 'date', label: 'Date', field: 'date', align: 'left' },
                  { name: 'pair', label: 'Pair', field: 'pair', align: 'left' },
                  { name: 'type', label: 'Type', field: 'trade_type', align: 'center' },
                  { name: 'pnl', label: 'PnL ($)', field: 'pnl', align: 'right' },
                ]"
              >
                <template v-slot:body-cell-date="props">
                  <q-td :props="props" class="text-muted text-weight-medium text-body2">
                    {{ new Date(props.row.date).toLocaleDateString('en-GB') }}
                  </q-td>
                </template>
                <template v-slot:body-cell-pair="props">
                  <q-td :props="props" class="text-main text-weight-bold text-body2">
                    {{ props.row.pair }}
                  </q-td>
                </template>
                <template v-slot:body-cell-type="props">
                  <q-td :props="props">
                    <q-chip
                      size="sm"
                      class="text-weight-bold custom-chip"
                      :class="props.row.trade_type === 'BUY' ? 'chip-buy' : 'chip-sell'"
                    >
                      {{ props.row.trade_type }}
                    </q-chip>
                  </q-td>
                </template>
                <template v-slot:body-cell-pnl="props">
                  <q-td
                    :props="props"
                    class="text-body2"
                    :class="
                      Number(props.row.pnl) >= 0
                        ? 'text-positive text-weight-bolder'
                        : 'text-negative text-weight-bolder'
                    "
                  >
                    {{ Number(props.row.pnl) >= 0 ? '+' : '' }}${{
                      Number(props.row.pnl).toFixed(2)
                    }}
                  </q-td>
                </template>
              </q-table>

              <div
                v-else
                class="q-pa-md text-center text-muted flex flex-center column opacity-50"
                style="min-height: 160px"
              >
                <q-icon name="receipt_long" size="48px" class="q-mb-md" />
                <div class="text-subtitle1 text-weight-medium">No trade history yet</div>
              </div>
            </div>
          </q-card>
        </div>
      </div>

      <!-- ── โหมด Stock: หุ้นที่ถืออยู่ + สัดส่วน + ตัวขึ้น/ลง + ประวัติกิจกรรม ─────── -->
      <div v-else class="row q-col-gutter-md q-col-gutter-lg-lg items-stretch">
        <div class="col-12">
          <q-card class="dashboard-card h-full">
            <div class="q-pa-sm q-px-md header-divider flex items-center justify-between">
              <div class="text-subtitle1 text-weight-bold text-main flex items-center q-px-xs">
                <q-icon name="inventory_2" color="primary" size="sm" class="q-mr-sm" />
                Holdings
              </div>
              <q-btn
                flat
                dense
                color="primary"
                label="Stock Terminal"
                icon-right="chevron_right"
                class="text-weight-bold q-pr-sm"
                to="/Stocks"
              />
            </div>

            <div class="q-pa-sm q-px-md">
              <q-table
                v-if="investorHoldings.length > 0"
                flat
                dense
                class="custom-table bg-transparent"
                :rows="investorHoldings"
                row-key="symbol"
                hide-pagination
                hide-bottom
                :rows-per-page-options="[0]"
                :columns="[
                  { name: 'symbol', label: 'Symbol', field: 'symbol', align: 'left' },
                  { name: 'shares', label: 'Shares', field: 'shares', align: 'right' },
                  { name: 'avg', label: 'Avg Cost', field: 'average_cost', align: 'right' },
                  { name: 'value', label: 'Market Value', field: 'market_value', align: 'right' },
                  { name: 'pnl', label: 'Unrealized', field: 'unrealized_pnl', align: 'right' },
                ]"
              >
                <template v-slot:body-cell-symbol="props">
                  <q-td :props="props" class="text-main text-weight-bold text-body2">
                    {{ props.row.symbol }}
                    <div class="text-caption text-muted text-weight-regular">
                      {{ props.row.name ?? '—' }}
                    </div>
                  </q-td>
                </template>
                <template v-slot:body-cell-shares="props">
                  <q-td :props="props" class="text-main text-body2">
                    {{ Number(props.row.shares).toLocaleString() }}
                  </q-td>
                </template>
                <template v-slot:body-cell-avg="props">
                  <q-td :props="props" class="text-muted text-body2">
                    {{ formatMoney(Number(props.row.average_cost ?? 0)) }}
                  </q-td>
                </template>
                <template v-slot:body-cell-value="props">
                  <q-td :props="props" class="text-main text-weight-bold text-body2">
                    {{ formatMoney(Number(props.row.market_value ?? 0)) }}
                  </q-td>
                </template>
                <template v-slot:body-cell-pnl="props">
                  <q-td
                    :props="props"
                    class="text-body2 text-weight-bolder"
                    :class="
                      Number(props.row.unrealized_pnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'
                    "
                  >
                    {{ formatMoney(Number(props.row.unrealized_pnl ?? 0), true) }}
                    <div class="text-caption text-weight-regular">
                      {{ Number(props.row.unrealized_percent ?? 0).toFixed(2) }}%
                    </div>
                  </q-td>
                </template>
              </q-table>

              <div
                v-else
                class="q-pa-md text-center text-muted flex flex-center column opacity-50"
                style="min-height: 160px"
              >
                <q-icon name="inventory_2" size="48px" class="q-mb-md" />
                <div class="text-subtitle1 text-weight-medium">ยังไม่มีหุ้นในพอร์ตนี้</div>
              </div>
            </div>
          </q-card>
        </div>

        <!-- ── Asset allocation ─────────────────────────────────────────────── -->
        <div class="col-12 col-md-5">
          <q-card class="dashboard-card h-full flex column" data-test="allocation-card">
            <div class="q-pa-sm q-px-md header-divider flex items-center">
              <div class="text-subtitle1 text-weight-bold text-main flex items-center q-px-xs">
                <q-icon name="donut_large" color="primary" size="sm" class="q-mr-sm" />
                Asset Allocation
              </div>
            </div>

            <div v-if="allocationRows.length > 0" class="q-pa-md flex-grow">
              <VueApexCharts
                type="donut"
                width="100%"
                height="220"
                :options="allocationOptions"
                :series="allocationSeries"
              />

              <!-- สรุปไทย/ต่างประเทศ แยกจากนามสกุลสัญลักษณ์จริง ไม่ใช่ค่าคงที่ -->
              <div class="row q-col-gutter-sm q-mt-sm">
                <div
                  v-for="group in allocationByClass"
                  :key="group.label"
                  class="col-6"
                  data-test="allocation-class"
                >
                  <div class="inner-card bg-card-soft q-pa-sm">
                    <div class="text-caption text-muted text-weight-bold">{{ group.label }}</div>
                    <div class="text-subtitle2 text-weight-bolder text-main">
                      {{ group.weight.toFixed(1) }}%
                    </div>
                    <div class="text-caption text-muted">{{ formatMoney(group.value) }}</div>
                  </div>
                </div>
              </div>

              <q-list dense class="q-mt-sm">
                <q-item
                  v-for="row in allocationRows"
                  :key="row.symbol"
                  dense
                  class="q-px-none"
                  data-test="allocation-legend-item"
                >
                  <q-item-section avatar style="min-width: 22px">
                    <span class="alloc-dot" :style="{ backgroundColor: row.color }" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-main text-weight-bold text-body2">
                      {{ row.symbol }}
                    </q-item-label>
                    <q-item-label caption class="text-muted">{{ row.assetClass }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <span class="text-body2 text-weight-bolder text-main">
                      {{ row.weight.toFixed(1) }}%
                    </span>
                    <span class="text-caption text-muted">{{ formatMoney(row.value) }}</span>
                  </q-item-section>
                </q-item>
              </q-list>
            </div>

            <div
              v-else
              class="q-pa-md text-center text-muted flex flex-center column opacity-50 flex-grow"
              style="min-height: 200px"
              data-test="allocation-empty"
            >
              <q-icon name="donut_large" size="48px" class="q-mb-md" />
              <div class="text-subtitle1 text-weight-medium">ยังไม่มีสัดส่วนให้แสดง</div>
            </div>
          </q-card>
        </div>

        <!-- ── Top gainers / losers ─────────────────────────────────────────── -->
        <div class="col-12 col-md-7">
          <q-card class="dashboard-card h-full flex column" data-test="movers-card">
            <div class="q-pa-sm q-px-md header-divider flex items-center">
              <div class="text-subtitle1 text-weight-bold text-main flex items-center q-px-xs">
                <q-icon name="swap_vert" color="primary" size="sm" class="q-mr-sm" />
                Top Movers
              </div>
            </div>

            <div class="q-pa-md flex-grow row q-col-gutter-md">
              <div
                v-for="group in [
                  { key: 'gainers', title: 'Top Gainers', icon: 'trending_up', rows: topGainers },
                  { key: 'losers', title: 'Top Losers', icon: 'trending_down', rows: topLosers },
                ]"
                :key="group.key"
                class="col-12 col-sm-6"
              >
                <div class="row items-center q-mb-sm">
                  <q-icon
                    :name="group.icon"
                    size="16px"
                    class="q-mr-xs"
                    :class="group.key === 'gainers' ? 'text-positive' : 'text-negative'"
                  />
                  <span class="text-caption text-muted text-weight-bold text-uppercase tracking-wide">
                    {{ group.title }}
                  </span>
                </div>

                <q-list v-if="group.rows.length > 0" dense separator>
                  <q-item
                    v-for="row in group.rows"
                    :key="row.symbol"
                    dense
                    class="q-px-none"
                    :data-test="`mover-${group.key}`"
                  >
                    <q-item-section>
                      <q-item-label class="text-main text-weight-bold text-body2">
                        {{ row.symbol }}
                      </q-item-label>
                      <q-item-label caption class="text-muted">{{ row.name ?? '—' }}</q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <span
                        class="text-body2 text-weight-bolder"
                        :class="row.percent >= 0 ? 'text-positive' : 'text-negative'"
                      >
                        {{ row.percent > 0 ? '+' : '' }}{{ row.percent.toFixed(2) }}%
                      </span>
                      <span class="text-caption text-muted">{{ formatMoney(row.pnl, true) }}</span>
                    </q-item-section>
                  </q-item>
                </q-list>

                <div
                  v-else
                  class="q-pa-md text-center text-muted opacity-50"
                  :data-test="`movers-empty-${group.key}`"
                >
                  <div class="text-body2">
                    {{ group.key === 'gainers' ? 'ยังไม่มีตัวที่กำไร' : 'ยังไม่มีตัวที่ขาดทุน' }}
                  </div>
                </div>
              </div>
            </div>
          </q-card>
        </div>

        <!-- ── ประวัติกิจกรรม: ซื้อขาย / ปันผล + export CSV ───────────────────── -->
        <div class="col-12">
          <q-card class="dashboard-card h-full" data-test="activity-card">
            <div class="q-pa-sm q-px-md header-divider flex items-center justify-between">
              <div class="text-subtitle1 text-weight-bold text-main flex items-center q-px-xs">
                <q-icon name="history" color="primary" size="sm" class="q-mr-sm" />
                ประวัติกิจกรรม
              </div>

              <div class="row items-center q-gutter-sm">
                <q-btn-toggle
                  v-model="activityTab"
                  unelevated
                  rounded
                  class="filter-toggle text-weight-bold"
                  toggle-color="primary"
                  :color="$q.dark.isActive ? 'grey-9' : 'grey-2'"
                  :text-color="$q.dark.isActive ? 'grey-4' : 'grey-7'"
                  :options="[
                    { label: 'ซื้อขาย', value: 'trades' },
                    { label: 'ปันผล', value: 'dividends' },
                  ]"
                  size="11px"
                />
                <q-btn
                  unelevated
                  dense
                  icon="download"
                  label="CSV"
                  class="btn-outline-modern text-weight-bold q-px-sm"
                  data-test="activity-export"
                  @click="exportActivityCsv"
                >
                  <q-tooltip>Export ประวัติที่เลือกเป็นไฟล์ CSV</q-tooltip>
                </q-btn>
              </div>
            </div>

            <div class="q-pa-sm q-px-md">
              <!-- แท็บซื้อขาย -->
              <template v-if="activityTab === 'trades'">
                <q-list v-if="activityRows.length > 0" separator>
                  <q-item
                    v-for="item in activityRows.slice(0, ACTIVITY_PREVIEW_LIMIT)"
                    :key="item.id"
                    dense
                    data-test="activity-row"
                  >
                    <q-item-section>
                      <q-item-label class="text-main text-weight-bold text-body2">
                        {{ item.symbol ?? item.type }}
                      </q-item-label>
                      <q-item-label caption class="text-muted">
                        {{ item.description ?? item.type }} •
                        {{ new Date(item.occurred_at).toLocaleDateString('en-GB') }}
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <span
                        class="text-body2 text-weight-bolder"
                        :class="Number(item.amount) >= 0 ? 'text-positive' : 'text-negative'"
                      >
                        {{ formatMoney(Number(item.amount), true) }}
                      </span>
                    </q-item-section>
                  </q-item>
                </q-list>

                <div
                  v-else
                  class="q-pa-md text-center text-muted flex flex-center column opacity-50"
                  style="min-height: 160px"
                  data-test="activity-empty"
                >
                  <q-icon name="history" size="48px" class="q-mb-md" />
                  <div class="text-subtitle1 text-weight-medium">ยังไม่มีความเคลื่อนไหว</div>
                </div>
              </template>

              <!-- แท็บปันผล -->
              <template v-else>
                <q-list v-if="dividendRows.length > 0" separator>
                  <q-item
                    v-for="item in dividendRows.slice(0, ACTIVITY_PREVIEW_LIMIT)"
                    :key="item.id"
                    dense
                    data-test="dividend-row"
                  >
                    <q-item-section>
                      <q-item-label class="text-main text-weight-bold text-body2">
                        {{ item.symbol }}
                      </q-item-label>
                      <q-item-label caption class="text-muted">
                        {{ Number(item.shares).toLocaleString() }} หุ้น ×
                        {{ Number(item.dividend_per_share).toFixed(2) }} •
                        {{ new Date(item.payment_date).toLocaleDateString('en-GB') }}
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <span class="text-body2 text-weight-bolder text-positive">
                        {{ formatMoney(Number(item.net_amount), true) }}
                      </span>
                      <span class="text-caption text-muted">
                        หัก ณ ที่จ่าย {{ formatMoney(Number(item.tax_withheld)) }}
                      </span>
                    </q-item-section>
                  </q-item>
                </q-list>

                <div
                  v-else
                  class="q-pa-md text-center text-muted flex flex-center column opacity-50"
                  style="min-height: 160px"
                  data-test="dividend-empty"
                >
                  <q-icon name="payments" size="48px" class="q-mb-md" />
                  <div class="text-subtitle1 text-weight-medium">ยังไม่มีเงินปันผล</div>
                </div>
              </template>
            </div>
          </q-card>
        </div>
      </div>
    </template>
    <q-dialog v-model="shareDialogOpen" backdrop-filter="blur(10px) saturate(1.3)">
      <q-card class="bg-transparent no-shadow column items-center share-dialog-wrapper">
        <!-- ── Share Card — re-themed to the app's real teal/sage tokens (was an
             unrelated indigo/amber palette left over from before rebrand); content
             branches Trader vs Investor since win rate/best pair don't apply to a
             long-term stock portfolio ── -->
        <div
          id="share-image-area"
          class="share-card-v3 overflow-hidden relative-position column w-full"
        >
          <!-- Sheen layer — teal, not the old amber/indigo warm overlay -->
          <div class="share-warm-overlay absolute-full" />

          <!-- Corner accent dots -->
          <div class="share-dot share-dot-tl" />
          <div class="share-dot share-dot-br" />

          <!-- Header row: wordmark left, date right -->
          <div class="share-header-row z-top">
            <div class="share-wm-top">WISENANCIAL</div>
            <div class="share-header-date">
              {{
                new Date().toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              }}
            </div>
          </div>

          <!-- Account chip -->
          <div class="z-top share-account-chip-wrap">
            <div class="share-account-chip">
              <span class="share-account-at">@</span>
              <span class="share-account-text">{{ activePort?.name || '—' }}</span>
            </div>
            <div class="share-period-pill">{{ calendarMonthYear }}</div>
          </div>

          <template v-if="isTrader">
            <!-- Hero balance -->
            <div class="z-top share-hero-section">
              <div class="share-hero-label">portfolio balance</div>
              <div class="share-hero-num">
                {{ formatMoney(Number(currentBalance)) }}
              </div>
              <div class="share-growth-tag" :class="growthPercentage >= 0 ? 'tag-up' : 'tag-down'">
                {{ growthPercentage >= 0 ? '↑' : '↓' }}{{ Math.abs(growthPercentage).toFixed(2) }}%
                overall
              </div>
            </div>

            <div class="share-thin-line z-top" />

            <!-- Stats row — 3 big numbers -->
            <div class="z-top share-big-stats">
              <div class="share-big-stat">
                <div class="share-big-num" :class="totalPnL >= 0 ? 'num-green' : 'num-red'">
                  {{ formatShareMoney(totalPnL, true) }}
                </div>
                <div class="share-big-label">month p&amp;l</div>
              </div>
              <div class="share-big-stat-sep" />
              <div class="share-big-stat">
                <div class="share-big-num num-amber">
                  {{ winRate.toFixed(1) }}<span class="share-big-unit">%</span>
                </div>
                <div class="share-big-label">win rate</div>
              </div>
              <div class="share-big-stat-sep" />
              <div class="share-big-stat">
                <div class="share-big-num">{{ totalTrades }}</div>
                <div class="share-big-label">trades</div>
              </div>
            </div>

            <!-- Mini stats chips row -->
            <div class="z-top share-chips-row">
              <div class="share-chip">
                <span class="chip-dot dot-green" />
                <span class="chip-label">{{ winningTrades }} wins</span>
              </div>
              <div class="share-chip">
                <span class="chip-dot dot-red" />
                <span class="chip-label">{{ losingTrades }} losses</span>
              </div>
              <div class="share-chip" v-if="pairStats.best.name !== '-'">
                <span class="chip-dot dot-blue" />
                <span class="chip-label">{{ pairStats.best.name }}</span>
              </div>
              <div class="share-chip" v-if="growthPercentage !== 0">
                <span class="chip-dot dot-amber" />
                <span class="chip-label">{{ Math.abs(growthPercentage).toFixed(1) }}% growth</span>
              </div>
            </div>

            <!-- Goal bar (only if set) -->
            <div v-if="monthlyGoal.targetProfit > 0" class="z-top share-goal-area">
              <div class="share-goal-header">
                <span class="share-goal-label">monthly goal</span>
                <span
                  class="share-goal-pct-v3"
                  :class="monthlyGoal.progressPercent >= 100 ? 'pct-done' : ''"
                >
                  {{ monthlyGoal.progressPercent.toFixed(0) }}%
                </span>
              </div>
              <div class="share-goal-bar">
                <div
                  class="share-goal-bar-fill"
                  :style="{ width: Math.min(monthlyGoal.progressPercent, 100) + '%' }"
                  :class="monthlyGoal.progressPercent >= 100 ? 'fill-done' : ''"
                />
              </div>
              <div class="share-goal-sub">
                {{ formatShareMoney(monthlyGoal.totalAchieved) }}
                <span class="share-goal-of">of</span>
                {{ formatShareMoney(monthlyGoal.targetProfit) }}
              </div>
            </div>

            <!-- Monthly Momentum — กำไรสะสมรายวันของเดือนนี้ ซ่อนไปถ้ามี P&L ไม่ถึง 2 วัน -->
            <div v-if="hasShareMomentum" class="z-top share-momentum" data-test="share-momentum">
              <div class="share-momentum-label">Monthly Momentum</div>
              <VueApexCharts
                type="area"
                width="100%"
                height="120"
                :options="shareMomentumOptions"
                :series="shareMomentumSeries"
              />
            </div>
          </template>

          <template v-else>
            <!-- Hero value — "portfolio value" not "balance": for Investor this is
                 holdings' market value + cash, not a single account balance -->
            <div class="z-top share-hero-section">
              <div class="share-hero-label">portfolio value</div>
              <div class="share-hero-num">
                {{ formatMoney(investorSummary?.portfolio_value ?? 0) }}
              </div>
              <div
                class="share-growth-tag"
                :class="(investorSummary?.total_return_percent ?? 0) >= 0 ? 'tag-up' : 'tag-down'"
              >
                {{ (investorSummary?.total_return_percent ?? 0) >= 0 ? '↑' : '↓' }}{{
                  Math.abs(investorSummary?.total_return_percent ?? 0).toFixed(2)
                }}% overall
              </div>
            </div>

            <div class="share-thin-line z-top" />

            <!-- Stats row — total P&L instead of "month" p&l: holdings don't reset
                 monthly the way discrete forex trades do, so an all-time figure is
                 the honest number to show here -->
            <div class="z-top share-big-stats">
              <div class="share-big-stat">
                <div
                  class="share-big-num"
                  :class="(investorSummary?.total_pnl ?? 0) >= 0 ? 'num-green' : 'num-red'"
                >
                  {{ formatShareMoney(investorSummary?.total_pnl ?? 0, true) }}
                </div>
                <div class="share-big-label">total p&amp;l</div>
              </div>
              <div class="share-big-stat-sep" />
              <div class="share-big-stat">
                <div
                  class="share-big-num"
                  :class="(investorSummary?.total_return_percent ?? 0) >= 0 ? 'num-green' : 'num-red'"
                >
                  {{ (investorSummary?.total_return_percent ?? 0) >= 0 ? '+' : '' }}{{
                    (investorSummary?.total_return_percent ?? 0).toFixed(1)
                  }}<span class="share-big-unit">%</span>
                </div>
                <div class="share-big-label">total return</div>
              </div>
              <div class="share-big-stat-sep" />
              <div class="share-big-stat">
                <div class="share-big-num">{{ investorHoldings.length }}</div>
                <div class="share-big-label">holdings</div>
              </div>
            </div>

            <!-- Mini stats chips row -->
            <div class="z-top share-chips-row">
              <div
                class="share-chip"
                v-if="shareBestHolding.symbol !== '-'"
                data-test="share-best-holding"
              >
                <span
                  class="chip-dot"
                  :class="shareBestHolding.returnPercent >= 0 ? 'dot-green' : 'dot-red'"
                />
                <span class="chip-label">
                  {{ shareBestHolding.symbol }} {{ shareBestHolding.returnPercent >= 0 ? '+' : '' }}{{
                    shareBestHolding.returnPercent.toFixed(1)
                  }}%
                </span>
              </div>
              <div class="share-chip" v-if="allocationByClass[0]">
                <span class="chip-dot dot-blue" />
                <span class="chip-label">
                  {{ allocationByClass[0].label }} {{ allocationByClass[0].weight.toFixed(0) }}%
                </span>
              </div>
            </div>

            <!-- Allocation bar — reuses the same top-3-by-weight data as the Asset
                 Allocation card, not invented sector data -->
            <div v-if="shareAllocationTop.length > 0" class="z-top share-goal-area">
              <div class="share-goal-header">
                <span class="share-goal-label">portfolio allocation</span>
              </div>
              <div class="share-alloc-bar">
                <div
                  v-for="seg in shareAllocationTop"
                  :key="seg.label"
                  class="share-alloc-segment"
                  data-test="share-alloc-segment"
                  :style="{ width: seg.weight + '%', background: seg.color }"
                />
              </div>
              <div class="share-alloc-legend">
                <span
                  v-for="seg in shareAllocationTop"
                  :key="seg.label"
                  class="share-alloc-legend-item"
                  data-test="share-alloc-legend-item"
                >
                  <span class="share-alloc-dot" :style="{ background: seg.color }" />
                  {{ seg.label }} {{ seg.weight.toFixed(0) }}%
                </span>
              </div>
            </div>
          </template>

          <!-- Footer -->
          <div class="share-footer-v3 z-top">
            <div class="share-footer-tracked">
              <div class="share-footer-mark">W</div>
              <div class="share-footer-copy">
                <span class="share-footer-on">Tracked on</span>
                <span class="share-footer-brand">wisenancial.app</span>
              </div>
            </div>
            <img
              v-if="shareQrDataUrl"
              class="share-footer-qr"
              data-test="share-qr"
              :src="shareQrDataUrl"
              alt="QR code to wisenancial.app"
            />
          </div>
        </div>

        <!-- Action buttons -->
        <div class="row justify-center q-mt-md gap-md w-full">
          <q-btn
            flat
            rounded
            class="share-action-close q-px-lg text-weight-bold"
            label="Close"
            v-close-popup
          />
          <q-btn
            unelevated
            rounded
            class="share-action-save q-px-lg text-weight-bold"
            icon="download"
            label="Save Image"
            :loading="isSavingImage"
            @click="downloadStatsImage"
          />
        </div>
      </q-card>
    </q-dialog>

    <!-- ── Tax Report Dialog ─────────────────────────────────────────────── -->
    <q-dialog v-model="showTaxDialog" persistent>
      <q-card class="tax-cert-card" style="width: 600px; max-width: 96vw">
        <!-- Card Header -->
        <div class="row items-center justify-between q-px-lg q-pt-lg q-pb-sm">
          <div class="row items-center q-gutter-sm">
            <q-icon name="receipt_long" size="18px" color="grey-6" />
            <span
              class="text-caption text-muted text-weight-bold text-uppercase"
              style="letter-spacing: 0.06em"
              >Tax Certificate</span
            >
          </div>
          <div class="row q-gutter-xs">
            <q-btn
              flat
              round
              dense
              size="sm"
              icon="print"
              class="text-muted"
              @click="printTaxReport"
            >
              <q-tooltip>Print / Save PDF</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="sm" icon="close" class="text-muted" v-close-popup />
          </div>
        </div>

        <!-- Certificate Paper -->
        <div id="tax-print-area" class="tax-paper q-mx-lg q-mb-lg">
          <!-- Paper Header -->
          <div class="tp-header">
            <div class="tp-title">TRADING TAX CERTIFICATE</div>
            <div class="tp-sub">Annual Income &amp; Tax Withholding Summary</div>
            <div class="tp-year-badge">Tax Year: {{ currentTaxYear }}</div>
          </div>

          <!-- Account Info Bar -->
          <div class="tp-info-bar">
            <div>
              <div class="tp-info-label">ACCOUNT HOLDER</div>
              <div class="tp-info-val">{{ portStore.activePortfolio?.name ?? '—' }}</div>
            </div>
            <div class="text-center">
              <div class="tp-info-label">TOTAL TRADES</div>
              <div class="tp-info-val">{{ taxRows.reduce((s, r) => s + r.count, 0) }} Orders</div>
            </div>
            <div class="text-right">
              <div class="tp-info-label">GENERATED</div>
              <div class="tp-info-val">{{ new Date().toLocaleDateString('en-GB') }}</div>
            </div>
          </div>

          <!-- Monthly Table -->
          <table class="tp-table">
            <thead>
              <tr>
                <th>MONTH</th>
                <th class="r">GROSS PROFIT (USD)</th>
                <th class="r">GROSS LOSS (USD)</th>
                <th class="r">NET PNL (USD)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in taxMonthly" :key="r.month">
                <td class="tp-month">{{ r.month }}</td>
                <td class="r tp-profit">+${{ r.profit.toFixed(2) }}</td>
                <td class="r tp-loss">-${{ r.loss.toFixed(2) }}</td>
                <td class="r" :class="r.net >= 0 ? 'tp-neutral' : 'tp-loss'">
                  {{ r.net >= 0 ? '' : '-' }}${{ Math.abs(r.net).toFixed(2) }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Summary Box -->
          <div class="tp-summary-wrap">
            <div class="tp-summary-box">
              <div class="tp-sum-row">
                <span>Total Gross Profit</span>
                <span class="tp-profit"
                  >+${{ taxRows.reduce((s, r) => s + r.profit, 0).toFixed(2) }}</span
                >
              </div>
              <div class="tp-sum-row">
                <span>Total Gross Loss</span>
                <span class="tp-loss"
                  >-${{ taxRows.reduce((s, r) => s + r.loss, 0).toFixed(2) }}</span
                >
              </div>
              <div class="tp-sum-divider" />
              <div class="tp-sum-row tp-sum-bold">
                <span>Annual Net Profit (USD)</span>
                <span :class="annualNet >= 0 ? 'tp-profit' : 'tp-loss'"
                  >${{ annualNet.toFixed(2) }}</span
                >
              </div>
              <div class="tp-sum-row tp-sum-sm">
                <span>Est. Exchange Rate (THB/USD)</span>
                <span>x 34.50</span>
              </div>
              <div class="tp-sum-row tp-sum-sm">
                <span>Est. Taxable Income (THB)</span>
                <span
                  >฿{{
                    annualNet > 0
                      ? (annualNet * 34.5).toLocaleString('th-TH', { minimumFractionDigits: 2 })
                      : '0.00'
                  }}</span
                >
              </div>
              <div class="tp-sum-divider tp-sum-divider--dashed" />
              <div class="tp-sum-row tp-sum-tax">
                <span>ESTIMATED TAX</span>
                <span
                  >฿{{
                    annualNet > 0
                      ? (annualNet * 34.5 * TAX_RATE).toLocaleString('th-TH', {
                          minimumFractionDigits: 2,
                        })
                      : '0.00'
                  }}</span
                >
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="tp-footer">
            <q-icon name="info_outline" size="12px" class="q-mr-xs" />
            This document is for reference only. Consult a licensed tax professional before filing.
          </div>
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped>
/* ==========================================================
   1. CSS Variables สำหรับ Light Mode และ Dark Mode
========================================================== */
/* หน้านี้เคยตั้ง palette ของตัวเองเป็นชุด slate/น้ำเงิน (#f8fafc / #1e293b / #eff6ff)
   ซึ่งค้างมาตั้งแต่ก่อน rebrand แล้วไป override token teal/sage ที่ app.scss ตั้งไว้
   ตอนนี้ยกค่ามาให้ตรงกับ --accent-* ชุดกลางแล้ว (ค่าเดียวกับที่ mockup ใช้เป๊ะ) */
.dashboard-page {
  --bg-page: #f6f9f9;
  --bg-card: #fdfefe;
  --bg-card-soft: #f0f5f4;
  --text-main: #1b3636;
  --text-muted: #789191;
  --border-color: #dae7e5;
  --shadow-card: 0 1px 2px rgba(27, 54, 54, 0.04), 0 12px 32px -12px rgba(27, 54, 54, 0.1);
  --shadow-hover: 0 1px 2px rgba(27, 54, 54, 0.05), 0 18px 40px -14px rgba(27, 54, 54, 0.18);

  --accent-200: #cde5e2;
  --accent-400: #9bc5c0;
  --accent-500: #85b6b0;
  --accent-700: #4c8a87;
  --accent-800: #336160;

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

.body--dark .dashboard-page {
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

/* ==========================================================
   2. Typography & Utilities
========================================================== */
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
.h-full {
  height: 100%;
}
.flex-grow {
  flex-grow: 1;
}
.opacity-20 {
  opacity: 0.2;
}
.opacity-50 {
  opacity: 0.5;
}
.text-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bg-icon-primary {
  background-color: var(--bg-icon-primary);
}
.bg-icon-positive {
  background-color: var(--bg-icon-positive);
}
.bg-icon-warning {
  background-color: var(--bg-icon-warning);
}
.bg-icon-negative {
  background-color: var(--bg-icon-negative);
}
.bg-icon-purple {
  background-color: var(--bg-icon-purple);
}
.bg-card-soft {
  background-color: var(--bg-card-soft);
}

/* ตามแบบ: ไอคอนย้ายมาอยู่ต้นแถวคู่กับ label ขนาดจึงเล็กลงจาก 40px เป็น 32px */
.icon-box {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Filter Toggle */
.filter-toggle {
  border: 1px solid var(--border-color);
}
.filter-toggle :deep(.q-btn) {
  padding: 0 12px;
}

/* ==========================================================
   3. Cards & Containers
========================================================== */
.dashboard-card {
  background: var(--bg-card);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
}

/* stat card hover — เหมือน Journal */
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-hover);
}

/* ==========================================================
   3b. Hero — ยอดรวมพอร์ตใบใหญ่ตามแบบ mockup
========================================================== */
.hero-card {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 28px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  box-shadow: var(--shadow-card);
}

/* แสงเรืองมุมขวาบน ใช้แทนภาพประกอบ ไม่รับคลิก */
.hero-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.5;
  background: radial-gradient(520px 220px at 85% -10%, rgba(133, 182, 176, 0.22), transparent 70%);
}

.hero-left {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.hero-eyebrow {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 8px;
}

.hero-value {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 40px;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--text-main);
}

.hero-delta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.hero-delta-sub {
  color: var(--text-muted);
  font-weight: 500;
  margin-left: 2px;
}

.hero-sub {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.hero-spark {
  position: relative;
  z-index: 1;
  width: 260px;
  max-width: 42%;
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .hero-card {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 22px 20px;
    border-radius: 20px;
  }
  .hero-value {
    font-size: 30px;
  }
  .hero-spark {
    width: 100%;
    max-width: none;
  }
}

.header-divider {
  border-bottom: 1px solid var(--border-color);
}
.custom-banner {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-card);
}

/* ==========================================================
   Goal Card — Minimal Modern
========================================================== */
.goal-status-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  letter-spacing: 0.02em;
}
.badge-done {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
.badge-on-track {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.22);
}
.badge-behind {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.22);
}

.body--dark .badge-done {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.3);
}
.body--dark .badge-on-track {
  background: rgba(96, 165, 250, 0.15);
  color: #60a5fa;
  border-color: rgba(96, 165, 250, 0.3);
}
.body--dark .badge-behind {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.3);
}

.badge-failed {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.25);
}
.body--dark .badge-failed {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}

.goal-result-banner {
  display: flex;
  align-items: center;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
}
.goal-result-success {
  background: rgba(34, 197, 94, 0.1);
  color: var(--q-positive);
  border: 1px solid rgba(34, 197, 94, 0.25);
}
.goal-result-fail {
  background: rgba(239, 68, 68, 0.08);
  color: var(--q-negative);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.goal-progress-bar :deep(.q-linear-progress__model) {
  border-radius: 10px;
}

.goal-amount-row {
  display: flex;
  align-items: stretch;
  gap: 0;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  flex: 1;
}
.goal-amount-block {
  flex: 1;
  padding: 12px 14px;
}
.goal-amount-divider {
  width: 1px;
  align-self: stretch;
  background: var(--border-color);
  flex-shrink: 0;
}
.goal-amount-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.goal-remaining-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 10px 14px;
}

/* Keep old gradient-progress for GoalPage compatibility */
.gradient-progress :deep(.q-linear-progress__model) {
  background: linear-gradient(90deg, var(--accent-400) 0%, var(--accent-600) 50%, var(--accent-900) 100%) !important;
  border-radius: 10px;
}

/* ==========================================================
   5. Calendar Styles
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
  gap: 6px;
}

/* Fixed-height calendar: always 6 rows regardless of month */
.calendar-fixed-grid {
  grid-template-rows: repeat(6, 1fr);
  height: 420px; /* 6 rows × ~65px + 5 gaps × 6px */
}

.calendar-fixed-grid .calendar-cell {
  height: auto; /* let grid control height instead */
}

.calendar-cell {
  border: 1px solid var(--border-color);
  background-color: var(--bg-card);
  border-radius: 8px;
  height: 65px;
  padding: 6px;
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
  font-size: 0.75em;
  color: var(--text-muted);
}

.pnl-amount {
  text-align: right;
  font-size: 0.9em;
  letter-spacing: -0.01em;
}

/* ==========================================================
   6. Table Styles
========================================================== */
.custom-table {
  color: var(--text-main);
}
.custom-table :deep(th) {
  font-weight: 700;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-color);
  text-transform: uppercase;
  font-size: 11px;
  padding: 8px 16px;
}
.custom-table :deep(td) {
  border-bottom: 1px solid var(--border-color);
  padding: 8px 16px;
}
.custom-table :deep(tbody tr:hover) {
  background-color: var(--table-hover) !important;
}

.custom-chip {
  border-radius: 6px;
  padding: 2px 10px;
}
.chip-buy {
  background-color: var(--bg-icon-positive);
  color: var(--q-positive);
}
.chip-sell {
  background-color: var(--bg-icon-negative);
  color: var(--q-negative);
}

/* ==========================================================
   7. Custom Mobile Responsiveness & Layout
========================================================== */
/* ยอดรวมย้ายไปอยู่ hero แล้ว KPI จึงไม่ต้องตะโกนเท่าเดิม — 34px -> 22px ตามแบบ
   และใช้ตัวเลขความกว้างเท่ากันเพื่อให้คอลัมน์ตัวเลขไม่ขยับเวลาค่าเปลี่ยน */
.stat-val {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 1.4rem;
  line-height: 1.9rem;
}
.stat-label {
  font-size: 12.5px;
  letter-spacing: 0;
  text-transform: none;
}
.stat-sub-label {
  font-size: 11.5px;
  margin-top: 4px;
}
.kpi-top {
  min-height: 32px;
}

@media (max-width: 599px) {
  .stat-val {
    font-size: 1.2rem;
    line-height: 1.5rem;
  }
  .stat-label {
    font-size: 11px;
    letter-spacing: 0;
  }
  .icon-box {
    width: 28px;
    height: 28px;
  }
  .icon-box .q-icon {
    font-size: 14px !important;
  }
  .stat-sub-label {
    font-size: 9px;
  }

  .calendar-cell {
    height: 55px;
    padding: 4px;
  }
  .calendar-fixed-grid {
    height: 360px;
  }
  .pnl-amount {
    font-size: 0.75em;
  }
  .calendar-grid {
    gap: 4px;
  }
}

:global(.body--dark) .chart-container .apexcharts-tooltip {
  background: #1e293b !important;
  border: 1px solid #334155 !important;
  color: #f8fafc;
}
:global(.body--dark) .chart-container .apexcharts-tooltip-title {
  background: #0f172a !important;
  border-bottom: 1px solid #334155 !important;
}
/* ==========================================================
   New Minimal & Modern Classes (Row 3 Additions)
========================================================== */
.inner-card {
  border-radius: 16px;
  border: 1px solid transparent;
}
:global(.body--dark) .inner-card {
  border: 1px solid rgba(255, 255, 255, 0.03);
}

/* จุดสีของ legend โดนัท — สีมาจาก ALLOCATION_COLORS ผูก inline ให้ตรงกับสไลซ์ */
.alloc-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.insight-pill {
  border-radius: 8px;
  padding: 4px 10px; /* ลด Padding ให้บางลง */
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.insight-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.04) !important;
}
:global(.body--dark) .insight-pill {
  background: var(--bg-card) !important;
}

.icon-micro {
  width: 18px; /* เล็กลงกว่าเดิม */
  height: 18px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-box-sm {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shadow-sm {
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.05);
}
:global(.body--dark) .shadow-sm {
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.3);
}

.z-top {
  z-index: 1;
  position: relative;
}
/* ==========================================================
   Goal Card Dark Mode (ม่วงเข้มพรีเมียม)
========================================================== */
.bg-goal-dark {
  /* สีม่วงเข้มๆ อมน้ำเงิน ให้ดูตัดกับความมืดแต่ไม่โดดเกินไป */
  background-color: rgba(49, 46, 129, 0.3) !important;
  border: 1px solid rgba(99, 102, 241, 0.15) !important;
}
/* ==========================================================
   Share Stats Card v3 — Wisenancial theme (teal/sage), mobile-ready
   ปรับจาก v3 เดิม (indigo/amber แบบ parchment) ให้ใช้ token จริงของเว็บ:
   var(--bg-card) / var(--text-primary) / var(--accent-*) / positive
   ("--21ba45") & negative ("#c10015") ตามที่ template ทั้งไฟล์นี้ใช้จริง
   (text-positive/text-negative) เพื่อให้การ์ดแชร์ตรงกับธีมจริง ไม่ใช่เรฟภาพ
   สีนีออนเข้ม โทเคนที่ใช้ล้วนประกาศไว้ที่ :root / .body--dark ใน app.scss
   (ระดับ global) ไม่ใช่ตัวที่ scope เฉพาะ .dashboard-page เพราะ q-dialog
   ถูก teleport ออกไปนอก .dashboard-page ตัวแปรที่ scope แคบกว่านั้นจะไม่
   inherit เข้ามา
========================================================== */

/* Share button in header */
.share-btn-main {
  border-radius: 10px;
  font-size: 13px;
  letter-spacing: 0.01em;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(51, 97, 96, 0.25);
}
.share-btn-main:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(51, 97, 96, 0.35);
}

/* Dialog wrapper — responsive width */
.share-dialog-wrapper {
  width: min(400px, 94vw);
}

/* ── Card shell ── */
.share-card-v3 {
  background: var(--bg-card);
  border-radius: 20px;
  box-shadow:
    0 20px 40px -8px rgba(27, 54, 54, 0.14),
    0 0 0 1px var(--border-color);
  width: 100%;
  position: relative;
}
.body--dark .share-card-v3 {
  box-shadow:
    0 20px 44px -16px rgba(0, 0, 0, 0.55),
    0 0 0 1px var(--border-color);
}

/* Soft teal overlay — texture without a dark/light-specific gradient */
.share-warm-overlay {
  background:
    radial-gradient(ellipse at 10% 0%, rgba(133, 182, 176, 0.12) 0%, transparent 55%),
    radial-gradient(ellipse at 90% 100%, rgba(76, 138, 135, 0.1) 0%, transparent 55%);
  border-radius: 20px;
  pointer-events: none;
  z-index: 0;
}

/* Corner dots */
.share-dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-color);
  z-index: 2;
}
.share-dot-tl {
  top: 16px;
  left: 16px;
}
.share-dot-br {
  bottom: 16px;
  right: 16px;
}

/* Header row */
.share-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 22px 14px;
  position: relative;
  z-index: 1;
}
.share-wm-top {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.share-header-date {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.03em;
}

/* Account chip — same accent-100/800 pill pattern as MarketPulsePage's .pulse-credits */
.share-account-chip-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 22px 14px;
  position: relative;
  z-index: 1;
}
.share-account-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--accent-100);
  border: 1px solid var(--accent-200);
  border-radius: 99px;
  padding: 4px 11px 4px 8px;
}
.share-account-at {
  font-size: 12px;
  font-weight: 800;
  color: var(--accent-800);
}
.share-account-text {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-800);
  letter-spacing: -0.01em;
}
.share-period-pill {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 99px;
  padding: 4px 10px;
  letter-spacing: 0.02em;
}

/* Hero */
.share-hero-section {
  padding: 4px 22px 16px;
  position: relative;
  z-index: 1;
}
.share-hero-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: lowercase;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.share-hero-num {
  font-size: 36px;
  font-weight: 900;
  color: var(--text-primary);
  letter-spacing: -0.04em;
  line-height: 1;
}
.share-growth-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  border-radius: 6px;
  padding: 2px 8px;
  margin-top: 8px;
  letter-spacing: 0.01em;
}
/* เขียว/แดง เดียวกับ text-positive/text-negative ของ Quasar ที่ใช้จริงทั้งไฟล์นี้ */
.tag-up {
  color: #21ba45;
  background: rgba(33, 186, 69, 0.1);
}
.tag-down {
  color: #c10015;
  background: rgba(193, 0, 21, 0.1);
}

/* Thin divider */
.share-thin-line {
  height: 1px;
  margin: 0 22px;
  background: var(--border-color);
  position: relative;
  z-index: 1;
}

/* Big stats row */
.share-big-stats {
  display: flex;
  align-items: center;
  padding: 16px 22px;
  position: relative;
  z-index: 1;
}
.share-big-stat {
  flex: 1;
  text-align: center;
}
.share-big-stat-sep {
  width: 1px;
  height: 36px;
  background: var(--border-color);
  flex-shrink: 0;
}
.share-big-num {
  font-size: 24px;
  font-weight: 900;
  color: var(--text-primary);
  letter-spacing: -0.04em;
  line-height: 1;
}
.share-big-unit {
  font-size: 16px;
  font-weight: 700;
}
.share-big-label {
  font-size: 9.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: lowercase;
  letter-spacing: 0.04em;
  margin-top: 4px;
}
.num-green {
  color: #21ba45;
}
.num-red {
  color: #c10015;
}
/* amber เดียวกับ .badge-behind ของหน้านี้เอง (light #d97706 / dark #fbbf24) */
.num-amber {
  color: #d97706;
}
.body--dark .num-amber {
  color: #fbbf24;
}

/* Chips row */
.share-chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 22px 14px;
  position: relative;
  z-index: 1;
}
.share-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 99px;
  padding: 4px 10px;
}
.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-green {
  background: #21ba45;
}
.dot-red {
  background: #c10015;
}
.dot-blue {
  background: var(--accent-700);
}
.dot-amber {
  background: #d97706;
}
.body--dark .dot-amber {
  background: #fbbf24;
}
.chip-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.01em;
}

/* Goal area (โควตารายเดือน — Trader) และ allocation area (สัดส่วนพอร์ต — Investor) ใช้ผิวเดียวกัน */
.share-goal-area {
  margin: 0 22px 14px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 14px;
  position: relative;
  z-index: 1;
}
.share-goal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.share-goal-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: lowercase;
  color: var(--text-muted);
}
.share-goal-pct-v3 {
  font-size: 13px;
  font-weight: 800;
  color: var(--accent-800);
  letter-spacing: -0.02em;
}
.pct-done {
  color: #21ba45;
}
.share-goal-bar {
  height: 5px;
  background: var(--border-color);
  border-radius: 99px;
  overflow: hidden;
}
.share-goal-bar-fill {
  height: 100%;
  background: var(--accent-700);
  border-radius: 99px;
  transition: width 0.5s ease;
}
.fill-done {
  background: #21ba45;
}
.share-goal-sub {
  margin-top: 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
}
.share-goal-of {
  margin: 0 3px;
  color: var(--text-muted);
  font-weight: 400;
}

/* Allocation bar (Investor share card) — ใช้ palette เดียวกับ Asset Allocation card จริง
   ผ่าน seg.color แบบ inline-style ส่วน legend เลียนแบบ .pulse-legend ของ MarketPulsePage.vue */
.share-alloc-bar {
  display: flex;
  height: 8px;
  border-radius: 99px;
  overflow: hidden;
  background: var(--border-color);
}
.share-alloc-segment {
  height: 100%;
  flex: 0 0 auto;
  transition: width 0.5s ease;
}
.share-alloc-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}
.share-alloc-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
}
.share-alloc-dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  flex-shrink: 0;
}

/* Monthly Momentum (Trader share card) — ใช้ผิวเดียวกับ .share-goal-area
   ส่วนตัวกราฟเป็น ApexCharts ชุดเดียวกับ hero sparkline ของหน้านี้ */
.share-momentum {
  margin: 0 22px 14px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 10px 2px 6px;
  position: relative;
  z-index: 1;
}
.share-momentum-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--accent-700);
  padding-left: 8px;
  margin-bottom: 2px;
}
/* Apex ใส่ margin ของตัวเองมาให้ ทำให้ก้นการ์ดโหว่ — ดันกลับขึ้นไป */
.share-momentum :deep(.apexcharts-canvas) {
  margin-bottom: -6px;
}

/* Footer — "Tracked on wisenancial.app" คู่กับ QR ที่ชี้กลับไปหน้า landing */
.share-footer-v3 {
  padding: 10px 22px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: relative;
  z-index: 1;
}
.share-footer-tracked {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.share-footer-mark {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--accent-700);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -0.02em;
  flex-shrink: 0;
}
.share-footer-copy {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.share-footer-on {
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.share-footer-brand {
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: var(--text-main);
}
.share-footer-qr {
  width: 46px;
  height: 46px;
  border-radius: 6px;
  display: block;
  flex-shrink: 0;
  /* quiet zone ของ QR ต้องขาวจริงถึงจะสแกนติด — ห้ามปล่อยให้ธีมมืดกลืนขอบไป */
  background: #ffffff;
  padding: 3px;
}

/* Action buttons */
.gap-md {
  gap: 12px;
}
.w-full {
  width: 100%;
}

.share-action-close {
  color: var(--text-secondary);
  font-size: 13px;
}
/* gradient เดียวกับ .pulse-generate ของ MarketPulsePage.vue */
.share-action-save {
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
  color: #ffffff;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(27, 54, 54, 0.2);
}
.share-action-save:hover {
  box-shadow: 0 6px 16px rgba(27, 54, 54, 0.3);
}

/* Mobile tweaks */
@media (max-width: 480px) {
  .share-hero-num {
    font-size: 28px;
  }
  .share-big-num {
    font-size: 19px;
  }
  .share-big-unit {
    font-size: 13px;
  }
  .share-header-row,
  .share-account-chip-wrap,
  .share-hero-section,
  .share-chips-row {
    padding-left: 16px;
    padding-right: 16px;
  }
  .share-goal-area {
    margin-left: 16px;
    margin-right: 16px;
  }
  .share-thin-line {
    margin-left: 16px;
    margin-right: 16px;
  }
  .share-big-stats {
    padding: 14px 16px;
  }
  .share-footer-v3 {
    padding-left: 16px;
    padding-right: 16px;
  }
  .share-momentum {
    margin-left: 16px;
    margin-right: 16px;
  }
}

/* ==========================================================
   Tax Certificate Dialog
========================================================== */

/* Dialog card — solid, not transparent */
.tax-cert-card {
  background: #f5f0e8 !important;
  border-radius: 4px !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3) !important;
}
.body--dark .tax-cert-card {
  background: #1a1a1a !important;
}

/* Paper area */
.tax-paper {
  background: #ffffff;
  border: 1px solid #d4c9a8;
  box-shadow: inset 0 0 40px rgba(180, 160, 100, 0.08);
  padding: 28px 28px 20px;
  font-family: 'Arial', sans-serif;
  position: relative;
}
.body--dark .tax-paper {
  background: #1e1e1e;
  border-color: #3a3a3a;
}

/* Subtle watermark lines */
.tax-paper::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 28px,
    rgba(0, 0, 0, 0.025) 28px,
    rgba(0, 0, 0, 0.025) 29px
  );
  pointer-events: none;
}

/* Paper header */
.tp-header {
  border-bottom: 2px solid #1a1a1a;
  padding-bottom: 10px;
  margin-bottom: 16px;
  position: relative;
}
.body--dark .tp-header {
  border-color: #e0e0e0;
}
.tp-title {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #0a0a0a;
  line-height: 1;
  margin-bottom: 3px;
}
.body--dark .tp-title {
  color: #f0f0f0;
}
.tp-sub {
  font-size: 11px;
  color: #555;
  letter-spacing: 0.02em;
}
.body--dark .tp-sub {
  color: #aaa;
}
.tp-year-badge {
  position: absolute;
  top: 0;
  right: 0;
  font-size: 10px;
  font-weight: 700;
  color: #666;
  text-align: right;
  letter-spacing: 0.03em;
}
.body--dark .tp-year-badge {
  color: #aaa;
}

/* Info bar */
.tp-info-bar {
  display: flex;
  justify-content: space-between;
  background: #f9f7f2;
  border: 1px solid #e0d8c0;
  padding: 10px 14px;
  margin-bottom: 18px;
  font-size: 12px;
}
.body--dark .tp-info-bar {
  background: #2a2a2a;
  border-color: #444;
}
.tp-info-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #888;
  text-transform: uppercase;
  margin-bottom: 3px;
}
.tp-info-val {
  font-size: 13px;
  font-weight: 700;
  color: #111;
}
.body--dark .tp-info-val {
  color: #eee;
}

/* Table */
.tp-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 12px;
  position: relative;
}
.tp-table thead tr {
  border-bottom: 2px solid #111;
}
.body--dark .tp-table thead tr {
  border-color: #ddd;
}
.tp-table thead th {
  padding: 6px 8px;
  text-align: left;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #333;
}
.body--dark .tp-table thead th {
  color: #ccc;
}
.tp-table thead th.r {
  text-align: right;
}
.tp-table tbody tr {
  border-bottom: 1px solid #ece8dc;
}
.body--dark .tp-table tbody tr {
  border-color: #333;
}
.tp-table tbody td {
  padding: 7px 8px;
  color: #222;
  font-size: 12px;
}
.body--dark .tp-table tbody td {
  color: #ddd;
}
.tp-table tbody td.r {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.tp-month {
  font-weight: 500;
}
.tp-profit {
  color: #16a34a;
  font-weight: 600;
}
.tp-loss {
  color: #dc2626;
  font-weight: 600;
}
.tp-neutral {
  color: #374151;
}
.body--dark .tp-neutral {
  color: #d1d5db;
}

/* Summary box */
.tp-summary-wrap {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
.tp-summary-box {
  width: 300px;
  border: 1px solid #d4c9a8;
  background: #faf8f3;
  padding: 12px 16px;
  font-size: 12px;
}
.body--dark .tp-summary-box {
  background: #252525;
  border-color: #444;
}
.tp-sum-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  color: #333;
  font-size: 12px;
}
.body--dark .tp-sum-row {
  color: #ccc;
}
.tp-sum-bold {
  font-weight: 700;
  font-size: 13px;
  color: #111;
  padding: 4px 0;
}
.body--dark .tp-sum-bold {
  color: #eee;
}
.tp-sum-sm {
  font-size: 10px;
  color: #777;
}
.tp-sum-divider {
  border-top: 1px solid #d4c9a8;
  margin: 6px 0;
}
.tp-sum-divider--dashed {
  border-style: dashed;
  border-color: #bbb;
  margin: 8px 0;
}
.tp-sum-tax {
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #dc2626;
  padding-top: 4px;
}

/* Footer */
.tp-footer {
  font-size: 9px;
  color: #999;
  text-align: center;
  padding-top: 10px;
  border-top: 1px solid #e8e2d0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.body--dark .tp-footer {
  color: #666;
  border-color: #333;
}

.btn-outline-modern {
  background: var(--bg-card);
  color: var(--text-main);
  border-radius: 10px;
  padding: 0 14px;
  height: 36px;
  font-size: 12px;
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}
.btn-outline-modern:hover {
  border-color: #7c3aed;
  color: #7c3aed;
  box-shadow: 0 3px 10px rgba(124, 58, 237, 0.15) !important;
  transform: translateY(-1px);
}
</style>

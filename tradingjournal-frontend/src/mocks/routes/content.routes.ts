import type { Coach, CoachSession } from 'src/types/coach.types';
import type { Post } from 'src/types/community.types';
import type { UnifiedNewsItem } from 'src/types/news.types';
import type { WatchlistItem } from 'src/types/watchlist.types';
import { asString, defineMockRoutes } from '../mock.types';
import {
  MOCK_USER,
  STOCK_UNIVERSE,
  createRng,
  isoDaysAgo,
  isoDaysAhead,
  round,
  stockPrice,
} from '../data/seed';
import { portfolioTypeOf } from '../data/portfolios.data';

// ============================================================
// News
// ============================================================
const NEWS_SEED = [
  {
    title: 'Fed คงดอกเบี้ยตามคาด ส่งสัญญาณพร้อมลดครั้งแรกปลายปี',
    summary:
      'คณะกรรมการนโยบายการเงินสหรัฐมีมติคงอัตราดอกเบี้ยไว้ที่ระดับเดิม พร้อมระบุว่าเงินเฟ้อเข้าใกล้กรอบเป้าหมายมากขึ้น ตลาดตีความเป็นสัญญาณผ่อนคลาย',
    kind: 'ECONOMIC_EVENT' as const,
    importance: 'CRITICAL' as const,
    sentiment: 'POSITIVE' as const,
    country: 'US',
    symbols: ['US30', 'NAS100', 'XAU/USD'],
    scope: 'TRADER' as const,
  },
  {
    title: 'ทองคำทำจุดสูงสุดใหม่ หลังดอลลาร์อ่อนค่า',
    summary:
      'ราคาทองคำ spot ปรับขึ้นต่อเนื่องเป็นวันที่สาม จากแรงซื้อสินทรัพย์ปลอดภัยและดอลลาร์ที่อ่อนค่าลง',
    kind: 'MARKET_ARTICLE' as const,
    importance: 'HIGH' as const,
    sentiment: 'POSITIVE' as const,
    country: 'US',
    symbols: ['XAU/USD'],
    scope: 'TRADER' as const,
  },
  {
    title: 'NVDA รายงานกำไรเหนือคาด รายได้ศูนย์ข้อมูลโต 112%',
    summary:
      'ผลประกอบการไตรมาสล่าสุดออกมาดีกว่าที่นักวิเคราะห์คาดการณ์ หนุนราคาหุ้นในการซื้อขายนอกเวลาทำการ',
    kind: 'MARKET_ARTICLE' as const,
    importance: 'HIGH' as const,
    sentiment: 'POSITIVE' as const,
    country: 'US',
    symbols: ['NVDA'],
    scope: 'INVESTOR' as const,
  },
  {
    title: 'SET Index ปิดลบ นักลงทุนต่างชาติขายสุทธิต่อเนื่อง',
    summary:
      'ดัชนีหุ้นไทยปิดตลาดในแดนลบ กลุ่มพลังงานและธนาคารถูกขายทำกำไร ขณะที่ต่างชาติขายสุทธิเป็นวันที่ห้าติดต่อกัน',
    kind: 'MARKET_ARTICLE' as const,
    importance: 'MEDIUM' as const,
    sentiment: 'NEGATIVE' as const,
    country: 'TH',
    symbols: ['PTT', 'KBANK', 'SCB'],
    scope: 'INVESTOR' as const,
  },
  {
    title: 'ตัวเลขจ้างงานนอกภาคเกษตรสหรัฐออกมาต่ำกว่าคาด',
    summary: 'Non-Farm Payrolls เพิ่มขึ้นน้อยกว่าที่ตลาดคาด สะท้อนตลาดแรงงานที่เริ่มชะลอตัว',
    kind: 'ECONOMIC_EVENT' as const,
    importance: 'CRITICAL' as const,
    sentiment: 'NEGATIVE' as const,
    country: 'US',
    symbols: ['EUR/USD', 'USD/JPY'],
    scope: 'TRADER' as const,
  },
  {
    title: 'ธปท. คงดอกเบี้ยนโยบาย มองเศรษฐกิจไทยฟื้นตัวช้า',
    summary:
      'คณะกรรมการนโยบายการเงินมีมติคงอัตราดอกเบี้ยนโยบาย พร้อมปรับลดคาดการณ์การเติบโตของเศรษฐกิจไทยปีนี้',
    kind: 'ECONOMIC_EVENT' as const,
    importance: 'HIGH' as const,
    sentiment: 'NEUTRAL' as const,
    country: 'TH',
    symbols: ['ADVANC', 'AOT'],
    scope: 'INVESTOR' as const,
  },
  {
    title: 'บิตคอยน์ย่อตัวจากแนวต้านสำคัญ แรงขายทำกำไรกดดัน',
    summary:
      'ราคาบิตคอยน์ปรับลงหลังไม่สามารถผ่านแนวต้านทางจิตวิทยาได้ นักวิเคราะห์มองเป็นการพักฐานระยะสั้น',
    kind: 'MARKET_ARTICLE' as const,
    importance: 'MEDIUM' as const,
    sentiment: 'NEGATIVE' as const,
    country: 'US',
    symbols: ['BTC/USD'],
    scope: 'TRADER' as const,
  },
  {
    title: 'ราคาน้ำมันดิบพุ่ง หลัง OPEC+ ยืดเวลาลดกำลังการผลิต',
    summary:
      'สัญญาน้ำมันดิบล่วงหน้าปรับขึ้นแรง หลังกลุ่มผู้ผลิตประกาศคงมาตรการลดกำลังการผลิตออกไปอีกหนึ่งไตรมาส',
    kind: 'MARKET_ARTICLE' as const,
    importance: 'HIGH' as const,
    sentiment: 'POSITIVE' as const,
    country: 'US',
    symbols: ['XOM', 'PTT'],
    scope: 'INVESTOR' as const,
  },
];

const NEWS_ITEMS: UnifiedNewsItem[] = NEWS_SEED.map((item, index) => ({
  id: `mock-news-${index + 1}`,
  sourceId: index + 1,
  scope: item.scope,
  kind: item.kind,
  title: item.title,
  summary: item.summary,
  source: item.country === 'TH' ? 'Bangkok Post' : 'Reuters',
  url: 'https://example.com/news',
  importance: item.importance,
  sentiment: item.sentiment,
  aiSummary:
    'สรุปโดย AI: ข่าวนี้มีผลต่อทิศทางค่าเงินและสินทรัพย์เสี่ยงในระยะสั้น ควรติดตามปฏิกิริยาของตลาดในช่วงเปิดทำการถัดไป',
  impactAnalysis:
    'ผลกระทบระดับปานกลางถึงสูงต่อสินทรัพย์ที่เกี่ยวข้อง โดยเฉพาะในกรอบเวลา 1-3 วันทำการ',
  aiTrend:
    item.sentiment === 'POSITIVE'
      ? 'BULLISH'
      : item.sentiment === 'NEGATIVE'
        ? 'BEARISH'
        : 'NEUTRAL',
  aiImpactProbability: 0.55 + (index % 4) * 0.1,
  translatedSummary: item.summary,
  relatedSymbols: item.symbols,
  country: item.country,
  impact: item.importance === 'CRITICAL' ? 'High' : item.importance === 'HIGH' ? 'High' : 'Medium',
  forecast: item.kind === 'ECONOMIC_EVENT' ? '2.4%' : null,
  previous: item.kind === 'ECONOMIC_EVENT' ? '2.6%' : null,
  actual: item.kind === 'ECONOMIC_EVENT' ? '2.3%' : null,
  sector: null,
  publishedAt: isoDaysAgo(index === 0 ? 0 : index, 8 + index),
  isPinned: index === 0,
}));

// ============================================================
// Community
// ============================================================
const POST_AUTHORS = [
  { id: 2, username: 'GoldScalper', full_name: 'ต้น สายทอง' },
  { id: 3, username: 'SlowAndSteady', full_name: 'พี่หมี ลงทุนยาว' },
  { id: 4, username: 'ChartWizard', full_name: 'Wit T.' },
  { id: MOCK_USER.id, username: MOCK_USER.username, full_name: MOCK_USER.full_name },
];

const POST_SEED = [
  {
    content:
      'ปิดออเดอร์ XAU/USD ไม้นี้ตามแผนเป๊ะ เข้าที่แนวรับ H4 แล้วรอ confirm แท่งปิด ได้ไป 1.8R 🎯',
    symbol: 'XAU/USD',
    sentiment: 'BULLISH' as const,
    type: 'TRADER' as const,
    likes: 42,
    comments: 8,
  },
  {
    content: 'เดือนนี้ DCA เข้า PTT เพิ่มอีก 1,000 หุ้น ปันผลรอบล่าสุดเข้าบัญชีแล้ว ถือยาวไม่ขาย',
    symbol: 'PTT',
    sentiment: 'BULLISH' as const,
    type: 'INVESTOR' as const,
    likes: 67,
    comments: 15,
  },
  {
    content:
      'เตือนตัวเองอีกรอบ: อย่าเทรดแก้แค้น เมื่อวานเสีย 3 ไม้ติดแล้วเข้าเพิ่มโดยไม่มีแผน สุดท้ายเสียหนักกว่าเดิม',
    symbol: null,
    sentiment: 'NEUTRAL' as const,
    type: 'TRADER' as const,
    likes: 128,
    comments: 34,
  },
  {
    content:
      'NVDA งบออกมาดีมาก แต่ราคาขึ้นมาเยอะแล้ว ใครถืออยู่คิดยังไงกันบ้าง จะ let profit run หรือ take partial?',
    symbol: 'NVDA',
    sentiment: 'BULLISH' as const,
    type: 'INVESTOR' as const,
    likes: 89,
    comments: 27,
  },
  {
    content:
      'สรุปผลเดือนนี้: 24 ไม้ ชนะ 14 แพ้ 10 win rate 58% กำไรรวม +$1,240 เป้าเดือนหน้าคือลด overtrade',
    symbol: null,
    sentiment: 'NEUTRAL' as const,
    type: 'TRADER' as const,
    likes: 55,
    comments: 11,
  },
  {
    content: 'KBANK ปันผล 6.5 บาท/หุ้น yield กว่า 5% ที่ราคาต้นทุนผม ถือมา 2 ปีคุ้มมาก',
    symbol: 'KBANK',
    sentiment: 'BULLISH' as const,
    type: 'INVESTOR' as const,
    likes: 73,
    comments: 19,
  },
];

const POSTS: Post[] = POST_SEED.map((seed, index) => {
  const author = POST_AUTHORS[index % POST_AUTHORS.length] ?? POST_AUTHORS[0]!;

  return {
    id: index + 1,
    user_id: author.id,
    portfolio_id: seed.type === 'INVESTOR' ? 2 : 1,
    portfolio_type: seed.type,
    asset_symbol: seed.symbol,
    content: seed.content,
    sentiment: seed.sentiment,
    post_type: 'GENERAL',
    visibility: 'PUBLIC',
    reference_type: 'NONE',
    reference_id: null,
    reference: null,
    likes_count: seed.likes,
    comments_count: seed.comments,
    isLiked: index % 3 === 0,
    created_at: isoDaysAgo(index, 12 - index),
    updated_at: isoDaysAgo(index, 12 - index),
    users: { ...author, avatar_url: null },
    portfolios: {
      id: seed.type === 'INVESTOR' ? 2 : 1,
      name: seed.type === 'INVESTOR' ? 'Long-Term Stock' : 'Forex Main',
      portfolio_type: seed.type,
    },
    post_images: [],
    comments: Array.from({ length: Math.min(seed.comments, 2) }, (_, ci) => {
      const commenter = POST_AUTHORS[(index + ci + 1) % POST_AUTHORS.length] ?? POST_AUTHORS[0]!;

      return {
        id: index * 10 + ci + 1,
        post_id: index + 1,
        user_id: commenter.id,
        content:
          ci === 0 ? 'ขอบคุณที่แชร์ครับ ได้ไอเดียเลย 🙏' : 'เห็นด้วยครับ วินัยสำคัญกว่าระบบอีก',
        created_at: isoDaysAgo(index, 14 - ci),
        users: { ...commenter, avatar_url: null },
      };
    }),
  };
});

// ============================================================
// Coach Room
// ============================================================
const COACHES: Coach[] = [
  {
    id: 'coach-01',
    name: 'ครูหนึ่ง · Somchai P.',
    avatarUrl: null,
    headline: {
      en: 'Price action & risk-first trading',
      th: 'สอน price action เน้นบริหารความเสี่ยงก่อนกำไร',
    },
    bio: {
      en: 'Full-time FX trader for 11 years. Focuses on building a repeatable process rather than chasing signals.',
      th: 'เทรด FX เต็มเวลามา 11 ปี เน้นสร้างกระบวนการที่ทำซ้ำได้ มากกว่าการไล่ตามสัญญาณ',
    },
    specialties: ['DAY_TRADING', 'RISK_MANAGEMENT', 'PSYCHOLOGY'],
    rating: 4.9,
    reviewCount: 214,
    yearsExperience: 11,
    hourlyRateThb: 2500,
    languages: ['th', 'en'],
    availableSlots: [isoDaysAhead(1, 10), isoDaysAhead(2, 14), isoDaysAhead(4, 19)],
  },
  {
    id: 'coach-02',
    name: 'Anna Wu, CFA',
    avatarUrl: null,
    headline: { en: 'Long-term value investing', th: 'ลงทุนแบบเน้นคุณค่าระยะยาว' },
    bio: {
      en: 'Former equity research analyst. Helps investors build a dividend-focused portfolio they can hold for decades.',
      th: 'อดีตนักวิเคราะห์หลักทรัพย์ ช่วยนักลงทุนสร้างพอร์ตเน้นปันผลที่ถือได้ยาวหลายสิบปี',
    },
    specialties: ['VALUE_INVESTING', 'RISK_MANAGEMENT'],
    rating: 4.8,
    reviewCount: 156,
    yearsExperience: 9,
    hourlyRateThb: 3200,
    languages: ['en'],
    availableSlots: [isoDaysAhead(2, 9), isoDaysAhead(3, 16), isoDaysAhead(6, 11)],
  },
  {
    id: 'coach-03',
    name: 'พี่เบียร์ · Swing Master',
    avatarUrl: null,
    headline: { en: 'Swing trading for office workers', th: 'สวิงเทรดสำหรับมนุษย์เงินเดือน' },
    bio: {
      en: 'Teaches a low-screen-time swing system designed around a 9-to-5 schedule.',
      th: 'สอนระบบสวิงเทรดที่ไม่ต้องเฝ้าจอ ออกแบบมาสำหรับคนทำงานประจำ',
    },
    specialties: ['SWING_TRADING', 'PSYCHOLOGY'],
    rating: 4.7,
    reviewCount: 98,
    yearsExperience: 7,
    hourlyRateThb: 1800,
    languages: ['th'],
    availableSlots: [isoDaysAhead(1, 20), isoDaysAhead(5, 20)],
  },
  {
    id: 'coach-04',
    name: 'Marcus Lee',
    avatarUrl: null,
    headline: { en: 'Options income strategies', th: 'กลยุทธ์สร้างกระแสเงินสดด้วยออปชัน' },
    bio: {
      en: 'Runs a covered-call and cash-secured-put program. Strong emphasis on position sizing.',
      th: 'ใช้กลยุทธ์ covered call และ cash-secured put เน้นการกำหนดขนาดสถานะเป็นหลัก',
    },
    specialties: ['OPTIONS', 'RISK_MANAGEMENT'],
    rating: 4.6,
    reviewCount: 71,
    yearsExperience: 13,
    hourlyRateThb: 3800,
    languages: ['en'],
    availableSlots: [isoDaysAhead(3, 21), isoDaysAhead(7, 21)],
  },
];

const SESSIONS: CoachSession[] = [
  {
    id: 'session-01',
    coachId: 'coach-01',
    coachName: 'ครูหนึ่ง · Somchai P.',
    scheduledAt: isoDaysAhead(2, 14),
    durationMinutes: 60,
    status: 'UPCOMING',
    topic: 'รีวิว journal เดือนนี้ และแก้ปัญหา overtrade',
    meetingUrl: 'https://meet.example.com/wisenancial-mock',
  },
  {
    id: 'session-02',
    coachId: 'coach-03',
    coachName: 'พี่เบียร์ · Swing Master',
    scheduledAt: isoDaysAgo(9, 20),
    durationMinutes: 60,
    status: 'COMPLETED',
    topic: 'วางระบบสวิงเทรดให้เข้ากับตารางงานประจำ',
    meetingUrl: null,
  },
  {
    id: 'session-03',
    coachId: 'coach-02',
    coachName: 'Anna Wu, CFA',
    scheduledAt: isoDaysAgo(28, 10),
    durationMinutes: 90,
    status: 'COMPLETED',
    topic: 'Portfolio review — dividend allocation',
    meetingUrl: null,
  },
];

// ============================================================
// Watchlist
// ============================================================
const WATCHLIST: WatchlistItem[] = ['NVDA', 'AAPL', 'PTT', 'KBANK', 'XAU/USD', 'BTC/USD'].map(
  (symbol, index) => {
    const stock = STOCK_UNIVERSE.find((s) => s.symbol === symbol);

    return {
      id: index + 1,
      user_id: MOCK_USER.id,
      symbol,
      name: stock?.name ?? symbol,
      asset_type: symbol.includes('/') ? 'FOREX' : 'STOCK',
      market_region: stock?.exchange === 'SET' ? 'TH' : 'GLOBAL',
      portfolio_type: symbol.includes('/') ? ('TRADER' as const) : ('INVESTOR' as const),
      current_price: stock?.price ?? stockPrice(symbol),
      created_at: isoDaysAgo(30 - index * 4),
      updated_at: isoDaysAgo(1),
    };
  },
);

// ============================================================
// Monthly movers (Watchlist + MonthlyMovers pages)
// ============================================================
function buildMovers(market: 'TH' | 'GLOBAL', limit: number) {
  const pool = STOCK_UNIVERSE.filter((s) =>
    market === 'TH' ? s.exchange === 'SET' : s.exchange !== 'SET',
  );
  const rng = createRng(market === 'TH' ? 5150 : 9090);

  const rows = pool.map((stock) => {
    const changePercent = round((rng() - 0.45) * 46, 2);
    const startPrice = round(stock.price / (1 + changePercent / 100), 2);

    return {
      symbol: stock.symbol,
      name: stock.name,
      market,
      monthChangePercent: changePercent,
      startPrice,
      endPrice: stock.price,
      volatility: round(12 + rng() * 48, 2),
      avgDailyValue: round(stock.volume * stock.price),
      direction: changePercent >= 0 ? ('UP' as const) : ('DOWN' as const),
    };
  });

  const gainers = [...rows]
    .filter((r) => r.monthChangePercent > 0)
    .sort((a, b) => b.monthChangePercent - a.monthChangePercent)
    .slice(0, limit);

  const losers = [...rows]
    .filter((r) => r.monthChangePercent < 0)
    .sort((a, b) => a.monthChangePercent - b.monthChangePercent)
    .slice(0, limit);

  const mostVolatile = [...rows].sort((a, b) => b.volatility - a.volatility).slice(0, limit);

  return {
    period: new Date().toISOString().slice(0, 7),
    gainers,
    losers,
    mostVolatile,
  };
}

export const contentRoutes = defineMockRoutes([
  // ---------- News ----------
  {
    method: 'GET',
    path: '/news',
    handler: (ctx) => {
      const scope = ctx.query.scope ?? 'ALL';
      const country = ctx.query.country;
      const impact = ctx.query.impact;
      const page = Number(ctx.query.page ?? 1);
      const limit = Number(ctx.query.limit ?? 20);

      let data = NEWS_ITEMS.filter((item) => {
        if (scope !== 'ALL' && item.scope !== scope) return false;
        if (country && country !== 'ALL' && item.country !== country) return false;
        if (impact && impact !== 'ALL' && item.impact !== impact) return false;
        return true;
      });

      const total = data.length;
      data = data.slice((page - 1) * limit, page * limit);

      return {
        success: true,
        scope,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    },
  },
  {
    method: 'POST',
    path: '/news/:scope/:sourceId/toggle-pin',
    handler: () => ({ pinned: true }),
  },

  // ---------- Community ----------
  {
    method: 'GET',
    path: '/posts',
    handler: (ctx) => {
      const page = Number(ctx.query.page ?? 1);
      const limit = Number(ctx.query.limit ?? 20);
      const type = ctx.query.portfolio_type;

      const filtered = type ? POSTS.filter((p) => p.portfolio_type === type) : POSTS;

      return {
        data: filtered.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
          hasNext: page * limit < filtered.length,
          hasPrev: page > 1,
        },
      };
    },
  },
  {
    method: 'GET',
    path: '/posts/:postId',
    handler: (ctx) => POSTS.find((p) => p.id === Number(ctx.params.postId)) ?? POSTS[0],
  },
  {
    method: 'POST',
    path: '/posts',
    // backend อ่าน portfolio_type จากพอร์ตที่อ้างถึง ไม่ใช่จาก body
    handler: (ctx) => ({
      ...POSTS[0],
      id: Date.now() % 100000,
      ...ctx.body,
      portfolio_type: portfolioTypeOf(ctx.body.portfolio_id as number | undefined),
      created_at: isoDaysAgo(0),
    }),
  },
  {
    method: 'PATCH',
    path: '/posts/:postId',
    handler: (ctx) => ({ ...POSTS[0], id: Number(ctx.params.postId), ...ctx.body }),
  },
  {
    method: 'DELETE',
    path: '/posts/:postId',
    handler: (ctx) => ({ success: true, deleted_id: Number(ctx.params.postId) }),
  },
  {
    method: 'POST',
    path: '/posts/:postId/like',
    handler: (ctx) => {
      const post = POSTS.find((p) => p.id === Number(ctx.params.postId));
      return { liked: true, likes_count: (post?.likes_count ?? 0) + 1 };
    },
  },
  {
    method: 'POST',
    path: '/posts/:postId/comments',
    handler: (ctx) => ({
      id: Date.now() % 100000,
      post_id: Number(ctx.params.postId),
      user_id: MOCK_USER.id,
      content: asString(ctx.body.content),
      created_at: isoDaysAgo(0),
      users: {
        id: MOCK_USER.id,
        username: MOCK_USER.username,
        full_name: MOCK_USER.full_name,
        avatar_url: null,
      },
    }),
  },

  // ---------- Chat ----------
  {
    method: 'GET',
    path: '/chat/history/:roomName',
    handler: (ctx) => {
      const room = decodeURIComponent(ctx.params.roomName ?? 'general');

      const lines = [
        { user: POST_AUTHORS[0]!, text: 'เช้านี้ทองวิ่งแรงมาก ใครได้ไม้บ้าง' },
        {
          user: POST_AUTHORS[2]!,
          text: 'ผมเข้าตั้งแต่แนวรับเมื่อวาน ตอนนี้ลากหยุดขาดทุนขึ้นมาที่จุดเข้าแล้ว',
        },
        { user: POST_AUTHORS[1]!, text: 'ฝั่งหุ้นเงียบ ๆ ครับ รอปันผลรอบหน้า' },
        { user: POST_AUTHORS[3]!, text: 'เพิ่งปิดไม้ EUR/USD ได้ 1.2R พอดีเป้าวันนี้ครบแล้ว' },
        { user: POST_AUTHORS[0]!, text: 'วันนี้มี NFP ตอนสองทุ่มครึ่ง ระวังกันด้วยนะ' },
        { user: POST_AUTHORS[2]!, text: 'ขอบคุณครับ เดี๋ยวลดไซซ์ลงครึ่งนึงก่อน' },
      ];

      return lines.map((line, index) => ({
        id: index + 1,
        room_name: room,
        user_id: line.user.id,
        message: line.text,
        created_at: isoDaysAgo(0, 9 + index),
        users: { id: line.user.id, username: line.user.username, full_name: line.user.full_name },
      }));
    },
  },

  // ---------- Coach Room ----------
  { method: 'GET', path: '/coaches', handler: () => COACHES },
  {
    method: 'GET',
    path: '/coaches/sessions/mine',
    handler: () => SESSIONS,
  },
  {
    method: 'GET',
    path: '/coaches/:id',
    handler: (ctx) => COACHES.find((c) => c.id === ctx.params.id) ?? COACHES[0],
  },
  {
    method: 'POST',
    path: '/coaches/sessions',
    handler: (ctx) => {
      const coach = COACHES.find((c) => c.id === ctx.body.coachId) ?? COACHES[0]!;

      return {
        id: `session-${Date.now() % 100000}`,
        coachId: coach.id,
        coachName: coach.name,
        scheduledAt: asString(ctx.body.slot, isoDaysAhead(3)),
        durationMinutes: 60,
        status: 'UPCOMING',
        topic: asString(ctx.body.topic, 'เซสชันใหม่'),
        meetingUrl: 'https://meet.example.com/wisenancial-mock',
      };
    },
  },

  // ---------- Watchlist ----------
  {
    method: 'GET',
    path: '/watchlist',
    handler: (ctx) => {
      const scope = ctx.query.scope;
      return scope === 'TRADER' || scope === 'INVESTOR'
        ? WATCHLIST.filter((item) => item.portfolio_type === scope)
        : WATCHLIST;
    },
  },
  {
    method: 'GET',
    path: '/watchlist/portfolio/:portfolioId',
    // backend คืนเฉพาะรายการที่ตรงกับ portfolio_type ของพอร์ตนั้น (watchlist.service.ts)
    handler: (ctx) => {
      const type = portfolioTypeOf(ctx.params.portfolioId);
      return WATCHLIST.filter((item) => item.portfolio_type === type);
    },
  },
  {
    method: 'GET',
    path: '/watchlist/portfolio/:portfolioId/check',
    handler: (ctx) => WATCHLIST.some((item) => item.symbol === ctx.query.symbol),
  },
  {
    method: 'POST',
    path: '/watchlist/portfolio/:portfolioId',
    handler: (ctx) => {
      const type = portfolioTypeOf(ctx.params.portfolioId);
      const symbol = asString(ctx.body.symbol, 'AAPL').toUpperCase();

      return {
        ...WATCHLIST[0],
        id: Date.now() % 100000,
        symbol,
        name: symbol,
        asset_type: type === 'TRADER' ? 'FOREX' : 'STOCK',
        market_region: symbol.endsWith('.BK') ? 'TH' : 'GLOBAL',
        portfolio_type: type,
        created_at: isoDaysAgo(0),
        updated_at: isoDaysAgo(0),
      };
    },
  },
  {
    method: 'DELETE',
    path: '/watchlist/portfolio/:portfolioId',
    handler: (ctx) => WATCHLIST.find((item) => item.symbol === ctx.query.symbol) ?? WATCHLIST[0],
  },

  // ---------- Market insights ----------
  {
    method: 'GET',
    path: '/market-insights/movers',
    handler: (ctx) =>
      buildMovers((ctx.query.market as 'TH' | 'GLOBAL') ?? 'GLOBAL', Number(ctx.query.limit ?? 8)),
  },
  // ทั้งสองอันนี้ต้องคงรูปร่างให้ตรงกับ MarketInsightsService ของหลังบ้านจริง
  // (HeatmapResponse / SentimentResponse) ไม่ใช่รูปร่างที่เดาเอาเอง — MarketPulsePage
  // อ่านตรงจาก field พวกนี้ ถ้าเพี้ยนหน้าจะว่างเฉพาะตอนเปิด mock mode
  {
    method: 'GET',
    path: '/market-insights/heatmap',
    handler: (ctx) => {
      const market = ctx.query.market === 'TH' ? 'TH' : 'GLOBAL';
      const universe = STOCK_UNIVERSE.filter((stock) =>
        market === 'TH' ? stock.exchange === 'SET' : stock.exchange !== 'SET',
      );
      const bySector = new Map<string, typeof universe>();

      for (const stock of universe) {
        bySector.set(stock.sector, [...(bySector.get(stock.sector) ?? []), stock]);
      }

      const totalCap = universe.reduce((sum, stock) => sum + stock.marketCap, 0) || 1;

      return {
        market,
        asOf: isoDaysAgo(0),
        sectors: [...bySector.entries()].map(([sector, stocks]) => {
          const tiles = stocks.map((stock) => ({
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector,
            changePercent: stock.changePercent,
            weight: Number(((stock.marketCap / totalCap) * 100).toFixed(2)),
            tradedValue: stock.volume * stock.price,
          }));
          const totalWeight = tiles.reduce((sum, tile) => sum + tile.weight, 0);

          return {
            sector,
            // ถ่วงน้ำหนักด้วย weight เหมือนที่หลังบ้านทำ ไม่ใช่เฉลี่ยแบบง่าย
            avgChangePercent: Number(
              (
                tiles.reduce((sum, tile) => sum + tile.changePercent * tile.weight, 0) /
                (totalWeight || 1)
              ).toFixed(2),
            ),
            totalWeight: Number(totalWeight.toFixed(2)),
            tiles,
          };
        }),
      };
    },
  },
  {
    method: 'GET',
    path: '/market-insights/sentiment',
    handler: (ctx) => {
      const market = ctx.query.market === 'TH' ? 'TH' : 'GLOBAL';
      const universe = STOCK_UNIVERSE.filter((stock) =>
        market === 'TH' ? stock.exchange === 'SET' : stock.exchange !== 'SET',
      ).slice(0, 6);

      // ยึด long% กับ changePercent ของหุ้นแต่ละตัวไว้ด้วยกัน ให้ข้อมูล mock อ่านแล้ว
      // สมเหตุสมผล (ตัวที่บวกแรงคนถือฝั่งซื้อเยอะ) และคงที่ทุกครั้งที่เรียก
      const longOf = (changePercent: number) =>
        Math.min(88, Math.max(12, Math.round(50 + changePercent * 6)));

      const ratios = universe.map((stock) => ({
        symbol: stock.symbol,
        name: stock.name,
        longPercent: longOf(stock.changePercent),
        shortPercent: 100 - longOf(stock.changePercent),
      }));

      const overallLong = ratios.length
        ? Math.round(ratios.reduce((sum, r) => sum + r.longPercent, 0) / ratios.length)
        : 50;

      return {
        market,
        asOf: isoDaysAgo(0),
        overall: { longPercent: overallLong, shortPercent: 100 - overallLong },
        longShortRatios: ratios,
        mostBought: universe
          .filter((stock) => stock.changePercent >= 0)
          .map((stock) => ({
            symbol: stock.symbol,
            name: stock.name,
            netTraders: Math.round(stock.volume / 1000),
            changePercent: stock.changePercent,
          })),
        mostSold: universe
          .filter((stock) => stock.changePercent < 0)
          .map((stock) => ({
            symbol: stock.symbol,
            name: stock.name,
            netTraders: -Math.round(stock.volume / 1000),
            changePercent: stock.changePercent,
          })),
        frequentSetups: [
          { name: 'Breakout retest', occurrences: 42, winRate: 61 },
          { name: 'Pullback to EMA20', occurrences: 35, winRate: 57 },
          { name: 'Range reversal', occurrences: 21, winRate: 48 },
        ],
        regions: [
          { region: 'US', bullishPercent: 63, changePercent: 1.2 },
          { region: 'Asia', bullishPercent: 54, changePercent: -0.4 },
          { region: 'Europe', bullishPercent: 49, changePercent: 0.3 },
        ],
      };
    },
  },

  // ---------- AI ----------
  {
    method: 'GET',
    path: '/ai/models',
    handler: () => ({
      models: [
        { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai', costPerCall: 1 },
        { id: 'claude-haiku', name: 'Claude Haiku', provider: 'anthropic', costPerCall: 1 },
        { id: 'gemini-flash', name: 'Gemini Flash', provider: 'google', costPerCall: 1 },
      ],
      defaultModelId: 'gpt-4o-mini',
    }),
  },
  {
    method: 'GET',
    path: '/ai/credits',
    handler: () => ({ balance: MOCK_USER.ai_token_balance, used_today: 6, daily_limit: 50 }),
  },
  {
    method: 'POST',
    path: '/ai/analyze',
    handler: (ctx) => ({
      key: asString(ctx.body.key, 'chart'),
      insight:
        'จากข้อมูลที่ให้มา จุดแข็งคือวินัยในการตัดขาดทุน (ขาดทุนเฉลี่ยต่อไม้ต่ำกว่ากำไรเฉลี่ยชัดเจน) จุดที่ควรปรับคือความถี่ในการเทรดช่วงตลาดนิวยอร์ก ซึ่งมีอัตราชนะต่ำกว่าค่าเฉลี่ยราว 9%',
      lines: [
        'อัตราชนะรวมอยู่ที่ราว 58% ถือว่าอยู่ในเกณฑ์ดีสำหรับระบบ swing',
        'กลยุทธ์ breakout ทำกำไรรวมสูงสุด แต่ pullback ให้ค่าคาดหวังต่อไม้ดีกว่า',
        'อารมณ์ revenge สัมพันธ์กับผลขาดทุนมากที่สุด ควรตั้งกฎหยุดเทรดหลังแพ้ติดกัน 2 ไม้',
        'ช่วงเวลาลอนดอนให้ผลตอบแทนต่อไม้ดีที่สุด ควรเน้นเทรดในกรอบนี้',
      ],
      credits_remaining: MOCK_USER.ai_token_balance - 1,
    }),
  },
  {
    method: 'POST',
    path: '/ai/portfolio/:portfolioId/review',
    handler: () => ({
      summary:
        'พอร์ตโดยรวมมีการกระจายความเสี่ยงที่เหมาะสม แต่มีการกระจุกตัวในกลุ่มเทคโนโลยีค่อนข้างสูง',
      strengths: ['วินัยการตัดขาดทุนดี', 'ต้นทุนเฉลี่ยต่ำกว่าราคาตลาดในหุ้นหลัก 4 จาก 5 ตัว'],
      weaknesses: ['น้ำหนักกลุ่มเทคโนโลยีเกิน 45% ของพอร์ต', 'สัดส่วนเงินสดค่อนข้างต่ำ'],
      recommendations: [
        'ลดน้ำหนักกลุ่มเทคโนโลยีลงเหลือไม่เกิน 35%',
        'เพิ่มสัดส่วนเงินสดสำรองเป็น 15% เพื่อรองรับจังหวะย่อ',
      ],
      credits_remaining: MOCK_USER.ai_token_balance - 2,
    }),
  },
  {
    method: 'POST',
    path: '/ai/portfolio/risk-analysis',
    handler: () => ({
      riskScore: 62,
      riskLevel: 'MEDIUM',
      concentrationRisk: 'กระจุกตัวในกลุ่มเทคโนโลยี 45% ของมูลค่าพอร์ต',
      volatilityNote: 'ความผันผวนของพอร์ตสูงกว่าดัชนีอ้างอิงราว 1.3 เท่า',
      suggestions: [
        'กระจายเข้ากลุ่ม defensive เช่น สาธารณูปโภคหรือ healthcare',
        'ตั้งเพดานน้ำหนักรายตัวไม่เกิน 20%',
      ],
      credits_remaining: MOCK_USER.ai_token_balance - 2,
    }),
  },
  {
    method: 'POST',
    path: '/ai/education/quiz',
    handler: () => ({
      data: {
        questions: [
          {
            question: 'Risk-to-Reward ratio 1:2 หมายความว่าอย่างไร',
            choices: [
              'เสี่ยง 1 ส่วน เพื่อกำไร 2 ส่วน',
              'เสี่ยง 2 ส่วน เพื่อกำไร 1 ส่วน',
              'ต้องชนะ 2 ไม้ต่อ 1 ไม้ที่แพ้',
              'ใช้ leverage 2 เท่า',
            ],
            answerIndex: 0,
            explanation: 'RR 1:2 คือยอมเสี่ยงขาดทุน 1 หน่วย เพื่อโอกาสทำกำไร 2 หน่วย',
          },
          {
            question: 'ข้อใดคือประโยชน์หลักของการทำ Trading Journal',
            choices: [
              'ทำให้ชนะทุกไม้',
              'ช่วยหาแพตเทิร์นความผิดพลาดที่เกิดซ้ำ',
              'ลดค่าคอมมิชชัน',
              'เพิ่ม leverage ที่โบรกให้',
            ],
            answerIndex: 1,
            explanation: 'Journal ช่วยให้เห็นข้อผิดพลาดซ้ำ ๆ เพื่อนำไปแก้ไขอย่างเป็นระบบ',
          },
        ],
      },
      credits_remaining: MOCK_USER.ai_token_balance - 1,
    }),
  },

  // ---------- Billing ----------
  {
    // ต้องตรงกับ CREDIT_PACKAGES ฝั่ง backend (billing/credit-packages.ts)
    // ของเดิม mock คืน tier แบบ PACK_* พร้อม price/credits ซึ่งไม่ใช่ shape ของ CreditPackage
    method: 'GET',
    path: '/billing/packages',
    handler: () => [
      { id: 'STARTER', name: 'Starter', priceThb: 99, tokens: 500 },
      { id: 'PRO', name: 'Pro', priceThb: 249, tokens: 1500, popular: true },
      { id: 'MAX', name: 'Max', priceThb: 499, tokens: 3500 },
    ],
  },
  {
    method: 'POST',
    path: '/billing/checkout',
    handler: () => ({ url: 'https://checkout.example.com/mock-session', sessionId: 'cs_mock_123' }),
  },
  {
    // path จริงคือ /payments/create-checkout-session (ดู payments.service.ts ฝั่ง frontend)
    method: 'POST',
    path: '/payments/create-checkout-session',
    handler: (ctx) => ({
      url: `https://checkout.example.com/mock-subscription?plan=${asString(ctx.body.planId, 'PACK_279')}`,
      sessionId: 'cs_mock_sub_123',
    }),
  },
]);

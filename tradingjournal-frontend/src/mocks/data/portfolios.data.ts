/**
 * ทะเบียนพอร์ตกลางของ mock
 *
 * ก่อนหน้านี้ทุก route แยกโหมดด้วย `Number(id) === INVESTOR_PORTFOLIO_ID` (ฮาร์ดโค้ด = 2)
 * พอสร้างพอร์ตใหม่ในโหมด mock (POST คืน id สุ่ม) ทุก route จะตกไปสาขา TRADER หมด
 * ทำให้พอร์ต stock ที่เพิ่งสร้างแสดงข้อมูล forex — ไม่ตรงกับ backend จริงที่อ่าน
 * portfolio_type จาก DB เสมอ
 *
 * ที่นี่จึงเก็บพอร์ตไว้เป็น state เดียว (mutable) ให้ทุก route ถามประเภทได้จากที่เดียวกัน
 * และให้ POST/PATCH/DELETE เขียนกลับเข้ามาได้จริง
 */
import type { Portfolio, PortfolioType } from 'src/types/portfolio.types';
import { asString } from '../mock.types';
import { INVESTOR_PORTFOLIO_ID, MOCK_USER, TRADER_PORTFOLIO_ID, isoDaysAgo } from './seed';
import { TRADER_CURRENT_BALANCE, TRADER_INITIAL_BALANCE } from './trader.data';
import { INVESTOR_INITIAL_BALANCE, PORTFOLIO_VALUE } from './investor.data';

export const MOCK_PORTFOLIOS: Portfolio[] = [
  {
    id: TRADER_PORTFOLIO_ID,
    user_id: MOCK_USER.id,
    name: 'Forex Main',
    initial_balance: TRADER_INITIAL_BALANCE,
    current_balance: TRADER_CURRENT_BALANCE,
    portfolio_type: 'TRADER',
    investor_cost_method: 'FIFO',
    currency: 'USD',
    icon: 'candlestick_chart',
    color: '#B864FF',
    is_default: true,
    created_at: isoDaysAgo(130),
    updated_at: isoDaysAgo(1),
  },
  {
    id: INVESTOR_PORTFOLIO_ID,
    user_id: MOCK_USER.id,
    name: 'Long-Term Stock',
    initial_balance: INVESTOR_INITIAL_BALANCE,
    current_balance: PORTFOLIO_VALUE,
    portfolio_type: 'INVESTOR',
    investor_cost_method: 'FIFO',
    currency: 'THB',
    icon: 'trending_up',
    color: '#2DD4BF',
    is_default: true,
    created_at: isoDaysAgo(200),
    updated_at: isoDaysAgo(1),
  },
  {
    id: 3,
    user_id: MOCK_USER.id,
    name: 'Prop Firm Challenge',
    initial_balance: 25_000,
    current_balance: 27_412.5,
    portfolio_type: 'TRADER',
    investor_cost_method: 'FIFO',
    currency: 'USD',
    icon: 'emoji_events',
    color: '#FFB169',
    is_default: false,
    created_at: isoDaysAgo(60),
    updated_at: isoDaysAgo(2),
  },
];

export function findMockPortfolio(id: number): Portfolio | undefined {
  return MOCK_PORTFOLIOS.find((portfolio) => portfolio.id === id);
}

/** ประเภทของพอร์ตนี้ — id ที่ไม่รู้จักถือเป็น TRADER ตาม default ของ schema */
export function portfolioTypeOf(id: number | string | undefined): PortfolioType {
  return findMockPortfolio(Number(id))?.portfolio_type ?? 'TRADER';
}

export function isInvestorPortfolio(id: number | string | undefined): boolean {
  return portfolioTypeOf(id) === 'INVESTOR';
}

const DEFAULTS_BY_TYPE: Record<PortfolioType, Pick<Portfolio, 'currency' | 'icon' | 'color'>> = {
  TRADER: { currency: 'USD', icon: 'candlestick_chart', color: '#B864FF' },
  INVESTOR: { currency: 'THB', icon: 'trending_up', color: '#2DD4BF' },
};

let nextId = Math.max(...MOCK_PORTFOLIOS.map((portfolio) => portfolio.id)) + 1;

/** เลียนแบบ PortfoliosService.create() — ตั้ง default อัตโนมัติถ้าเป็นพอร์ตแรกของประเภทนั้น */
export function addMockPortfolio(body: Record<string, unknown>): Portfolio {
  const portfolioType: PortfolioType = body.portfolio_type === 'INVESTOR' ? 'INVESTOR' : 'TRADER';
  const defaults = DEFAULTS_BY_TYPE[portfolioType];

  const sameType = MOCK_PORTFOLIOS.filter(
    (portfolio) => portfolio.portfolio_type === portfolioType,
  );

  const isDefault = typeof body.is_default === 'boolean' ? body.is_default : sameType.length === 0;

  if (isDefault) {
    sameType.forEach((portfolio) => {
      portfolio.is_default = false;
    });
  }

  const initialBalance = Number(body.initial_balance ?? 0);

  const created: Portfolio = {
    id: nextId++,
    user_id: MOCK_USER.id,
    name: asString(body.name, 'พอร์ตใหม่'),
    initial_balance: initialBalance,
    current_balance: initialBalance,
    portfolio_type: portfolioType,
    investor_cost_method: 'FIFO',
    currency: typeof body.currency === 'string' ? body.currency : defaults.currency,
    icon: typeof body.icon === 'string' ? body.icon : defaults.icon,
    color: typeof body.color === 'string' ? body.color : defaults.color,
    is_default: isDefault,
    created_at: isoDaysAgo(0),
    updated_at: isoDaysAgo(0),
  };

  MOCK_PORTFOLIOS.push(created);

  return created;
}

export function updateMockPortfolio(id: number, body: Record<string, unknown>): Portfolio {
  const portfolio = findMockPortfolio(id);

  if (!portfolio) {
    return addMockPortfolio({ ...body, id });
  }

  Object.assign(portfolio, body, { updated_at: isoDaysAgo(0) });

  return portfolio;
}

export function removeMockPortfolio(id: number): boolean {
  const index = MOCK_PORTFOLIOS.findIndex((portfolio) => portfolio.id === id);

  if (index < 0) {
    return false;
  }

  MOCK_PORTFOLIOS.splice(index, 1);

  return true;
}

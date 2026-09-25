import { BrokerType } from '../../interfaces/broker-types';
import type {
  BrokerAccountSnapshot,
  BrokerDeal,
  BrokerDealEntryType,
  BrokerPosition,
} from '../../interfaces/broker-types';

/**
 * Pure MT5 wire-format -> domain-type mapping. No Prisma, no NestJS DI, no database
 * calls, no portfolio/business logic (partial-close accounting, idempotency, records
 * writes) — that all lives in mt5-sync.service.ts, which consumes this module's output.
 * Every function here is a plain export, safely unit-testable with fixture JSON in,
 * exact object out, no mocks.
 *
 * Validation performed here is purely structural (required fields present, numeric
 * values finite, timestamps parseable, enum values recognized) — not business rules.
 * Invalid input throws Mt5NormalizationError; callers (the ingestion layer) translate
 * that into a 400 response.
 */
export class Mt5NormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Mt5NormalizationError';
  }
}

// ---------------------------------------------------------------------------
// Wire-format shapes (exactly what the EA is expected to send inside `payload`)
// ---------------------------------------------------------------------------

export interface Mt5AccountSnapshotWire {
  accountLogin: number | string;
  balance: number;
  equity: number;
  margin: number;
  marginFree: number;
  marginLevel: number;
  credit: number;
  currency: string;
  leverage: number;
}

export interface Mt5PositionWire {
  positionTicket: number | string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  volume: number;
  openPrice: number;
  currentPrice: number | null;
  sl: number | null;
  tp: number | null;
  swap: number;
  profit: number | null;
  openedAt: string;
}

export interface Mt5DealWire {
  dealTicket: number | string;
  orderTicket: number | string | null;
  positionTicket: number | string;
  symbol: string;
  entryType: BrokerDealEntryType;
  volume: number;
  price: number;
  commission: number;
  swap: number;
  profit: number;
  executedAt: string;
}

const VALID_DIRECTIONS = new Set(['LONG', 'SHORT']);
const VALID_ENTRY_TYPES = new Set(['IN', 'OUT', 'INOUT', 'OUT_BY']);

function requireTicket(value: unknown, field: string): string {
  if (value === null || value === undefined || value === '') {
    throw new Mt5NormalizationError(`${field} is required`);
  }
  const str = String(value).trim();
  if (str.length === 0) {
    throw new Mt5NormalizationError(`${field} is required`);
  }
  return str;
}

function requireFiniteNumber(value: unknown, field: string): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (typeof value !== 'number' || !Number.isFinite(num)) {
    throw new Mt5NormalizationError(`${field} must be a finite number`);
  }
  return num;
}

function optionalFiniteNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return requireFiniteNumber(value, field);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Mt5NormalizationError(`${field} is required`);
  }
  return value.trim();
}

function requireDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Mt5NormalizationError(`${field} is required`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Mt5NormalizationError(
      `${field} is not a valid ISO timestamp: ${value}`,
    );
  }
  return date;
}

function requireDirection(value: unknown): 'LONG' | 'SHORT' {
  if (typeof value !== 'string' || !VALID_DIRECTIONS.has(value)) {
    throw new Mt5NormalizationError(
      `direction must be one of LONG, SHORT (got ${JSON.stringify(value)})`,
    );
  }
  return value as 'LONG' | 'SHORT';
}

function requireEntryType(value: unknown): BrokerDealEntryType {
  if (typeof value !== 'string' || !VALID_ENTRY_TYPES.has(value)) {
    throw new Mt5NormalizationError(
      `entryType must be one of IN, OUT, INOUT, OUT_BY (got ${JSON.stringify(value)})`,
    );
  }
  return value as BrokerDealEntryType;
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

export function normalizeAccountSnapshot(
  wire: Mt5AccountSnapshotWire,
): BrokerAccountSnapshot {
  return {
    externalAccountId: requireTicket(wire.accountLogin, 'accountLogin'),
    broker: BrokerType.MT5,
    balance: requireFiniteNumber(wire.balance, 'balance'),
    equity: requireFiniteNumber(wire.equity, 'equity'),
    margin: requireFiniteNumber(wire.margin, 'margin'),
    marginFree: requireFiniteNumber(wire.marginFree, 'marginFree'),
    marginLevel: optionalFiniteNumber(wire.marginLevel, 'marginLevel'),
    credit: requireFiniteNumber(wire.credit, 'credit'),
    currency: requireNonEmptyString(wire.currency, 'currency').toUpperCase(),
    leverage: optionalFiniteNumber(wire.leverage, 'leverage'),
    raw: wire,
  };
}

export function normalizePosition(wire: Mt5PositionWire): BrokerPosition {
  return {
    externalPositionId: requireTicket(wire.positionTicket, 'positionTicket'),
    symbol: requireNonEmptyString(wire.symbol, 'symbol').toUpperCase(),
    direction: requireDirection(wire.direction),
    volume: requireFiniteNumber(wire.volume, 'volume'),
    openPrice: requireFiniteNumber(wire.openPrice, 'openPrice'),
    currentPrice: optionalFiniteNumber(wire.currentPrice, 'currentPrice'),
    stopLoss: optionalFiniteNumber(wire.sl, 'sl'),
    takeProfit: optionalFiniteNumber(wire.tp, 'tp'),
    swap: requireFiniteNumber(wire.swap, 'swap'),
    profit: optionalFiniteNumber(wire.profit, 'profit'),
    openedAt: requireDate(wire.openedAt, 'openedAt'),
    raw: wire,
  };
}

export function normalizeDeal(wire: Mt5DealWire): BrokerDeal {
  return {
    externalDealId: requireTicket(wire.dealTicket, 'dealTicket'),
    externalOrderId:
      wire.orderTicket === null ||
      wire.orderTicket === undefined ||
      wire.orderTicket === ''
        ? null
        : requireTicket(wire.orderTicket, 'orderTicket'),
    externalPositionId: requireTicket(wire.positionTicket, 'positionTicket'),
    symbol: requireNonEmptyString(wire.symbol, 'symbol').toUpperCase(),
    entryType: requireEntryType(wire.entryType),
    volume: requireFiniteNumber(wire.volume, 'volume'),
    price: requireFiniteNumber(wire.price, 'price'),
    commission: requireFiniteNumber(wire.commission, 'commission'),
    swap: requireFiniteNumber(wire.swap, 'swap'),
    profit: requireFiniteNumber(wire.profit, 'profit'),
    executedAt: requireDate(wire.executedAt, 'executedAt'),
    raw: wire,
  };
}

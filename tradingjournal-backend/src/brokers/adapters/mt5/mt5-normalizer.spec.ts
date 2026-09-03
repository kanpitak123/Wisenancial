import {
  Mt5AccountSnapshotWire,
  Mt5DealWire,
  Mt5NormalizationError,
  Mt5PositionWire,
  normalizeAccountSnapshot,
  normalizeDeal,
  normalizePosition,
} from './mt5-normalizer';

// สมจริงตาม TRADING_PLATFORM_INTEGRATION_SPEC.md §5.4 (MT5 POSITION_*/DEAL_* properties)
// และ payload contract ที่ตกลงไว้ใน Phase 3 design review §5
const accountFixture: Mt5AccountSnapshotWire = {
  accountLogin: 12345678,
  balance: 10000.5,
  equity: 10120.75,
  margin: 200,
  marginFree: 9920.75,
  marginLevel: 5060.38,
  credit: 0,
  currency: 'usd',
  leverage: 100,
};

const positionFixture: Mt5PositionWire = {
  positionTicket: 987654321,
  symbol: 'xauusd',
  direction: 'LONG',
  volume: 0.5,
  openPrice: 2350.12,
  currentPrice: 2360.5,
  sl: 2300,
  tp: 2400,
  swap: -1.25,
  profit: 51.9,
  openedAt: '2026-09-01T08:00:00Z',
};

const dealFixture: Mt5DealWire = {
  dealTicket: 555000111,
  orderTicket: 444000111,
  positionTicket: 987654321,
  symbol: 'xauusd',
  entryType: 'IN',
  volume: 0.5,
  price: 2350.12,
  commission: -2.5,
  swap: 0,
  profit: 0,
  executedAt: '2026-09-01T08:00:00Z',
};

describe('normalizeAccountSnapshot', () => {
  it('maps a valid MT5 account snapshot into BrokerAccountSnapshot', () => {
    const result = normalizeAccountSnapshot(accountFixture);

    expect(result).toEqual({
      externalAccountId: '12345678',
      broker: 'MT5',
      balance: 10000.5,
      equity: 10120.75,
      margin: 200,
      marginFree: 9920.75,
      marginLevel: 5060.38,
      credit: 0,
      currency: 'USD',
      leverage: 100,
      raw: accountFixture,
    });
  });

  it('uppercases currency', () => {
    expect(normalizeAccountSnapshot({ ...accountFixture, currency: 'eur' }).currency).toBe('EUR');
  });

  it('allows marginLevel/leverage to be null (MT5 reports 0/undefined when no open positions)', () => {
    const result = normalizeAccountSnapshot({
      ...accountFixture,
      marginLevel: null as unknown as number,
      leverage: null as unknown as number,
    });
    expect(result.marginLevel).toBeNull();
    expect(result.leverage).toBeNull();
  });

  it.each(['balance', 'equity', 'margin', 'marginFree', 'credit'] as const)(
    'throws Mt5NormalizationError when %s is missing',
    (field) => {
      const broken = { ...accountFixture, [field]: undefined } as unknown as Mt5AccountSnapshotWire;
      expect(() => normalizeAccountSnapshot(broken)).toThrow(Mt5NormalizationError);
    },
  );

  it('throws when a numeric field is not finite (NaN/Infinity)', () => {
    expect(() =>
      normalizeAccountSnapshot({ ...accountFixture, balance: Number.NaN }),
    ).toThrow(Mt5NormalizationError);
    expect(() =>
      normalizeAccountSnapshot({ ...accountFixture, equity: Number.POSITIVE_INFINITY }),
    ).toThrow(Mt5NormalizationError);
  });

  it('throws when accountLogin is missing/empty', () => {
    expect(() =>
      normalizeAccountSnapshot({ ...accountFixture, accountLogin: '' }),
    ).toThrow(Mt5NormalizationError);
  });

  it('throws when currency is empty', () => {
    expect(() =>
      normalizeAccountSnapshot({ ...accountFixture, currency: '  ' }),
    ).toThrow(Mt5NormalizationError);
  });
});

describe('normalizePosition', () => {
  it('maps a valid MT5 open position into BrokerPosition', () => {
    const result = normalizePosition(positionFixture);

    expect(result).toEqual({
      externalPositionId: '987654321',
      symbol: 'XAUUSD',
      direction: 'LONG',
      volume: 0.5,
      openPrice: 2350.12,
      currentPrice: 2360.5,
      stopLoss: 2300,
      takeProfit: 2400,
      swap: -1.25,
      profit: 51.9,
      openedAt: new Date('2026-09-01T08:00:00Z'),
      raw: positionFixture,
    });
  });

  it('maps SHORT direction', () => {
    expect(normalizePosition({ ...positionFixture, direction: 'SHORT' }).direction).toBe('SHORT');
  });

  it('allows sl/tp/currentPrice/profit to be null (no stop set / market closed)', () => {
    const result = normalizePosition({
      ...positionFixture,
      sl: null,
      tp: null,
      currentPrice: null,
      profit: null,
    });
    expect(result.stopLoss).toBeNull();
    expect(result.takeProfit).toBeNull();
    expect(result.currentPrice).toBeNull();
    expect(result.profit).toBeNull();
  });

  it('throws when positionTicket is missing', () => {
    expect(() =>
      normalizePosition({ ...positionFixture, positionTicket: '' }),
    ).toThrow(Mt5NormalizationError);
  });

  it('throws when direction is not LONG/SHORT', () => {
    expect(() =>
      normalizePosition({ ...positionFixture, direction: 'BUY' as unknown as 'LONG' }),
    ).toThrow(Mt5NormalizationError);
  });

  it('throws when volume/openPrice/swap is not a finite number', () => {
    expect(() =>
      normalizePosition({ ...positionFixture, volume: Number.NaN }),
    ).toThrow(Mt5NormalizationError);
    expect(() =>
      normalizePosition({ ...positionFixture, openPrice: 'bad' as unknown as number }),
    ).toThrow(Mt5NormalizationError);
  });

  it('throws when openedAt is not a valid timestamp', () => {
    expect(() =>
      normalizePosition({ ...positionFixture, openedAt: 'not-a-date' }),
    ).toThrow(Mt5NormalizationError);
    expect(() =>
      normalizePosition({ ...positionFixture, openedAt: '' }),
    ).toThrow(Mt5NormalizationError);
  });

  it('uppercases symbol', () => {
    expect(normalizePosition({ ...positionFixture, symbol: 'eurusd' }).symbol).toBe('EURUSD');
  });
});

describe('normalizeDeal', () => {
  it('maps a valid MT5 opening deal (entryType IN) into BrokerDeal', () => {
    const result = normalizeDeal(dealFixture);

    expect(result).toEqual({
      externalDealId: '555000111',
      externalOrderId: '444000111',
      externalPositionId: '987654321',
      symbol: 'XAUUSD',
      entryType: 'IN',
      volume: 0.5,
      price: 2350.12,
      commission: -2.5,
      swap: 0,
      profit: 0,
      executedAt: new Date('2026-09-01T08:00:00Z'),
      raw: dealFixture,
    });
  });

  it.each(['IN', 'OUT', 'INOUT', 'OUT_BY'] as const)('accepts entryType %s', (entryType) => {
    expect(normalizeDeal({ ...dealFixture, entryType }).entryType).toBe(entryType);
  });

  it('allows orderTicket to be null (some closing deals have no originating order)', () => {
    expect(normalizeDeal({ ...dealFixture, orderTicket: null }).externalOrderId).toBeNull();
  });

  it('throws when dealTicket is missing', () => {
    expect(() => normalizeDeal({ ...dealFixture, dealTicket: '' })).toThrow(Mt5NormalizationError);
  });

  it('throws when positionTicket is missing', () => {
    expect(() =>
      normalizeDeal({ ...dealFixture, positionTicket: '' }),
    ).toThrow(Mt5NormalizationError);
  });

  it('throws when entryType is not one of IN/OUT/INOUT/OUT_BY', () => {
    expect(() =>
      normalizeDeal({ ...dealFixture, entryType: 'CLOSE' as unknown as 'IN' }),
    ).toThrow(Mt5NormalizationError);
  });

  it('throws when commission/swap/profit is not a finite number', () => {
    expect(() =>
      normalizeDeal({ ...dealFixture, commission: Number.NaN }),
    ).toThrow(Mt5NormalizationError);
    expect(() =>
      normalizeDeal({ ...dealFixture, profit: Number.POSITIVE_INFINITY }),
    ).toThrow(Mt5NormalizationError);
  });

  it('throws when executedAt is not a valid timestamp', () => {
    expect(() =>
      normalizeDeal({ ...dealFixture, executedAt: 'yesterday' }),
    ).toThrow(Mt5NormalizationError);
  });

  it('accepts a realized closing deal (entryType OUT) with nonzero profit', () => {
    const closing = normalizeDeal({
      ...dealFixture,
      dealTicket: 555000222,
      entryType: 'OUT',
      profit: 87.4,
      commission: -2.5,
      swap: -1.25,
      executedAt: '2026-09-01T14:30:00Z',
    });
    expect(closing.entryType).toBe('OUT');
    expect(closing.profit).toBe(87.4);
  });
});

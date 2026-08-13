import type {
  ManualRecordType,
  RecordSource,
  RecordStatus,
  RecordType,
  RecordsQuery,
} from '../types/records.types';

export const RECORDS_API_PATH =
  '/records';

export const DEFAULT_RECORDS_QUERY:
  RecordsQuery = {
  limit: 100,
  status: 'ACTIVE',
};

export const MANUAL_RECORD_TYPES:
  readonly ManualRecordType[] = [
  'DEPOSIT',
  'WITHDRAW',
  'ADJUSTMENT',
  'FEE',
  'TAX',
];

export const RECORD_TYPES:
  readonly RecordType[] = [
  'DEPOSIT',
  'WITHDRAW',
  'FEE',
  'ADJUSTMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'TRADE_PNL',
  'STOCK_BUY',
  'STOCK_SELL',
  'DIVIDEND',
  'TAX',
  'REVERSAL',
];

export const RECORD_SOURCES:
  readonly RecordSource[] = [
  'MANUAL',
  'TRADE',
  'STOCK_PURCHASE',
  'DIVIDEND',
  'TRANSFER',
  'SYSTEM',
];

export const RECORD_STATUSES:
  readonly RecordStatus[] = [
  'ACTIVE',
  'REVERSED',
];

export const RECORDS_MESSAGES = {
  portfolioRequired:
    'ยังไม่ได้เลือก Portfolio',
  loadFailed:
    'โหลดรายการเงินสดไม่สำเร็จ',
  createFailed:
    'สร้างรายการไม่สำเร็จ',
  transferFailed:
    'โอนเงินระหว่างพอร์ตไม่สำเร็จ',
  reverseFailed:
    'ยกเลิกรายการไม่สำเร็จ',
  rebuildFailed:
    'คำนวณยอดเงินใหม่ไม่สำเร็จ',
} as const;

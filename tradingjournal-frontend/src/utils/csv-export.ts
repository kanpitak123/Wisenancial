import type { Dividend } from 'src/types/dividend.types';
import type {
  InvestorActivity,
  InvestorSale,
  StockPurchase,
} from 'src/types/investor-portfolio.types';

/**
 * สร้างไฟล์ CSV สำหรับพอร์ตหุ้น
 *
 * แยกออกมาจากหน้าเพจเพื่อให้เทสได้โดยไม่ต้อง mount component และไม่ต้องพึ่ง DOM
 * (ตัว download เท่านั้นที่แตะ DOM)
 */

/** ครอบด้วย " และ escape " ซ้อนตามสเปก RFC 4180 */
export function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
}

const num = (value: number | string | null | undefined) => Number(value ?? 0);

const dateOnly = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

/**
 * จัดประเภทสินทรัพย์แบบหยาบเพื่อใช้ยื่นภาษี
 * .BK = หุ้นไทย, อื่นๆ ถือเป็นหุ้นต่างประเทศ
 */
export function assetClassOf(symbol: string): string {
  return symbol.trim().toUpperCase().endsWith('.BK') ? 'หุ้นไทย' : 'หุ้นต่างประเทศ';
}

export function buildHoldingsCsv(purchases: StockPurchase[], currency: string): string {
  const headers = [
    'Symbol',
    'Name',
    'Asset Class',
    'Folder',
    'Shares Remaining',
    'Purchase Price',
    'Total Cost',
    'Fees',
    'Target Price',
    'Stop Loss',
    'Currency',
    'Purchase Date',
    'Strategy',
    'Notes',
  ];

  const rows = purchases.map((row) => [
    row.stock_symbol,
    row.stock_name ?? '',
    assetClassOf(row.stock_symbol),
    row.folder_name ?? '',
    num(row.remaining_shares),
    num(row.purchase_price),
    num(row.total_amount),
    num(row.fees),
    row.target_price === null ? '' : num(row.target_price),
    row.stop_loss === null ? '' : num(row.stop_loss),
    currency,
    dateOnly(row.purchase_date),
    row.strategy ?? '',
    row.notes ?? '',
  ]);

  return toCsv(headers, rows);
}

export function buildRealizedPnlCsv(sales: InvestorSale[], currency: string): string {
  const headers = [
    'Symbol',
    'Asset Class',
    'Shares Sold',
    'Sold Price',
    'Gross Amount',
    'Cost Basis',
    'Fees',
    'Realized P/L',
    'Cost Method',
    'Currency',
    'Sold Date',
    'Notes',
  ];

  const rows = sales.map((sale) => [
    sale.stock_symbol,
    assetClassOf(sale.stock_symbol),
    num(sale.shares_count),
    num(sale.sold_price),
    num(sale.gross_amount),
    num(sale.cost_basis),
    num(sale.fees),
    num(sale.realized_pnl),
    sale.cost_method ?? 'FIFO',
    currency,
    dateOnly(sale.sold_date),
    sale.notes ?? '',
  ]);

  return toCsv(headers, rows);
}

/**
 * ประวัติกิจกรรมของพอร์ต (ซื้อ/ขาย/ฝาก/ถอน/ปันผล) — แถวเดียวกับที่ Dashboard แสดง
 *
 * ไม่มี asset class ในนี้เพราะ activity บางชนิด (DEPOSIT/WITHDRAW) ไม่ผูกกับหุ้นตัวใด
 */
export function buildActivityCsv(activities: InvestorActivity[], currency: string): string {
  const headers = ['Date', 'Type', 'Symbol', 'Description', 'Amount', 'Currency', 'Status'];

  const rows = activities.map((item) => [
    dateOnly(item.occurred_at),
    item.type,
    item.symbol ?? '',
    item.description ?? '',
    num(item.amount),
    currency,
    item.status ?? '',
  ]);

  return toCsv(headers, rows);
}

/** เงินปันผลที่รับจริง — ยอด net คือหลังหักภาษี ณ ที่จ่ายแล้ว */
export function buildDividendCsv(dividends: Dividend[], currency: string): string {
  const headers = [
    'Payment Date',
    'Symbol',
    'Name',
    'Asset Class',
    'Shares',
    'Dividend / Share',
    'WHT Rate',
    'Gross Amount',
    'Tax Withheld',
    'Net Amount',
    'Currency',
    'Status',
  ];

  const rows = dividends.map((item) => [
    dateOnly(item.payment_date),
    item.symbol,
    item.name ?? '',
    assetClassOf(item.symbol),
    num(item.shares),
    num(item.dividend_per_share),
    num(item.wht_rate),
    num(item.gross_amount),
    num(item.tax_withheld),
    num(item.net_amount),
    currency,
    item.status,
  ]);

  return toCsv(headers, rows);
}

/** BOM (U+FEFF) ข้างหน้าเพื่อให้ Excel เปิดภาษาไทยไม่เป็นตัวยึกยือ */
const UTF8_BOM = '﻿';

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`${UTF8_BOM}${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

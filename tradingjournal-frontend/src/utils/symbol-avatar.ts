/**
 * ป้ายตัวอักษรย่อประจำหุ้น — สีคงที่ต่อสัญลักษณ์ (hash จากตัวอักษร)
 *
 * เดิมโค้ดชุดนี้ถูกก๊อปไว้สองที่ (WatchlistPage, MarketOverviewSection) และ
 * เวอร์ชันของสองที่ก็ไม่ตรงกัน (ตัวหนึ่งตัด suffix ".BK" ออกก่อน อีกตัวไม่ตัด)
 * รวมมาไว้ที่เดียวเพื่อให้หุ้นตัวเดียวกันได้สีและตัวย่อเหมือนกันทุกหน้า
 *
 * ใช้เป็น fallback ของโลโก้ Clearbit ด้วย — โลโก้จาก logo.clearbit.com มักโดน
 * ad blocker บล็อก (ไม่ใช่ปัญหาฝั่งเรา) ถ้าไม่มีตัวสำรองจะเหลือช่องว่างเปล่า
 */
const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#0d9488', '#d97706', '#db2777', '#059669'];

const hashSymbol = (symbol: string): number =>
  [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);

/** สีพื้นของป้าย — สัญลักษณ์เดิมได้สีเดิมเสมอ */
export const symbolAvatarColor = (symbol: string): string =>
  AVATAR_COLORS[hashSymbol(symbol) % AVATAR_COLORS.length]!;

/** ตัวย่อสองตัว ตัด suffix ตลาด (.BK) และอักขระที่ไม่ใช่ตัวอักษร/ตัวเลขออกก่อน */
export const symbolAvatarInitials = (symbol: string): string =>
  symbol
    .replace(/\..*$/, '')
    .replace(/[^A-Z0-9]/gi, '')
    .slice(0, 2)
    .toUpperCase();

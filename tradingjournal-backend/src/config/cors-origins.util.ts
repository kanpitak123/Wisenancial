/**
 * รายชื่อ origin ที่อนุญาต — ใช้ร่วมกันทั้ง HTTP และ WebSocket
 *
 * เดิม main.ts มีกติกาชุดนี้อยู่คนเดียว (บังคับให้ตั้ง CORS_ORIGINS บน production
 * และไม่ยอมให้ใส่ '*' เพราะเปิด credentials อยู่) แต่ @WebSocketGateway ทั้งสองตัว
 * hardcode `origin: '*'` ไว้ในโค้ด จึงข้ามกติกานั้นไปทั้งหมด — ประตูหน้าล็อกแต่
 * ประตูข้างเปิดค้าง
 */

/** parse ค่า env เป็นรายการ origin — ไม่โยน error เพื่อให้เรียกจากตอน import ได้ */
export function resolveCorsOrigins(): string[] {
  const configured =
    process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL;

  const isProduction = process.env.NODE_ENV === 'production';
  const raw = configured ?? (isProduction ? '' : 'http://localhost:9000');

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter((origin) => origin !== '*');
}

/**
 * ตรวจความถูกต้องตอน boot — เรียกจาก main.ts เท่านั้น
 *
 * แยกจาก resolveCorsOrigins() เพราะ decorator ของ gateway ทำงานตอน import module
 * ซึ่งเกิดก่อน bootstrap() ถ้าให้ตัวที่ gateway เรียกโยน error เอง ข้อความที่ผู้ดูแล
 * เห็นจะเป็น stack ตอน import แทนที่จะเป็นข้อความบอกสาเหตุที่เขียนไว้ให้อ่านง่าย
 */
export function assertCorsOriginsValid(): string[] {
  const configured =
    process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL;

  if (process.env.NODE_ENV === 'production' && !configured) {
    throw new Error(
      'CORS_ORIGINS (or FRONTEND_URL) must be set in production — refusing to start with a development fallback',
    );
  }

  if (configured?.split(',').some((origin) => origin.trim() === '*')) {
    // สเปก CORS ห้าม credentials คู่กับ '*' อยู่แล้ว เบราว์เซอร์จะบล็อกเงียบ ๆ
    // ทำให้ refresh token cookie ไม่เคยถูกส่ง — ดักไว้ตรงนี้จะหาเจอง่ายกว่ามาก
    throw new Error(
      'CORS_ORIGINS cannot contain "*" because credentials are enabled — list explicit origins instead',
    );
  }

  return resolveCorsOrigins();
}

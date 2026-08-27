/**
 * ชิ้นส่วน prompt ที่ทุกฟีเจอร์ AI ใช้ร่วมกัน
 *
 * ก่อนหน้านี้แต่ละ service เขียน system prompt ของตัวเองอิสระ ผลคือเรื่องภาษา
 * ไม่ตรงกันสักจุด: analyzeChart บังคับ "Reply in Thai" ตายตัวไม่สนภาษาที่ผู้ใช้
 * ตั้งไว้ในแอป, news ส่ง field `language` เข้าไปเฉย ๆ โดยไม่มีคำสั่งให้ทำตาม,
 * ที่เหลืออีก 5 จุดไม่พูดถึงภาษาเลยแล้วปล่อยให้โมเดลเดาเอง — ผู้ใช้คนเดียวกัน
 * จึงเจอคำตอบสลับไทย/อังกฤษไปมาแล้วแต่ว่ากดปุ่มไหน
 *
 * รวมไว้ที่เดียวเพื่อให้ทุกจุดพูดเรื่องเดียวกันด้วยถ้อยคำเดียวกัน
 */

export type AiOutputLanguage = 'th' | 'en';

/**
 * ค่าเริ่มต้นเป็นไทยให้ตรงกับ LanguageStore ฝั่งหน้าบ้าน (currentLanguage: 'th')
 *
 * สำคัญกับ analyzeChart เป็นพิเศษ: ของเดิม hardcode ไทยไว้ใน prompt การที่
 * client เก่าที่ยังไม่ส่ง outputLanguage มาแล้วได้ไทยเหมือนเดิม คือการไม่เปลี่ยน
 * พฤติกรรมที่ผู้ใช้เห็นอยู่ตอนนี้
 */
export const DEFAULT_OUTPUT_LANGUAGE: AiOutputLanguage = 'th';

/** รับค่าที่ client ส่งมาแล้วบีบให้เหลือค่าที่รองรับจริง — อะไรที่ไม่รู้จักตกเป็นค่าเริ่มต้น */
export function resolveOutputLanguage(
  value?: string | null,
): AiOutputLanguage {
  return value === 'en' || value === 'th'
    ? value
    : DEFAULT_OUTPUT_LANGUAGE;
}

/**
 * บรรทัดบังคับภาษาที่ใช้เหมือนกันทุก prompt
 *
 * ใช้ชื่อภาษาเต็ม ("Thai"/"English") ไม่ใช่รหัส ISO เพราะ prompt เป็นภาษาอังกฤษ
 * ทั้งก้อน การเขียนว่า "Output language: th" ทำให้โมเดลบางเจ้าตีความว่าเป็น
 * ค่า config มากกว่าคำสั่ง
 */
export function outputLanguageRule(
  language: AiOutputLanguage,
): string {
  const name = language === 'th' ? 'Thai' : 'English';

  return `Output language: ${name} — always match this exactly, regardless of the language of the supplied data.`;
}

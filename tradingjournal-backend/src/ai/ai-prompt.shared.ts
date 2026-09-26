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
export function resolveOutputLanguage(value?: string | null): AiOutputLanguage {
  return value === 'en' || value === 'th' ? value : DEFAULT_OUTPUT_LANGUAGE;
}

/**
 * บรรทัดบังคับภาษาที่ใช้เหมือนกันทุก prompt
 *
 * ใช้ชื่อภาษาเต็ม ("Thai"/"English") ไม่ใช่รหัส ISO เพราะ prompt เป็นภาษาอังกฤษ
 * ทั้งก้อน การเขียนว่า "Output language: th" ทำให้โมเดลบางเจ้าตีความว่าเป็น
 * ค่า config มากกว่าคำสั่ง
 */
export function outputLanguageRule(language: AiOutputLanguage): string {
  const name = languageName(language);

  return `Output language: ${name}. Respond only in ${name}: every text field must be written in ${name}, regardless of the language of the supplied data. Never answer in Korean, Chinese, Japanese or any other language. Ticker symbols, numbers and standard finance abbreviations (P/E, beta) may stay as they are.`;
}

export function languageName(language: AiOutputLanguage): string {
  return language === 'th' ? 'Thai' : 'English';
}

/**
 * คำสั่งภาษาสั้น ๆ ที่ต้องอยู่ "ในข้อความของผู้ใช้" ด้วย ไม่ใช่แค่ system prompt
 *
 * โมเดลเล็กอย่าง Haiku เคยตอบเป็นภาษาเกาหลีทั้งที่ system prompt สั่งไทยไว้ — ข้อมูลที่ยัด
 * ลงใน user message เป็นก้อนใหญ่ ทำให้คำสั่งใน system prompt จางลง จึงย้ำอีกครั้งท้ายสุด
 * ใกล้จุดที่โมเดลเริ่มเขียนคำตอบที่สุด
 */
export function languageInstruction(language: AiOutputLanguage): string {
  return `Respond only in ${languageName(language)}.`;
}

/** ใส่คำสั่งภาษาเข้าไปใน payload ที่จะถูก JSON.stringify เป็น user message */
export function withLanguage<T extends object>(
  payload: T,
  language: AiOutputLanguage,
): T & { languageInstruction: string } {
  return { ...payload, languageInstruction: languageInstruction(language) };
}

/**
 * บรรทัดกันโมเดลพูดเป็นคำสั่งซื้อขาย — ใส่ในทุก prompt ที่แตะหุ้น/พอร์ต
 *
 * เดิมมีแค่ Investor review จุดเดียวที่เขียน "Do not predict prices" อีก 6 จุด
 * ไม่มีอะไรกันเลย ทั้งที่ AI Picks มีเนื้องานคือ "แนะนำหุ้น" ตรง ๆ — เสี่ยงทั้งเรื่อง
 * ผู้ใช้เอาไปตัดสินใจจริงโดยเข้าใจว่าเป็นคำแนะนำการลงทุน และเรื่องกฎเกณฑ์ที่ห้าม
 * ให้คำแนะนำการลงทุนโดยไม่มีใบอนุญาต
 *
 * ไม่ได้แทนที่ "Do not predict prices" ของเดิม แต่ใช้คู่กัน — คนละเรื่องกัน
 * (อันนั้นห้ามทำนายอนาคต อันนี้ห้ามสั่งให้ลงมือ)
 */
export function investmentGuardrail(): string {
  return 'Never use words like "buy", "sell", "recommend buying", or promise/guarantee returns. Frame every output as an observation about the supplied data, not an instruction to act.';
}

/**
 * บรรทัดเสริมเฉพาะ AI Picks — จุดที่ใกล้เคียงคำว่า "แนะนำให้ซื้อ" ที่สุดในระบบ
 *
 * ต่อท้าย investmentGuardrail() ไม่ใช่แทนที่ เพราะงานของมันคือเรียงลำดับหุ้นให้ดู
 * ซึ่งโดยธรรมชาติชวนให้โมเดลบอกว่าตัวไหน "ดีกว่า" — ต้องปิดช่องนั้นเพิ่มอีกชั้น
 */
/**
 * บรรทัดคุมความยาวของทุกฟิลด์ข้อความ
 *
 * เพดาน maxOutputTokens ถูกขยับขึ้นทุกจุดในเฟสนี้เพื่อกันคำตอบโดนตัดกลางคัน แต่
 * เพดานที่สูงขึ้นอย่างเดียวแปลว่าโมเดล verbose จะเขียนยาวขึ้นจริง ๆ ไม่ได้ตอบดีขึ้น
 * — ผู้ใช้ต้องอ่านเยอะขึ้นและจ่ายเครดิตตาม output token ที่ใช้จริง สองอย่างนี้จึงต้อง
 * มาคู่กัน: เพดานกันพัง + บรรทัดนี้กันเฟ้อ
 *
 * ย้ำว่า "นับแยกรายฟิลด์" เพราะ schema ที่ซ้อนกัน (reasoning ของ AI Picks มี 4
 * sub-field) ถ้าโมเดลตีความว่าเป็นโควตารวมของทั้ง object มันจะทุ่มไปที่ฟิลด์แรก
 * ฟิลด์เดียวแล้วเหลือที่เหลือสั้นจนไม่มีเนื้อหา
 */
export function concisenessRule(): string {
  return [
    'Keep each text field concise — about 40 words at most.',
    'That budget applies to every field on its own, including each sub-field of a nested object; it is not a total shared across them.',
    'For fields that are arrays of strings, keep each item to one short sentence.',
  ].join(' ');
}

export function screeningOnlyGuardrail(): string {
  return "This is educational screening output only, not personalized investment advice. Do not imply any candidate is a 'good buy' or better than the others beyond what the supplied metrics show.";
}

/**
 * ข่าวเป็นกรณีพิเศษ: มีสองภาษาในคำตอบเดียว (aiSummary/stockImpactAnalysis ตามภาษาข่าว
 * ส่วน aiTranslatedSummary เป็นไทยเสมอ) จึงบอกให้ชัดว่า "ตอบภาษาเดียว" ใช้กับฟิลด์ไหน
 */
export function newsLanguageRule(language: AiOutputLanguage): string {
  const name = languageName(language);

  return `Respond only in ${name} in aiSummary and stockImpactAnalysis (aiTranslatedSummary is always Thai). Never answer in Korean, Chinese, Japanese or any other language.`;
}

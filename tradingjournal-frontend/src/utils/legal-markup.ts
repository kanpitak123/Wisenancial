/**
 * แยกข้อความกฎหมายเป็นส่วน ๆ เพื่อแสดงผล — รองรับเฉพาะสองแบบ:
 *   **ตัวหนา**   และ   [ตัวยึดที่ยังรอคำตอบ]
 * ไม่ใช้ v-html: เนื้อหามาจากไฟล์ในโปรเจกต์ก็จริง แต่ไม่มีเหตุผลต้องเปิดช่อง HTML injection
 */
export type LegalSegmentType = 'text' | 'bold' | 'placeholder';

export interface LegalSegment {
  type: LegalSegmentType;
  text: string;
}

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]*\])/g;

export function tokenizeLegalText(text: string): LegalSegment[] {
  const segments: LegalSegment[] = [];

  for (const part of text.split(TOKEN)) {
    if (part === '') continue;

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      segments.push({ type: 'bold', text: part.slice(2, -2) });
    } else if (part.startsWith('[') && part.endsWith(']')) {
      segments.push({ type: 'placeholder', text: part });
    } else {
      segments.push({ type: 'text', text: part });
    }
  }

  return segments;
}

/** จำนวนตัวยึดในข้อความ (ใช้สรุปบนแบนเนอร์ว่ายังเหลือกี่ข้อ) */
export function countLegalPlaceholders(text: string): number {
  return tokenizeLegalText(text).filter((s) => s.type === 'placeholder').length;
}

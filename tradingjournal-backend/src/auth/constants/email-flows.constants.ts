/**
 * ค่าคงที่ของ flow รีเซ็ตรหัสผ่าน / ยืนยันอีเมล
 *
 * อายุ token สั้นโดยตั้งใจ: ลิงก์รีเซ็ต = กุญแจเข้าบัญชี จึงให้ 30 นาที ส่วนลิงก์ยืนยันอีเมล
 * ทำอันตรายได้น้อยกว่า (แค่ทำให้บัญชีเป็น "ยืนยันแล้ว") จึงให้ 24 ชั่วโมง
 */
export const EMAIL_FLOW = {
  resetTtlMinutes: 30,
  verifyTtlHours: 24,

  /**
   * เพดานต่ออีเมลในหน้าต่าง 1 ชั่วโมง — นับจากแถว token ที่ออกไปแล้วใน DB (ทนหลาย instance)
   * เกินเพดานแล้วไม่ส่งอีเมลเพิ่มแต่ยังตอบเหมือนสำเร็จ (ไม่บอกใบ้ว่ามีบัญชีนี้หรือไม่)
   * กันคนเอาอีเมลของคนอื่นมายิงจนกล่องจดหมายเขาท่วม
   */
  maxEmailsPerAddressPerHour: Number(
    process.env.EMAIL_FLOW_MAX_PER_ADDRESS_PER_HOUR ?? 3,
  ),

  /** เว้นระหว่างการส่งซ้ำอย่างน้อยเท่านี้ (วินาที) */
  resendCooldownSeconds: Number(
    process.env.EMAIL_FLOW_RESEND_COOLDOWN_SECONDS ?? 60,
  ),

  /** เพดานต่อ IP ของ endpoint ที่ส่งอีเมลได้ — เข้มกว่า login เพราะทุกครั้งที่ผ่านคืออีเมลออกจริง */
  ipThrottleLimit: Number(process.env.EMAIL_FLOW_IP_LIMIT ?? 5),
  ipThrottleTtlMs: Number(process.env.EMAIL_FLOW_IP_TTL_SECONDS ?? 60) * 1000,
} as const;

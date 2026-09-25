export interface MailMessage {
  to: string;
  subject: string;
  /** ข้อความล้วน — ทุก transport ต้องส่งได้ ส่วน html เป็นทางเลือก */
  text: string;
  html?: string;
}

/**
 * ช่องทางส่งอีเมลของระบบ — ใช้ abstract class เป็น DI token (ไม่ต้องมี string token แยก)
 *
 * ผู้ให้บริการจริง (SMTP/Resend/SES ฯลฯ) เสียบเข้ามาทีหลังด้วยการเพิ่ม transport ใน
 * MAIL_TRANSPORTS แล้วตั้ง MAIL_TRANSPORT ใน env — โค้ดฝั่ง auth ไม่ต้องแก้
 *
 * send() โยน error ได้เมื่อส่งไม่สำเร็จ ผู้เรียกต้องจับเอง และห้าม log เนื้อหาอีเมลตอนพัง
 * (เนื้อหามีลิงก์ที่ใช้งานได้จริง)
 */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

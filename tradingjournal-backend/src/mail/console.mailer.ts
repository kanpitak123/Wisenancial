import { Logger } from '@nestjs/common';
import { Mailer, type MailMessage } from './mailer';

/** a***@example.com — พอให้ดูออกว่าส่งให้ใคร โดยไม่ปล่อยอีเมลเต็มลง log */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');

  if (at < 1) return '***';

  return `${email[0]}***${email.slice(at)}`;
}

/**
 * Transport สำหรับ dev: ไม่ส่งอีเมลจริง แค่พิมพ์ข้อความ (รวมลิงก์) ลง log ให้คลิกทดสอบได้
 *
 * - พิมพ์เฉพาะเนื้อความที่มีลิงก์ซึ่งมี token ดิบ (ที่ผู้ใช้ต้องได้รับอยู่แล้ว) — ตัว hash
 *   ที่เก็บใน DB ไม่เคยเข้ามาถึง mailer จึงไม่มีทางหลุดผ่านทางนี้
 * - บน production ไม่พิมพ์เนื้อความเด็ดขาด: log ระบบถูกเก็บ/แชร์ ลิงก์ reset ที่ใช้งานได้
 *   ใน log = ใครอ่าน log ได้ก็ยึดบัญชีได้ จึงพิมพ์แค่คำเตือนว่ายังไม่ได้ตั้งผู้ให้บริการ
 */
export class ConsoleMailer extends Mailer {
  private readonly logger = new Logger('Mailer(console)');

  constructor(private readonly isProduction: boolean) {
    super();
  }

  send(message: MailMessage): Promise<void> {
    const to = maskEmail(message.to);

    if (this.isProduction) {
      this.logger.warn(
        `No mail provider configured (MAIL_TRANSPORT=console) — email "${message.subject}" to ${to} was NOT sent`,
      );

      return Promise.resolve();
    }

    this.logger.log(
      `DEV email to ${to} — "${message.subject}"\n${message.text}`,
    );

    return Promise.resolve();
  }
}

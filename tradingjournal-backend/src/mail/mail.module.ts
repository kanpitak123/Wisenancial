import { Module } from '@nestjs/common';
import { ConsoleMailer } from './console.mailer';
import { Mailer } from './mailer';

/** ดีฟอลต์เมื่อไม่ตั้ง MAIL_TRANSPORT — console = เฉพาะ dev ไม่ส่งอีเมลจริง */
export const DEFAULT_MAIL_TRANSPORT = 'console';

type MailerFactory = () => Mailer;

/**
 * ทะเบียน transport — เพิ่มผู้ให้บริการจริงตรงนี้ (คีย์ = ค่าของ MAIL_TRANSPORT)
 * ตอนนี้มีแค่ console ซึ่งเป็นดีฟอลต์ ผู้ให้บริการจริงจึงปิดอยู่จนกว่าจะเพิ่มและตั้ง env
 */
export const MAIL_TRANSPORTS: Record<string, MailerFactory> = {
  console: () => new ConsoleMailer(process.env.NODE_ENV === 'production'),
};

export function createMailer(
  name: string | undefined = process.env.MAIL_TRANSPORT,
): Mailer {
  const key = (name?.trim() || DEFAULT_MAIL_TRANSPORT).toLowerCase();
  const factory = MAIL_TRANSPORTS[key];

  if (!factory) {
    // ตายตั้งแต่ boot ดีกว่าเงียบแล้วไม่มีใครได้รับอีเมล reset
    throw new Error(
      `Unknown MAIL_TRANSPORT "${key}" — available: ${Object.keys(MAIL_TRANSPORTS).join(', ')}`,
    );
  }

  return factory();
}

@Module({
  providers: [{ provide: Mailer, useFactory: () => createMailer() }],
  exports: [Mailer],
})
export class MailModule {}

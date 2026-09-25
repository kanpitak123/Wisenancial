import type { MailMessage } from './mailer';

/** สองภาษาไทย/อังกฤษในฉบับเดียว — ยังไม่เก็บ locale ต่อผู้ใช้ จึงไม่รู้ภาษาของผู้รับ */
const SIGNATURE = 'Wisenancial';

export function renderVerifyEmail(args: {
  to: string;
  name: string;
  link: string;
  ttlHours: number;
}): MailMessage {
  const { to, name, link, ttlHours } = args;

  return {
    to,
    subject: 'ยืนยันอีเมลของคุณ / Verify your email — Wisenancial',
    text: [
      `สวัสดี ${name}`,
      '',
      `กดลิงก์นี้เพื่อยืนยันอีเมล (ใช้ได้ ${ttlHours} ชั่วโมง ใช้ได้ครั้งเดียว):`,
      link,
      '',
      'ถ้าคุณไม่ได้สมัครหรือขอยืนยันอีเมล ไม่ต้องทำอะไร ปล่อยผ่านได้เลย',
      '',
      `Hi ${name},`,
      '',
      `Open this link to verify your email (valid for ${ttlHours} hours, single use):`,
      link,
      '',
      "If you didn't sign up or request this, you can ignore this email.",
      '',
      SIGNATURE,
    ].join('\n'),
  };
}

export function renderPasswordResetEmail(args: {
  to: string;
  name: string;
  link: string;
  ttlMinutes: number;
}): MailMessage {
  const { to, name, link, ttlMinutes } = args;

  return {
    to,
    subject: 'รีเซ็ตรหัสผ่าน / Reset your password — Wisenancial',
    text: [
      `สวัสดี ${name}`,
      '',
      `กดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ ${ttlMinutes} นาที ใช้ได้ครั้งเดียว):`,
      link,
      '',
      'ถ้าคุณไม่ได้ขอรีเซ็ตรหัสผ่าน ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ',
      '',
      `Hi ${name},`,
      '',
      `Open this link to set a new password (valid for ${ttlMinutes} minutes, single use):`,
      link,
      '',
      "If you didn't request a reset, ignore this email — your current password still works.",
      '',
      SIGNATURE,
    ].join('\n'),
  };
}

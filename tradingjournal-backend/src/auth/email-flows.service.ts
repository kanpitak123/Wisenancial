import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EmailTokenPurpose } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { buildTokenLink, resolveFrontendBaseUrl } from '../mail/frontend-link';
import {
  renderPasswordResetEmail,
  renderVerifyEmail,
} from '../mail/mail-templates';
import { Mailer } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTH_CONSTANTS,
  AUTH_ERROR_MESSAGES,
} from './constants/auth.constants';
import { EMAIL_FLOW } from './constants/email-flows.constants';
import {
  generateOneTimeToken,
  hashOneTimeToken,
} from './utils/one-time-token.util';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

interface TokenRecipient {
  id: number;
  email: string;
  full_name: string;
}

type IssueResult = 'sent' | 'throttled' | 'unavailable' | 'failed';

/**
 * รีเซ็ตรหัสผ่านและยืนยันอีเมล
 *
 * หลักที่ใช้ทั้งสอง flow:
 * - token ดิบไปถึงผู้ใช้ทางอีเมลอย่างเดียว DB เก็บแค่ SHA-256 ใช้ได้ครั้งเดียว (ตั้ง used_at
 *   แบบ atomic ด้วย updateMany เงื่อนไข used_at IS NULL) และมีอายุสั้น
 * - ขอ token ใหม่ = ลิงก์เก่าที่ยังไม่ใช้ของ purpose เดียวกันใช้ไม่ได้อีก
 * - log ไม่มีอีเมลเต็ม token หรือ hash — มีแค่ว่าส่งไม่สำเร็จ
 */
@Injectable()
export class EmailFlowsService {
  private readonly logger = new Logger(EmailFlowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
  ) {}

  // ---------------------------------------------------------------- reset

  /**
   * ขอลิงก์รีเซ็ตรหัสผ่าน — ไม่โยน error และไม่คืนอะไรที่บอกได้ว่าอีเมลนี้มีบัญชีหรือไม่
   *
   * ตัว controller ตอบข้อความเดียวกันทันทีโดยไม่รอ method นี้ (เรียกแบบ fire-and-forget)
   * เวลาตอบของอีเมลที่มีกับไม่มีบัญชีจึงเท่ากัน ไม่ต้องรอ DB/การส่งอีเมล
   * เกินเพดานต่ออีเมล/เว้นช่วงส่งซ้ำ = ข้ามเงียบ ๆ ผู้ขอเห็นผลลัพธ์เหมือนเดิมทุกกรณี
   */
  async requestPasswordReset(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();

    const user = await this.prisma.users.findUnique({
      where: { email },
      select: { id: true, email: true, full_name: true },
    });

    if (!user) return;

    await this.issueAndSend(user, EmailTokenPurpose.PASSWORD_RESET);
  }

  /**
   * ตั้งรหัสผ่านใหม่ด้วย token จากอีเมล
   *
   * ทุกกรณีที่ token ใช้ไม่ได้ (ไม่มี/ใช้แล้ว/หมดอายุ/ผิดประเภท) ตอบข้อความและสถานะเดียวกัน
   * (400 ไม่ใช่ 401 — หน้าบ้านมองทุก 401 ว่า session หมดอายุ)
   *
   * สำเร็จแล้วอยู่ใน transaction เดียว: ใช้ token, เปลี่ยนรหัส, ยกเลิกลิงก์รีเซ็ตอื่นที่ค้าง
   * และ revoke refresh token ทุกใบของผู้ใช้ (ทุกเครื่องต้องล็อกอินใหม่ รวมถึงคนที่อาจ
   * ถือ session ที่ถูกขโมยอยู่) access token 15 นาทีที่ออกไปแล้วยังใช้ได้จนหมดอายุเอง
   */
  async resetPassword(token: string, newPassword: string) {
    const row = await this.findUsableToken(
      token,
      EmailTokenPurpose.PASSWORD_RESET,
    );

    const hashedPassword = await bcrypt.hash(
      newPassword,
      AUTH_CONSTANTS.bcryptSaltRounds,
    );

    const now = new Date();

    const sessionsRevoked = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.email_tokens.updateMany({
        where: { id: row.id, used_at: null, expires_at: { gt: now } },
        data: { used_at: now },
      });

      // ใครตัดหน้าใช้ token ใบนี้ไปก่อนระหว่างที่เรา hash รหัสผ่านอยู่
      if (consumed.count !== 1) {
        throw new BadRequestException(AUTH_ERROR_MESSAGES.invalidEmailToken);
      }

      await tx.users.update({
        where: { id: row.user_id },
        data: { password: hashedPassword, updated_at: now },
      });

      // ได้อ่านอีเมลฉบับนี้ = พิสูจน์ว่าคุมกล่องจดหมายอยู่ ถือเป็นการยืนยันอีเมลด้วย
      // (เฉพาะถ้าอีเมลของบัญชียังตรงกับที่ส่งลิงก์ไป และยังไม่เคยยืนยัน)
      await tx.users.updateMany({
        where: { id: row.user_id, email: row.email, email_verified_at: null },
        data: { email_verified_at: now },
      });

      await tx.email_tokens.updateMany({
        where: {
          user_id: row.user_id,
          purpose: EmailTokenPurpose.PASSWORD_RESET,
          used_at: null,
        },
        data: { used_at: now },
      });

      // ตรรกะเดียวกับ RefreshTokenService.revokeAllForUser แต่ต้องอยู่ใน transaction
      const revoked = await tx.refresh_tokens.updateMany({
        where: { user_id: row.user_id, revoked_at: null },
        data: { revoked_at: now },
      });

      return revoked.count;
    });

    return {
      message: 'ตั้งรหัสผ่านใหม่สำเร็จ กรุณาล็อกอินอีกครั้ง',
      sessions_revoked: sessionsRevoked,
    };
  }

  // ---------------------------------------------------------- verification

  /** ส่งลิงก์ยืนยันอีเมลให้ผู้ใช้ที่ล็อกอินอยู่ (ปุ่ม "ส่งอีเมลยืนยันอีกครั้ง") */
  async sendVerificationEmail(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        full_name: true,
        email_verified_at: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.userNotFound);
    }

    if (user.email_verified_at) {
      return { message: 'อีเมลนี้ยืนยันแล้ว', already_verified: true };
    }

    // ผู้ใช้ล็อกอินอยู่และเป็นบัญชีของตัวเอง — ไม่มีเรื่องเดาว่าอีเมลมีอยู่หรือไม่
    // จึงบอกตรง ๆ ว่าติดเพดานเพื่อให้ปุ่มแสดงเหตุผลได้
    const wait = await this.checkAllowance(
      user.id,
      EmailTokenPurpose.EMAIL_VERIFICATION,
    );

    if (wait !== null) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: AUTH_ERROR_MESSAGES.emailTooSoon,
          retry_after_seconds: wait,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const result = await this.issueAndSend(
      user,
      EmailTokenPurpose.EMAIL_VERIFICATION,
    );

    if (result === 'unavailable' || result === 'failed') {
      throw new ServiceUnavailableException(
        AUTH_ERROR_MESSAGES.emailUnavailable,
      );
    }

    return { message: 'ส่งอีเมลยืนยันแล้ว', already_verified: false };
  }

  /**
   * ส่งลิงก์ยืนยันให้บัญชีที่เพิ่งสมัคร — เรียกแบบ fire-and-forget จาก register
   * ส่งไม่สำเร็จก็ไม่ทำให้การสมัครล้ม ผู้ใช้กดส่งซ้ำได้จากแบนเนอร์
   */
  async sendVerificationForNewUser(user: TokenRecipient): Promise<void> {
    await this.issueAndSend(user, EmailTokenPurpose.EMAIL_VERIFICATION);
  }

  /**
   * ยืนยันอีเมลด้วย token — ไม่ต้องล็อกอิน (คนเปิดลิงก์จากมือถือ/เบราว์เซอร์อื่นได้)
   * ยืนยันได้ต่อเมื่ออีเมลของบัญชียังเป็นตัวเดียวกับที่ส่งลิงก์ไป
   */
  async verifyEmail(token: string) {
    const row = await this.findUsableToken(
      token,
      EmailTokenPurpose.EMAIL_VERIFICATION,
    );

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.email_tokens.updateMany({
        where: { id: row.id, used_at: null, expires_at: { gt: now } },
        data: { used_at: now },
      });

      if (consumed.count !== 1) {
        throw new BadRequestException(AUTH_ERROR_MESSAGES.invalidEmailToken);
      }

      const user = await tx.users.findUnique({
        where: { id: row.user_id },
        select: { email: true, email_verified_at: true },
      });

      if (!user || user.email !== row.email) {
        throw new BadRequestException(AUTH_ERROR_MESSAGES.invalidEmailToken);
      }

      if (!user.email_verified_at) {
        await tx.users.update({
          where: { id: row.user_id },
          data: { email_verified_at: now },
        });
      }
    });

    return { message: 'ยืนยันอีเมลสำเร็จ' };
  }

  // -------------------------------------------------------------- internals

  private async findUsableToken(token: string, purpose: EmailTokenPurpose) {
    const row = await this.prisma.email_tokens.findUnique({
      where: { token_hash: hashOneTimeToken(token) },
    });

    if (
      !row ||
      row.purpose !== purpose ||
      row.used_at !== null ||
      row.expires_at.getTime() <= Date.now()
    ) {
      throw new BadRequestException(AUTH_ERROR_MESSAGES.invalidEmailToken);
    }

    return row;
  }

  /**
   * null = ส่งได้ / ตัวเลข = ต้องรออีกกี่วินาที
   * นับจากแถว token ที่ออกไปใน 1 ชั่วโมงล่าสุด (อยู่ใน DB จึงทนหลาย instance และรีสตาร์ท)
   * เกินเพดานรายชั่วโมง → ให้รอจนแถวเก่าสุดในหน้าต่างหลุดออกไป
   */
  private async checkAllowance(
    userId: number,
    purpose: EmailTokenPurpose,
  ): Promise<number | null> {
    const now = Date.now();

    const recent = await this.prisma.email_tokens.findMany({
      where: {
        user_id: userId,
        purpose,
        created_at: { gte: new Date(now - HOUR_MS) },
      },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });

    const latest = recent[0];

    if (latest) {
      const cooldownLeft =
        latest.created_at.getTime() +
        EMAIL_FLOW.resendCooldownSeconds * 1000 -
        now;

      if (cooldownLeft > 0) return Math.ceil(cooldownLeft / 1000);
    }

    if (recent.length >= EMAIL_FLOW.maxEmailsPerAddressPerHour) {
      const oldest = recent[recent.length - 1];

      return Math.max(
        1,
        Math.ceil((oldest.created_at.getTime() + HOUR_MS - now) / 1000),
      );
    }

    return null;
  }

  /** ออก token ใหม่ (ยกเลิกใบเก่าที่ค้าง) แล้วส่งอีเมล — ไม่โยน error ทุกกรณี */
  private async issueAndSend(
    user: TokenRecipient,
    purpose: EmailTokenPurpose,
  ): Promise<IssueResult> {
    try {
      const baseUrl = resolveFrontendBaseUrl();

      if (!baseUrl) {
        // production ที่ไม่ได้ตั้ง FRONTEND_URL/CORS_ORIGINS — ไม่มีลิงก์ที่ถูกต้องให้ส่ง
        this.logger.warn(
          `Cannot build an email link for ${purpose}: FRONTEND_URL is not configured`,
        );

        return 'unavailable';
      }

      if ((await this.checkAllowance(user.id, purpose)) !== null) {
        return 'throttled';
      }

      const { token, tokenHash } = generateOneTimeToken();
      const isReset = purpose === EmailTokenPurpose.PASSWORD_RESET;
      const ttlMs = isReset
        ? EMAIL_FLOW.resetTtlMinutes * MINUTE_MS
        : EMAIL_FLOW.verifyTtlHours * HOUR_MS;
      const now = new Date();

      await this.prisma.$transaction([
        this.prisma.email_tokens.updateMany({
          where: { user_id: user.id, purpose, used_at: null },
          data: { used_at: now },
        }),
        this.prisma.email_tokens.create({
          data: {
            user_id: user.id,
            purpose,
            token_hash: tokenHash,
            email: user.email,
            expires_at: new Date(now.getTime() + ttlMs),
          },
        }),
      ]);

      const link = buildTokenLink(
        baseUrl,
        isReset ? 'ResetPassword' : 'VerifyEmail',
        token,
      );

      await this.mailer.send(
        isReset
          ? renderPasswordResetEmail({
              to: user.email,
              name: user.full_name,
              link,
              ttlMinutes: EMAIL_FLOW.resetTtlMinutes,
            })
          : renderVerifyEmail({
              to: user.email,
              name: user.full_name,
              link,
              ttlHours: EMAIL_FLOW.verifyTtlHours,
            }),
      );

      return 'sent';
    } catch {
      // ตั้งใจไม่ log ตัว error: ข้อความของ transport/DB อาจมีอีเมลผู้รับหรือเนื้อหาอีเมล
      this.logger.warn(`Failed to send ${purpose} email`);

      return 'failed';
    }
  }
}

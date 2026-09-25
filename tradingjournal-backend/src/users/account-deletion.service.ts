import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNT_DELETION } from './constants/users.constants';

export interface AccountPurgeSummary {
  purged: number;
  skippedActiveSubscription: number;
  failed: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ลบบัญชีแบบ soft delete + ช่วงผ่อนผัน (ACCOUNT_DELETION.graceDays วัน)
 *
 *   1. ผู้ใช้ขอลบ  -> ตั้ง users.deletion_scheduled_at = ตอนนี้ + graceDays และไล่ออกจากระบบทุกเครื่อง
 *   2. ล็อกอินก่อนถึงกำหนด -> AuthService.login ล้างค่านี้ (ยกเลิกการลบ)
 *   3. เลยกำหนด -> งานรายวันลบบัญชีจริง (hard delete) ตารางที่เป็นของผู้ใช้ทุกตัวเป็น
 *      ON DELETE CASCADE อยู่แล้ว จึงไม่ต้องไล่ลบทีละตาราง
 *
 * ไม่ยุ่งกับ Stripe: บัญชีที่ยังมีแพ็กเกจชำระเงินที่ยังไม่หมดอายุจะ "ขอลบไม่ได้" และงานรายวัน
 * จะ "ข้าม" ไม่ลบ ไม่งั้นจะเหลือการเรียกเก็บเงินค้างโดยไม่มีบัญชีให้ผูก
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);
  private purging = false;

  constructor(private readonly prisma: PrismaService) {}

  async requestDeletion(userId: number, password: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        stripe_subscription_id: true,
        deletion_scheduled_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException('ไม่พบบัญชีผู้ใช้');
    }

    // ตอบ 400 ไม่ใช่ 401 — หน้าบ้านมองทุก 401 ว่า token หมดอายุแล้วลอง refresh/ล็อกเอาต์
    // ซึ่งไม่ใช่สิ่งที่ควรเกิดตอนแค่พิมพ์รหัสผ่านผิด
    if (!(await bcrypt.compare(password, user.password))) {
      throw new BadRequestException('รหัสผ่านไม่ถูกต้อง');
    }

    // ขอซ้ำ = ไม่ขยับกำหนดเดิม (กันคนกดซ้ำแล้วกำหนดเลื่อนออกไปเรื่อย ๆ)
    if (user.deletion_scheduled_at) {
      return this.buildResult(user.deletion_scheduled_at);
    }

    if (await this.hasActiveStripeSubscription(user)) {
      throw new ConflictException(
        'บัญชีนี้ยังมีแพ็กเกจที่ชำระเงินและยังไม่หมดอายุ กรุณายกเลิกแพ็กเกจก่อนจึงจะลบบัญชีได้',
      );
    }

    const scheduledAt = new Date(
      Date.now() + ACCOUNT_DELETION.graceDays * DAY_MS,
    );

    await this.prisma.users.update({
      where: { id: userId },
      data: { deletion_scheduled_at: scheduledAt },
    });

    // ไล่ออกทุกเครื่อง (ไม่เก็บเครื่องนี้ไว้) — ใช้ prisma ตรง ๆ แทน RefreshTokenService
    // เพราะ service นั้นอยู่ใน AuthModule ซึ่งไม่ได้ export ให้ UsersModule
    // access token ที่ออกไปแล้วยังใช้ได้จนหมดอายุเอง (15 นาที) เหมือนตอนเปลี่ยนรหัสผ่าน
    await this.prisma.refresh_tokens.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    return this.buildResult(scheduledAt);
  }

  /**
   * งานรายวัน — ลบถาวรบัญชีที่เลยกำหนดแล้ว
   *
   * log เฉพาะ "จำนวน" ไม่ log id/อีเมล/ชื่อของใครเลย
   *
   * deleteMany ที่มีเงื่อนไข deletion_scheduled_at <= now ซ้ำอีกรอบ ทำให้ถ้าผู้ใช้ล็อกอิน
   * ยกเลิกการลบตัดหน้าระหว่างที่งานกำลังวิ่ง แถวนั้นจะไม่ถูกลบ (การล็อกอินชนะเสมอ)
   */
  @Cron('0 3 * * *')
  async purgeExpiredAccounts(): Promise<AccountPurgeSummary> {
    const summary: AccountPurgeSummary = {
      purged: 0,
      skippedActiveSubscription: 0,
      failed: 0,
    };

    if (this.purging) {
      this.logger.warn('Account purge skipped: previous run still in progress');
      return summary;
    }

    this.purging = true;

    try {
      const now = new Date();
      // ผู้ใช้ที่ถูกข้ามรอบนี้ (ยังมีแพ็กเกจ) ต้องไม่ถูกหยิบซ้ำในลูปเดียวกัน
      const skippedIds: number[] = [];

      for (;;) {
        const batch = await this.prisma.users.findMany({
          where: {
            deletion_scheduled_at: { lte: now },
            ...(skippedIds.length ? { id: { notIn: skippedIds } } : {}),
          },
          select: { id: true, stripe_subscription_id: true },
          orderBy: { id: 'asc' },
          take: ACCOUNT_DELETION.purgeBatchSize,
        });

        if (batch.length === 0) {
          break;
        }

        for (const candidate of batch) {
          if (await this.hasActiveStripeSubscription(candidate)) {
            skippedIds.push(candidate.id);
            summary.skippedActiveSubscription += 1;
            continue;
          }

          try {
            const result = await this.prisma.users.deleteMany({
              where: {
                id: candidate.id,
                deletion_scheduled_at: { lte: now },
              },
            });

            if (result.count > 0) {
              summary.purged += 1;
            }
          } catch {
            // ห้ามหยุดทั้งงานเพราะบัญชีเดียวลบไม่ได้ — นับไว้แล้วไปต่อ (ไม่ log ตัวตน)
            skippedIds.push(candidate.id);
            summary.failed += 1;
          }
        }
      }
    } finally {
      this.purging = false;
    }

    this.logger.log(
      `Account purge finished: purged=${summary.purged} skipped_active_subscription=${summary.skippedActiveSubscription} failed=${summary.failed}`,
    );

    return summary;
  }

  /**
   * มีแพ็กเกจที่ชำระผ่าน Stripe และยังไม่หมดอายุอยู่หรือไม่
   * (มี stripe_subscription_id และมีแถว subscriptions ที่ ACTIVE + end_date ยังไม่ถึง)
   */
  private async hasActiveStripeSubscription(user: {
    id: number;
    stripe_subscription_id: string | null;
  }): Promise<boolean> {
    if (!user.stripe_subscription_id) {
      return false;
    }

    const active = await this.prisma.subscriptions.findFirst({
      where: {
        user_id: user.id,
        status: 'ACTIVE',
        end_date: { gte: new Date() },
      },
      select: { id: true },
    });

    return active !== null;
  }

  private buildResult(scheduledAt: Date) {
    return {
      message: `ตั้งเวลาลบบัญชีแล้ว จะถูกลบถาวรใน ${ACCOUNT_DELETION.graceDays} วัน — ล็อกอินก่อนถึงกำหนดเพื่อยกเลิก`,
      deletion_scheduled_at: scheduledAt.toISOString(),
      grace_days: ACCOUNT_DELETION.graceDays,
    };
  }
}

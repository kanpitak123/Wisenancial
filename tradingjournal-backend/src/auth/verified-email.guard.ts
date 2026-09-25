import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_ERROR_MESSAGES } from './constants/auth.constants';

/**
 * ฟีเจอร์ AI ต้องยืนยันอีเมลก่อน (กันสมัครบัญชีทิ้งขว้างมาเผาโควตา AI)
 * บัญชีที่ยังไม่ยืนยันยังใช้ส่วนอื่นของแอปได้ตามปกติ — guard นี้ใส่เฉพาะ route ของ AI
 *
 * ต้องวางหลัง JwtAuthGuard (อ่าน request.user) อ่านสถานะจาก DB สดทุกครั้ง ไม่เชื่อ JWT
 * เพราะ access token อายุ 15 นาทีและถูกออกไปก่อนผู้ใช้กดยืนยัน
 *
 * ดีฟอลต์ "ปิด" — เปิดด้วย REQUIRE_VERIFIED_EMAIL_FOR_AI=true เฉพาะหลังตั้งผู้ให้บริการอีเมลจริงแล้ว
 * ไม่งั้นบน production (console transport ไม่ส่งอะไรเลย) ไม่มีใครได้รับลิงก์ยืนยัน
 * และผู้ใช้ใหม่จะใช้ AI ไม่ได้ทั้งระบบ
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI !== 'true') return true;

    const request = context.switchToHttp().getRequest<{
      user?: { userId?: number };
    }>();

    const userId = request.user?.userId;

    if (!userId) throw new ForbiddenException('ไม่พบข้อมูลผู้ใช้');

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { email_verified_at: true },
    });

    if (!user) throw new ForbiddenException('ไม่พบบัญชีผู้ใช้');

    if (!user.email_verified_at) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        // ให้หน้าบ้านแยกจาก 403 อื่น (เช่น ต้องเป็นสมาชิกแบบชำระเงิน) แล้วชี้ไปปุ่มยืนยันอีเมล
        code: 'EMAIL_NOT_VERIFIED',
        message: AUTH_ERROR_MESSAGES.emailNotVerified,
      });
    }

    return true;
  }
}

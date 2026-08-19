import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTH_CONSTANTS,
  AUTH_ERROR_MESSAGES,
} from './constants/auth.constants';
import { JwtRefreshPayload } from './types/auth-user.type';
import { parseExpiresInSeconds } from './utils/expires-in.util';

/** ข้อมูลอุปกรณ์ที่ขอ token ไว้ให้ผู้ใช้ดูย้อนหลังได้ว่ามีเครื่องไหนล็อกอินค้างอยู่ */
export interface RefreshTokenContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken {
  userId: number;
  refreshToken: IssuedRefreshToken;
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** อายุของ refresh token เป็นวินาที — ใช้ตั้ง maxAge ของ cookie ด้วย */
  get ttlSeconds(): number {
    return parseExpiresInSeconds(
      this.configService.get<string>('JWT_REFRESH_EXPIRES'),
      parseExpiresInSeconds(AUTH_CONSTANTS.defaultRefreshTokenExpiresIn, 0),
    );
  }

  /**
   * ออก refresh token ใบใหม่ + บันทึกลง DB
   *
   * ไม่ส่ง familyId มา = เริ่ม family ใหม่ (ล็อกอินครั้งใหม่)
   * ส่ง familyId มา = ต่อสายเดิม (rotate)
   */
  async issue(
    userId: number,
    context: RefreshTokenContext = {},
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const jti = randomUUID();
    const ttl = this.ttlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const payload: JwtRefreshPayload = { sub: userId, jti, fam: familyId };

    const token = await this.jwtService.signAsync(payload, {
      secret: this.refreshSecret,
      expiresIn: ttl,
    });

    await this.prisma.refresh_tokens.create({
      data: {
        user_id: userId,
        jti,
        token_hash: this.hash(token),
        family_id: familyId,
        expires_at: expiresAt,
        user_agent: context.userAgent?.slice(0, 255) ?? null,
        ip_address: context.ipAddress?.slice(0, 45) ?? null,
      },
    });

    return { token, expiresAt };
  }

  /**
   * ตรวจ token เดิม -> เผาทิ้ง -> ออกใบใหม่ในสายเดียวกัน (rotation)
   *
   * ถ้าเจอ token ที่ถูกใช้ไปแล้วหรือถูก revoke แล้วถูกนำมาใช้ซ้ำ = มีสำเนาหลุดออกไป
   * จะ revoke ทั้ง family ทิ้ง ทั้งของผู้ใช้จริงและของผู้ที่ขโมยไป แล้วบังคับล็อกอินใหม่
   */
  async rotate(
    rawToken: string,
    context: RefreshTokenContext = {},
  ): Promise<RotatedRefreshToken> {
    const payload = await this.verifySignature(rawToken);

    const record = await this.prisma.refresh_tokens.findUnique({
      where: { jti: payload.jti },
    });

    // ลายเซ็นถูกแต่หา row ไม่เจอ = ถูกล้างทิ้งไปแล้ว ใช้ต่อไม่ได้
    if (!record) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidRefreshToken);
    }

    if (record.revoked_at !== null || record.used_at !== null) {
      this.logger.warn(
        `Refresh token reuse detected (user_id=${record.user_id} family=${record.family_id}) — revoking whole family`,
      );

      await this.revokeFamily(record.family_id);

      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidRefreshToken);
    }

    // ลายเซ็นผ่านแต่ตัว token ไม่ตรงกับที่บันทึกไว้ = jti ถูกนำไปประกอบใหม่
    if (record.token_hash !== this.hash(rawToken)) {
      await this.revokeFamily(record.family_id);

      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidRefreshToken);
    }

    if (record.expires_at.getTime() <= Date.now()) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidRefreshToken);
    }

    const now = new Date();

    // อัปเดตแบบมีเงื่อนไขในคำสั่งเดียว กันสองคำขอที่ถือ token ใบเดียวกันมาพร้อมกัน
    // แล้วผ่านด่านข้างบนทั้งคู่ — ใครอัปเดตติดคนนั้นได้ token ใหม่ อีกคนตกไปเป็น reuse
    const claimed = await this.prisma.refresh_tokens.updateMany({
      where: { id: record.id, used_at: null, revoked_at: null },
      data: { used_at: now, revoked_at: now },
    });

    if (claimed.count === 0) {
      await this.revokeFamily(record.family_id);

      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidRefreshToken);
    }

    const refreshToken = await this.issue(
      record.user_id,
      context,
      record.family_id,
    );

    return { userId: record.user_id, refreshToken };
  }

  /**
   * ใช้ตอน logout — ยกเลิกทั้ง family ไม่ใช่แค่ใบปัจจุบัน
   * ไม่งั้นใบก่อนหน้าในสายเดียวกันที่ยังไม่ถูกใช้จะเอามาต่ออายุได้อยู่
   *
   * token ที่ส่งมาผิด/หมดอายุจะไม่ throw — logout ต้องสำเร็จเสมอในมุมของผู้ใช้
   */
  async revoke(rawToken: string): Promise<void> {
    let payload: JwtRefreshPayload;

    try {
      payload = await this.verifySignature(rawToken);
    } catch {
      return;
    }

    const record = await this.prisma.refresh_tokens.findUnique({
      where: { jti: payload.jti },
      select: { family_id: true },
    });

    if (!record) {
      return;
    }

    await this.revokeFamily(record.family_id);
  }

  /** ยกเลิก token ทุกใบในสาย rotation เดียวกันที่ยังไม่ถูกยกเลิก */
  async revokeFamily(familyId: string): Promise<number> {
    const result = await this.prisma.refresh_tokens.updateMany({
      where: { family_id: familyId, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    return result.count;
  }

  private async verifySignature(rawToken: string): Promise<JwtRefreshPayload> {
    let payload: JwtRefreshPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtRefreshPayload>(rawToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidRefreshToken);
    }

    if (!payload?.sub || !payload.jti || !payload.fam) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidRefreshToken);
    }

    return payload;
  }

  /**
   * เก็บเป็น SHA-256 ไม่ใช่ bcrypt เพราะต้องเทียบตรงๆ ทุกครั้งที่ refresh
   * และตัว token เป็น JWT ที่มี jti สุ่ม entropy สูงอยู่แล้ว ไม่ใช่รหัสผ่านที่คนตั้งเอง
   * จึงไม่ต้องพึ่ง slow hash เพื่อกัน brute force
   */
  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private get refreshSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');

    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is required');
    }

    return secret;
  }
}

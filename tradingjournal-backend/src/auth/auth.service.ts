import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, SubscriptionTier } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTH_CONSTANTS,
  AUTH_ERROR_MESSAGES,
} from './constants/auth.constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  RefreshTokenContext,
  RefreshTokenService,
} from './refresh-token.service';
import { JwtAccessPayload } from './types/auth-user.type';

interface PublicUserSource {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role?: Role;
  avatar_url?: string | null;
  bio?: string | null;
  subscription_tier?: SubscriptionTier | null;
  points_balance?: number;
  ai_token_balance?: number;
  current_streak?: number;
  longest_streak?: number;
  created_at?: Date | null;
}

interface AccessPayloadSource {
  id: number;
  email: string;
  username: string;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async register(data: RegisterDto) {
    const email = data.email.trim().toLowerCase();
    const username = data.username.trim();

    const existingUser = await this.prisma.users.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException(AUTH_ERROR_MESSAGES.accountAlreadyExists);
    }

    const hashedPassword = await bcrypt.hash(
      data.password,
      AUTH_CONSTANTS.bcryptSaltRounds,
    );

    const user = await this.prisma.users.create({
      data: {
        email,
        username,
        full_name: data.full_name.trim(),
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        username: true,
        full_name: true,
        role: true,
        avatar_url: true,
        bio: true,
        subscription_tier: true,
        points_balance: true,
        ai_token_balance: true,
        current_streak: true,
        longest_streak: true,
        created_at: true,
      },
    });

    return {
      message: 'สมัครสมาชิกสำเร็จ',
      user: this.toPublicUser(user),
    };
  }

  /**
   * คืน refresh_token ออกมาด้วยเพื่อให้ controller เอาไปตั้งเป็น httpOnly cookie
   * ตัว service ไม่ยุ่งกับ res โดยตรง จะได้เทสได้โดยไม่ต้อง mock express
   */
  async login(data: LoginDto, context: RefreshTokenContext = {}) {
    const email = data.email.trim().toLowerCase();

    const user = await this.prisma.users.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidCredentials);
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidCredentials);
    }

    const accessToken = await this.jwtService.signAsync(
      this.buildAccessPayload(user),
    );

    // ล็อกอินใหม่ = เริ่ม token family ใหม่ ไม่ต่อสายเดิม
    // (คนละอุปกรณ์/คนละ session จะได้ revoke แยกกันได้)
    const refreshToken = await this.refreshTokenService.issue(
      user.id,
      context,
    );

    return {
      message: 'ล็อกอินสำเร็จ',
      access_token: accessToken,
      refresh_token: refreshToken.token,
      user: this.toPublicUser(user),
    };
  }

  /**
   * ต่ออายุ session — คืนรูปแบบเดียวกับ login เป๊ะ หน้าบ้านจะได้เอาไปเข้า
   * setSession() ตัวเดิมได้เลยโดยไม่ต้องมี branch แยก
   *
   * อ่าน user จาก DB สดทุกครั้ง ไม่ได้ใช้ค่าใน payload ของ refresh token
   * เพราะ role/แพ็กเกจอาจเปลี่ยนไปแล้วระหว่างอายุ 30 วันของ token
   */
  async refresh(rawToken: string | undefined, context: RefreshTokenContext = {}) {
    if (!rawToken) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.missingRefreshToken);
    }

    const { userId, refreshToken } = await this.refreshTokenService.rotate(
      rawToken,
      context,
    );

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.userNotFound);
    }

    const accessToken = await this.jwtService.signAsync(
      this.buildAccessPayload(user),
    );

    return {
      message: 'ต่ออายุการเข้าใช้งานสำเร็จ',
      access_token: accessToken,
      refresh_token: refreshToken.token,
      user: this.toPublicUser(user),
    };
  }

  /**
   * ไม่มี refresh token ส่งมาก็ถือว่าสำเร็จ — ผู้ใช้ต้องออกจากระบบได้เสมอ
   * ไม่ว่า cookie จะหายไปแล้วหรือหมดอายุไปก่อน
   */
  async logout(rawToken: string | undefined) {
    if (rawToken) {
      await this.refreshTokenService.revoke(rawToken);
    }

    return { message: 'ออกจากระบบเรียบร้อย' };
  }

  async getCurrentUser(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        full_name: true,
        role: true,
        avatar_url: true,
        bio: true,
        subscription_tier: true,
        points_balance: true,
        ai_token_balance: true,
        current_streak: true,
        longest_streak: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.userNotFound);
    }

    return {
      user: this.toPublicUser(user),
    };
  }

  private buildAccessPayload(user: AccessPayloadSource): JwtAccessPayload {
    return {
      sub: user.id,
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };
  }

  private toPublicUser(user: PublicUserSource) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      display_name: user.full_name,
      role: user.role ?? Role.USER,
      avatar_url: user.avatar_url ?? null,
      bio: user.bio ?? null,
      subscription_tier: user.subscription_tier ?? null,
      points_balance: user.points_balance ?? 0,
      ai_token_balance: user.ai_token_balance ?? 0,
      current_streak: user.current_streak ?? 0,
      longest_streak: user.longest_streak ?? 0,
      created_at: user.created_at ?? null,
    };
  }
}

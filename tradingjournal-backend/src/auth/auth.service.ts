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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

  async login(data: LoginDto) {
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

    const payload: JwtAccessPayload = {
      sub: user.id,
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      message: 'ล็อกอินสำเร็จ',
      access_token: accessToken,
      user: this.toPublicUser(user),
    };
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

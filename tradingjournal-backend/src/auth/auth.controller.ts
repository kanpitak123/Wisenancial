import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AUTH_THROTTLE } from './constants/auth.constants';
import { EMAIL_FLOW } from './constants/email-flows.constants';
import { EmailFlowsService } from './email-flows.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenService } from './refresh-token.service';
import type { AuthUser } from './types/auth-user.type';
import {
  clearRefreshCookie,
  readRefreshCookie,
  readRequestContext,
  setRefreshCookie,
} from './utils/auth-cookie.util';

/**
 * เขียนทับเพดาน "default" ตัวเดียวกับที่ ThrottlerModule ตั้งไว้ ไม่ได้เพิ่ม throttler
 * ตัวที่สอง — ใน @nestjs/throttler v6 ถ้าประกาศ throttler หลายตัวตอน forRoot
 * ทุกตัวจะถูกบังคับใช้กับ "ทุก" route ไม่ใช่เฉพาะที่อ้างถึง ซึ่งจะลากเพดานเข้ม
 * ของ auth ไปครอบทั้งระบบโดยไม่ตั้งใจ
 */
const authThrottle = {
  default: { limit: AUTH_THROTTLE.limit, ttl: AUTH_THROTTLE.ttlMs },
};

/**
 * endpoint ที่ "ส่งอีเมลออกไปจริง" เข้มกว่า login: ทุกครั้งที่ผ่านเพดานคืออีเมลหนึ่งฉบับ
 * (เพดานต่ออีเมลอยู่ใน EmailFlowsService นับจาก DB แยกอีกชั้น)
 */
const emailFlowThrottle = {
  default: {
    limit: EMAIL_FLOW.ipThrottleLimit,
    ttl: EMAIL_FLOW.ipThrottleTtlMs,
  },
};

/** ข้อความเดียวกันทุกกรณี — ห้ามบอกใบ้ว่าอีเมลนี้มีบัญชีอยู่หรือไม่ */
const FORGOT_PASSWORD_RESPONSE = {
  message: 'หากอีเมลนี้มีบัญชีอยู่ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว',
};

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly emailFlows: EmailFlowsService,
  ) {}

  @Throttle(authThrottle)
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Throttle(authThrottle)
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { refresh_token, ...result } = await this.authService.login(
      body,
      readRequestContext(request),
    );

    this.issueRefreshCookie(response, refresh_token);

    return result;
  }

  /**
   * ไม่ต้องผ่าน JwtAuthGuard — จุดประสงค์ของ endpoint นี้คือใช้ตอน access token
   * หมดอายุไปแล้วพอดี ถ้าบังคับให้มี access token ที่ยังใช้ได้ก็ไม่มีประโยชน์อะไร
   * ตัวที่ยืนยันตัวตนคือ refresh token ใน httpOnly cookie
   */
  @Throttle(authThrottle)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { refresh_token, ...result } = await this.authService.refresh(
      readRefreshCookie(request),
      readRequestContext(request),
    );

    this.issueRefreshCookie(response, refresh_token);

    return result;
  }

  /**
   * ไม่ต้องผ่าน guard เช่นกัน — ผู้ใช้ที่ access token หมดอายุแล้วก็ต้องกดออกจาก
   * ระบบให้ refresh token ถูก revoke จริงได้ ไม่ใช่ค้างอยู่จนหมดอายุเอง 30 วัน
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logout(readRefreshCookie(request));

    clearRefreshCookie(response);

    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() user: AuthUser) {
    return this.authService.getCurrentUser(user.userId);
  }

  /**
   * อยู่ใต้ /auth (ไม่ใช่ /users/me/password) โดยตั้งใจ: refresh cookie ถูกจำกัด path ไว้ที่
   * /auth (ดู AUTH_CONSTANTS.refreshCookiePath) เบราว์เซอร์จึงแนบให้เฉพาะ endpoint ใต้
   * path นี้ — ต้องการ cookie ตัวนั้นเพื่อรู้ว่า "เครื่องนี้" คือสายไหนแล้วเก็บไว้
   * ตอนไล่เครื่องอื่นออก ไม่ต้องขยาย path ของ cookie ให้เห็น refresh token กว้างขึ้น
   *
   * เพดาน throttle เดียวกับ login — เป็นจุดเดารหัสผ่านปัจจุบันได้เหมือนกัน
   */
  @Throttle(authThrottle)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordDto,
    @Req() request: Request,
  ) {
    return this.authService.changePassword(
      user.userId,
      body,
      readRefreshCookie(request),
    );
  }

  /**
   * ตอบทันทีด้วยข้อความเดิมเสมอ โดยไม่รอผลการค้นหาบัญชี/การส่งอีเมล — เวลาตอบของอีเมลที่มี
   * กับไม่มีบัญชีจึงไม่ต่างกัน (ไม่เปิดทางให้เดาอีเมลจากความช้า) และไม่ผูกกับ session ใด ๆ
   */
  @Throttle(emailFlowThrottle)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() body: ForgotPasswordDto) {
    void this.emailFlows.requestPasswordReset(body.email).catch(() => {
      // ตั้งใจไม่ log ตัว error (อาจมีอีเมล) และไม่ให้ rejection ที่ไม่มีใครรับทำ process ล้ม
      this.logger.warn('Password reset request failed');
    });

    return FORGOT_PASSWORD_RESPONSE;
  }

  /** ไม่ต้องล็อกอิน — ผู้ใช้ลืมรหัสผ่านจึงไม่มี session ตัวยืนยันคือ token ในลิงก์ */
  @Throttle(authThrottle)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.emailFlows.resetPassword(body.token, body.new_password);
  }

  @Throttle(emailFlowThrottle)
  @Post('send-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  sendVerification(@CurrentUser() user: AuthUser) {
    return this.emailFlows.sendVerificationEmail(user.userId);
  }

  /** ไม่ต้องล็อกอิน — เปิดลิงก์จากมือถือ/เบราว์เซอร์อื่นได้ */
  @Throttle(authThrottle)
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.emailFlows.verifyEmail(body.token);
  }

  private issueRefreshCookie(response: Response, token: string): void {
    setRefreshCookie(response, token, this.refreshTokenService.ttlSeconds);
  }
}

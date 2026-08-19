import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

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

  private issueRefreshCookie(response: Response, token: string): void {
    setRefreshCookie(response, token, this.refreshTokenService.ttlSeconds);
  }
}

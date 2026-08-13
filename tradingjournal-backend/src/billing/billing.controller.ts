import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { BillingService } from './billing.service';
import { CreateBillingCheckoutDto } from './dto/create-billing-checkout.dto';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
  ) {}

  @Get('packages')
  getPackages() {
    return this.billing.getPackages();
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthUser,
    @Body()
    body: CreateBillingCheckoutDto,
  ) {
    return this.billing.createCheckoutSession(
      user.userId,
      body.packageId,
    );
  }
}

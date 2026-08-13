import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('create-checkout-session')
  createCheckoutSession(
    @CurrentUser() user: AuthUser,
    @Body()
    body: CreateCheckoutSessionDto,
  ) {
    return this.payments.createCheckoutSession(user.userId, body.planId);
  }

  @Post('webhook')
  handleWebhook(
    @Req()
    req: RawBodyRequest<ExpressRequest>,
    @Headers('stripe-signature')
    signature?: string,
  ) {
    return this.payments.handleWebhook(signature, req.rawBody);
  }
}

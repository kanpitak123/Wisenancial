import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SubscriptionTier } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string;

  constructor(private readonly prisma: PrismaService) {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    this.stripe = secretKey ? new Stripe(secretKey) : null;

    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY is not configured');
    }
  }

  async createCheckoutSession(userId: number, planId: SubscriptionTier) {
    const stripe = this.requireStripe();
    const priceId = this.resolvePriceId(planId);

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        stripe_customer_id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${this.frontendBaseUrl}/app/Upgrade?success=true`,
      cancel_url: `${this.frontendBaseUrl}/app/Upgrade?canceled=true`,
      client_reference_id: String(userId),
      metadata: {
        type: 'SUBSCRIPTION',
        userId: String(userId),
        planId,
      },
      subscription_data: {
        metadata: {
          type: 'SUBSCRIPTION',
          userId: String(userId),
          planId,
        },
      },
      ...(user.stripe_customer_id
        ? {
            customer: user.stripe_customer_id,
          }
        : {
            customer_email: user.email,
          }),
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL');
    }

    return {
      checkoutUrl: session.url,
      url: session.url,
      sessionId: session.id,
    };
  }

  async handleWebhook(
    signature: string | undefined,
    rawBody: Buffer | undefined,
  ) {
    const stripe = this.requireStripe();

    if (!this.webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not configured',
      );
    }

    if (!signature) {
      throw new BadRequestException('Missing Stripe signature header');
    }

    if (!rawBody) {
      throw new BadRequestException('Missing raw request body');
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      this.logger.error(
        'Stripe webhook verification failed',
        error instanceof Error ? error.stack : String(error),
      );

      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;
    }

    return {
      received: true,
      eventId: event.id,
    };
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const metadata = session.metadata ?? {};
    const userId = Number(metadata.userId ?? session.client_reference_id);

    if (!userId || Number.isNaN(userId)) {
      this.logger.warn(`Stripe session ${session.id} has no valid userId`);
      return;
    }

    if (metadata.type === 'AI_TOKEN_TOPUP') {
      await this.creditAiTokens(userId, session.id, Number(metadata.tokens));
      return;
    }

    if (metadata.type !== 'SUBSCRIPTION') {
      this.logger.warn(`Unknown checkout type for ${session.id}`);
      return;
    }

    const planId = this.parsePlan(metadata.planId);

    if (!planId) {
      this.logger.error(`Invalid subscription plan metadata for ${session.id}`);
      return;
    }

    const stripe_customer_id =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer?.id ?? null);

    const stripe_subscription_id =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription?.id ?? null);

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        subscription_tier: planId,
        ...(stripe_customer_id ? { stripe_customer_id } : {}),
        ...(stripe_subscription_id ? { stripe_subscription_id } : {}),
        updated_at: new Date(),
      },
    });
  }

  private async creditAiTokens(
    userId: number,
    stripeSessionId: string,
    tokens: number,
  ) {
    if (!Number.isInteger(tokens) || tokens <= 0) {
      this.logger.error(`Invalid AI token amount for ${stripeSessionId}`);
      return;
    }

    const description = `Stripe top-up ${stripeSessionId}`;

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.token_transactions.findFirst({
        where: {
          user_id: userId,
          type: 'PURCHASE',
          description,
        },
        select: { id: true },
      });

      if (existing) {
        return;
      }

      await tx.users.update({
        where: { id: userId },
        data: {
          ai_token_balance: {
            increment: tokens,
          },
          updated_at: new Date(),
        },
      });

      await tx.token_transactions.create({
        data: {
          user_id: userId,
          amount: tokens,
          type: 'PURCHASE',
          description,
        },
      });
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const userId = Number(subscription.metadata.userId);

    if (!userId || Number.isNaN(userId)) {
      return;
    }

    const planId = this.parsePlan(subscription.metadata.planId);

    const active =
      subscription.status === 'active' || subscription.status === 'trialing';

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        subscription_tier: active && planId ? planId : null,
        stripe_subscription_id: subscription.id,
        updated_at: new Date(),
      },
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const userId = Number(subscription.metadata.userId);

    if (!userId || Number.isNaN(userId)) {
      return;
    }

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        subscription_tier: null,
        stripe_subscription_id: null,
        updated_at: new Date(),
      },
    });
  }

  private parsePlan(value: unknown): SubscriptionTier | null {
    return typeof value === 'string' &&
      (Object.values(SubscriptionTier) as string[]).includes(value)
      ? (value as SubscriptionTier)
      : null;
  }

  private resolvePriceId(planId: SubscriptionTier) {
    const prices: Record<SubscriptionTier, string | undefined> = {
      [SubscriptionTier.PACK_159]: process.env.STRIPE_PACK_159_PRICE_ID,
      [SubscriptionTier.PACK_219]: process.env.STRIPE_PACK_219_PRICE_ID,
      [SubscriptionTier.PACK_279]: process.env.STRIPE_PACK_279_PRICE_ID,
      [SubscriptionTier.PACK_399]: process.env.STRIPE_PACK_399_PRICE_ID,
    };

    const priceId = prices[planId];

    if (!priceId) {
      throw new BadRequestException(
        `Stripe Price ID for ${planId} is not configured`,
      );
    }

    return priceId;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }

    return this.stripe;
  }

  private get frontendBaseUrl() {
    return (process.env.FRONTEND_URL ?? 'http://localhost:9000').replace(
      /\/$/,
      '',
    );
  }
}

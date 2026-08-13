import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { CREDIT_PACKAGES, type CreditPackage } from './credit-packages';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;

  constructor(private readonly prisma: PrismaService) {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    this.stripe = secretKey ? new Stripe(secretKey) : null;

    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY is not configured');
    }
  }

  getPackages() {
    return CREDIT_PACKAGES;
  }

  async createCheckoutSession(userId: number, packageId: string) {
    const stripe = this.requireStripe();
    const pkg = this.findPackage(packageId);

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
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'thb',
            product_data: {
              name: `${pkg.name} — ${pkg.tokens} AI Tokens`,
            },
            unit_amount: pkg.priceThb * 100,
          },
          quantity: 1,
        },
      ],
      success_url: `${this.frontendBaseUrl}/app/AiCredits?success=true`,
      cancel_url: `${this.frontendBaseUrl}/app/AiCredits?canceled=true`,
      client_reference_id: String(userId),
      metadata: {
        type: 'AI_TOKEN_TOPUP',
        userId: String(userId),
        packageId: pkg.id,
        tokens: String(pkg.tokens),
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

  private findPackage(packageId: string): CreditPackage {
    const normalized = packageId.trim().toUpperCase();

    const pkg = CREDIT_PACKAGES.find((item) => item.id === normalized);

    if (!pkg) {
      throw new BadRequestException(`Invalid package ID: "${packageId}"`);
    }

    return pkg;
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

import {
  IsEnum,
} from 'class-validator';
import { SubscriptionTier } from '@prisma/client';

export class CreateCheckoutSessionDto {
  @IsEnum(SubscriptionTier)
  planId!: SubscriptionTier;
}

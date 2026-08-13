import { api } from 'boot/axios';
import { PAYMENTS_API_PATH } from 'src/constants/billing.constants';
import type { CheckoutResponse, SubscriptionTier } from 'src/types/billing.types';

export const paymentsService = {
  async checkoutSubscription(planId: SubscriptionTier): Promise<CheckoutResponse> {
    const { data } = await api.post<CheckoutResponse>(
      `${PAYMENTS_API_PATH}/create-checkout-session`,
      {
        planId,
      },
    );

    return data;
  },
};

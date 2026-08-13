import type { AxiosError } from 'axios';
import { api } from 'boot/axios';
import { BILLING_API_PATH } from 'src/constants/billing.constants';
import type {
  ApiErrorResponse,
  CheckoutResponse,
  CreditPackage,
  CreditPackageId,
} from 'src/types/billing.types';

export function getBillingErrorMessage(
  error: unknown,
  fallback = 'เกิดข้อผิดพลาดในระบบ Billing',
): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.response?.data?.error ?? axiosError.message ?? fallback;
}

export const billingService = {
  async getPackages(): Promise<CreditPackage[]> {
    const { data } = await api.get<CreditPackage[]>(`${BILLING_API_PATH}/packages`);

    return data;
  },

  async checkoutCredits(packageId: CreditPackageId): Promise<CheckoutResponse> {
    const { data } = await api.post<CheckoutResponse>(`${BILLING_API_PATH}/checkout`, {
      packageId,
    });

    return data;
  },
};

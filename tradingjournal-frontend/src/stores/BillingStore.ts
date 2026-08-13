import { defineStore } from 'pinia';
import { BILLING_MESSAGES } from 'src/constants/billing.constants';
import { billingService, getBillingErrorMessage } from 'src/services/billing.service';
import { paymentsService } from 'src/services/payments.service';
import { useAiStore } from 'src/stores/AiStore';
import type { CreditPackage, CreditPackageId, SubscriptionTier } from 'src/types/billing.types';

export const useBillingStore = defineStore('billing', {
  state: () => ({
    packages: [] as CreditPackage[],

    loadedPackages: false,

    checkingOutCreditPackageId: null as CreditPackageId | null,

    checkingOutSubscriptionTier: null as SubscriptionTier | null,

    isLoadingPackages: false,

    error: null as string | null,
  }),

  getters: {
    popularPackage(state): CreditPackage | null {
      return state.packages.find((pkg) => pkg.popular === true) ?? null;
    },

    isCheckingOut(state): boolean {
      return (
        state.checkingOutCreditPackageId !== null || state.checkingOutSubscriptionTier !== null
      );
    },
  },

  actions: {
    clearError() {
      this.error = null;
    },

    async fetchPackages(force = false) {
      if ((!force && this.loadedPackages) || this.isLoadingPackages) {
        return this.packages;
      }

      this.isLoadingPackages = true;
      this.error = null;

      try {
        const packages = await billingService.getPackages();

        this.packages = packages;
        this.loadedPackages = true;

        return packages;
      } catch (error) {
        this.error = getBillingErrorMessage(error, BILLING_MESSAGES.packagesFailed);
        throw error;
      } finally {
        this.isLoadingPackages = false;
      }
    },

    async checkoutCredits(packageId: CreditPackageId): Promise<string> {
      if (this.checkingOutCreditPackageId) {
        throw new Error('กำลังสร้าง Checkout อยู่');
      }

      this.checkingOutCreditPackageId = packageId;
      this.error = null;

      try {
        const result = await billingService.checkoutCredits(packageId);

        return result.checkoutUrl ?? result.url;
      } catch (error) {
        this.error = getBillingErrorMessage(error, BILLING_MESSAGES.creditCheckoutFailed);
        throw error;
      } finally {
        this.checkingOutCreditPackageId = null;
      }
    },

    async checkoutSubscription(planId: SubscriptionTier): Promise<string> {
      if (this.checkingOutSubscriptionTier) {
        throw new Error('กำลังสร้าง Checkout อยู่');
      }

      this.checkingOutSubscriptionTier = planId;
      this.error = null;

      try {
        const result = await paymentsService.checkoutSubscription(planId);

        return result.checkoutUrl ?? result.url;
      } catch (error) {
        this.error = getBillingErrorMessage(error, BILLING_MESSAGES.subscriptionCheckoutFailed);
        throw error;
      } finally {
        this.checkingOutSubscriptionTier = null;
      }
    },

    openCheckout(checkoutUrl: string) {
      window.location.href = checkoutUrl;
    },

    async handleCreditCheckoutReturn(success: boolean) {
      if (!success) {
        return null;
      }

      const aiStore = useAiStore();

      return aiStore.refreshCredits();
    },

    clear() {
      this.packages = [];
      this.loadedPackages = false;
      this.checkingOutCreditPackageId = null;
      this.checkingOutSubscriptionTier = null;
      this.isLoadingPackages = false;
      this.error = null;
    },
  },
});

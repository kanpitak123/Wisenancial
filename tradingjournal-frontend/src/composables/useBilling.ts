import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useBillingStore } from 'src/stores/BillingStore';

export function useBilling() {
  const store = useBillingStore();

  const {
    packages,
    loadedPackages,
    checkingOutCreditPackageId,
    checkingOutSubscriptionTier,
    isLoadingPackages,
    error,
  } = storeToRefs(store);

  const popularPackage = computed(() => store.popularPackage);

  const isCheckingOut = computed(() => store.isCheckingOut);

  return {
    packages,
    loadedPackages,
    checkingOutCreditPackageId,
    checkingOutSubscriptionTier,
    isLoadingPackages,
    error,

    popularPackage,
    isCheckingOut,

    fetchPackages: (...args: Parameters<typeof store.fetchPackages>) =>
      store.fetchPackages(...args),
    checkoutCredits: (...args: Parameters<typeof store.checkoutCredits>) =>
      store.checkoutCredits(...args),
    checkoutSubscription: (...args: Parameters<typeof store.checkoutSubscription>) =>
      store.checkoutSubscription(...args),
    openCheckout: (...args: Parameters<typeof store.openCheckout>) => store.openCheckout(...args),
    handleCreditCheckoutReturn: (...args: Parameters<typeof store.handleCreditCheckoutReturn>) =>
      store.handleCreditCheckoutReturn(...args),
    clearError: () => store.clearError(),
    clear: () => store.clear(),
  };
}

import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useDividendStore } from '../stores/DividendStore';
import type { CreateDividendPayload, UpdateDividendPayload } from '../types/dividend.types';

export function useDividends() {
  const store = useDividendStore();

  const { items, summary, selectedYear, portfolioId, isLoading, isSubmitting, error } =
    storeToRefs(store);

  const activeItems = computed(() => store.activeItems);

  const totalNetAmount = computed(() => store.totalNetAmount);

  const totalTaxWithheld = computed(() => store.totalTaxWithheld);

  const totalGrossAmount = computed(() => store.totalGrossAmount);

  return {
    items,
    summary,
    selectedYear,
    portfolioId,
    isLoading,
    isSubmitting,
    error,

    activeItems,
    totalNetAmount,
    totalTaxWithheld,
    totalGrossAmount,

    load: (...args: Parameters<typeof store.load>) => store.load(...args),
    refresh: () => store.refresh(),
    create: (payload: CreateDividendPayload) => store.create(payload),
    update: (id: number, payload: UpdateDividendPayload) => store.update(id, payload),
    remove: (id: number) => store.remove(id),
    clearError: () => store.clearError(),
    clear: () => store.clear(),
  };
}

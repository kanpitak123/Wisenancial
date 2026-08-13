import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useRecordStore } from '../stores/RecordStore';
import type {
  CreateManualRecordPayload,
  CreateTransferPayload,
  RecordsQuery,
} from '../types/records.types';

export function useRecords() {
  const store = useRecordStore();

  const { records, summary, portfolioId, filters, isLoading, isSubmitting, error } =
    storeToRefs(store);

  const activeRecords = computed(() => store.activeRecords);

  const reversedRecords = computed(() => store.reversedRecords);

  const manualRecords = computed(() => store.manualRecords);

  const cashIn = computed(() => store.cashIn);

  const cashOut = computed(() => store.cashOut);

  const load = (id: number, query: Partial<RecordsQuery> = {}) => store.load(id, query);

  const createManual = (payload: CreateManualRecordPayload, id?: number) =>
    store.createManual(payload, id ?? null);

  const transfer = (payload: CreateTransferPayload) => store.transfer(payload);

  const reverse = (recordId: number, reason?: string) => store.reverse(recordId, reason);

  const rebuildBalance = (id?: number) => store.rebuildBalance(id ?? null);

  return {
    records,
    summary,
    portfolioId,
    filters,
    isLoading,
    isSubmitting,
    error,

    activeRecords,
    reversedRecords,
    manualRecords,
    cashIn,
    cashOut,

    load,
    refresh: () => store.refresh(),
    createManual,
    transfer,
    reverse,
    rebuildBalance,
    setFilters: (filters: Partial<RecordsQuery>) => store.setFilters(filters),
    resetFilters: () => store.resetFilters(),
    clearError: () => store.clearError(),
    clear: () => store.clear(),
  };
}

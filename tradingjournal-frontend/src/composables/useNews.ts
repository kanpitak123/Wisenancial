import { computed, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useNewsStore } from '../stores/NewsStore';
import type {
  FetchNewsOptions,
  NewsFilters,
  NewsLanguage,
  NewsScope,
  UnifiedNewsItem,
} from '../types/news.types';

export function useNews() {
  const store = useNewsStore();

  const { scope, language, news, filteredNews, filters, pagination, isLoading, isPinning, error } =
    storeToRefs(store);

  const hasNews = computed(() => filteredNews.value.length > 0);

  const canLoadMore = computed(() => store.canLoadMore);

  async function initialize(options: FetchNewsOptions = {}) {
    store.connectSocket();

    return store.fetchNews(options);
  }

  async function changeScope(value: NewsScope) {
    store.setScope(value);

    return store.fetchNews({
      scope: value,
      page: 1,
    });
  }

  async function changeLanguage(value: NewsLanguage) {
    store.setLanguage(value);

    return store.refresh();
  }

  function updateFilters(value: Partial<NewsFilters>) {
    store.setFilters(value);
  }

  async function applyFilters(value: Partial<NewsFilters>) {
    store.setFilters(value);

    return store.refresh();
  }

  async function togglePin(item: UnifiedNewsItem) {
    return store.togglePin(item);
  }

  onBeforeUnmount(() => {
    store.disconnectSocket();
  });

  return {
    scope,
    language,
    news,
    displayedNews: filteredNews,
    filters,
    pagination,
    isLoading,
    isPinning,
    error,
    hasNews,
    canLoadMore,

    initialize,
    changeScope,
    changeLanguage,
    updateFilters,
    applyFilters,
    togglePin,
    clearFilters: () => store.clearFilters(),
    refresh: () => store.refresh(),
    loadMore: () => store.loadMore(),
    clear: () => store.clear(),
  };
}

import { defineStore } from 'pinia';
import {
  createDefaultNewsFilters,
  createDefaultNewsPagination,
  DEFAULT_NEWS_LANGUAGE,
  DEFAULT_NEWS_PAGE_SIZE,
  NEWS_MESSAGES,
} from '../constants/news.constants';
import { getNewsErrorMessage, newsService } from '../services/news.service';
import { newsSocketService } from '../services/news-socket.service';
import { isMockEnabled } from 'src/mocks/mock.config';
import type {
  FetchNewsOptions,
  NewsFilters,
  NewsItemScope,
  NewsLanguage,
  NewsQuery,
  NewsScope,
  UnifiedNewsItem,
} from '../types/news.types';

function sortNews(items: UnifiedNewsItem[]) {
  return [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }

    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

function mergeNews(current: UnifiedNewsItem[], incoming: UnifiedNewsItem[]) {
  const map = new Map<string, UnifiedNewsItem>();

  for (const item of [...current, ...incoming]) {
    map.set(item.id, {
      ...(map.get(item.id) ?? {}),
      ...item,
    } as UnifiedNewsItem);
  }

  return sortNews([...map.values()]);
}

export const useNewsStore = defineStore('news', {
  state: () => ({
    scope: 'ALL' as NewsScope,
    language: DEFAULT_NEWS_LANGUAGE as NewsLanguage,
    news: [] as UnifiedNewsItem[],
    filters: createDefaultNewsFilters(),
    pagination: createDefaultNewsPagination(),
    isLoading: false,
    isPinning: [] as string[],
    error: null as string | null,
    socketConnected: false,
  }),

  getters: {
    traderNews: (state) => state.news.filter((item) => item.scope === 'TRADER'),

    investorNews: (state) => state.news.filter((item) => item.scope === 'INVESTOR'),

    pinnedNews: (state) => state.news.filter((item) => item.isPinned),

    filteredNews(state) {
      const search = state.filters.search.trim().toLowerCase();

      const importance = state.filters.importance.trim().toUpperCase();

      return sortNews(
        state.news.filter((item) => {
          // search and importance are intentionally client-side because
          // the current backend DTO does not expose those query params.
          if (importance && importance !== 'ALL' && item.importance !== importance) {
            return false;
          }

          if (!search) {
            return true;
          }

          const haystack = [
            item.title,
            item.summary,
            item.aiSummary,
            item.source,
            item.country,
            item.sector,
            ...item.relatedSymbols,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(search);
        }),
      );
    },

    canLoadMore: (state) => state.pagination.hasNext && !state.isLoading,
  },

  actions: {
    clearError() {
      this.error = null;
    },

    setScope(scope: NewsScope) {
      this.scope = scope;
      this.pagination = createDefaultNewsPagination(this.pagination.limit);
    },

    setLanguage(language: NewsLanguage) {
      this.language = language;
      this.pagination = createDefaultNewsPagination(this.pagination.limit);
    },

    setFilters(filters: Partial<NewsFilters>) {
      this.filters = {
        ...this.filters,
        ...filters,
      };

      this.pagination = createDefaultNewsPagination(this.pagination.limit);
    },

    clearFilters() {
      this.filters = createDefaultNewsFilters();
      this.pagination = createDefaultNewsPagination(this.pagination.limit);
    },

    buildServerQuery(options: FetchNewsOptions): NewsQuery {
      const scope = options.scope ?? this.scope;

      return {
        scope,
        page: options.page ?? 1,
        limit: options.limit ?? this.pagination.limit ?? DEFAULT_NEWS_PAGE_SIZE,
        language: options.language ?? this.language,
        ...(scope !== 'INVESTOR' && this.filters.country
          ? {
              country: this.filters.country,
            }
          : {}),
        ...(scope !== 'INVESTOR' && this.filters.impact
          ? {
              impact: this.filters.impact,
            }
          : {}),
        ...(scope !== 'TRADER' && this.filters.sector !== 'all'
          ? {
              sector: this.filters.sector,
            }
          : {}),
        ...(this.filters.sentiment !== 'all'
          ? {
              sentiment: this.filters.sentiment,
            }
          : {}),
        ...(this.filters.symbol
          ? {
              symbol: this.filters.symbol,
            }
          : {}),
      };
    },

    async fetchNews(options: FetchNewsOptions = {}) {
      const append = options.append ?? false;

      this.isLoading = true;
      this.error = null;

      try {
        const query = this.buildServerQuery(options);

        const response = await newsService.getNews(query);

        this.scope = response.scope;
        this.language = query.language ?? this.language;

        this.news =
          append && response.pagination.page > 1
            ? mergeNews(this.news, response.data)
            : sortNews(response.data);

        this.pagination = response.pagination;

        return this.news;
      } catch (error) {
        this.error = getNewsErrorMessage(error, NEWS_MESSAGES.loadFailed);

        if (!append) {
          this.news = [];
        }

        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    fetchTraderNews(options: Omit<FetchNewsOptions, 'scope'> = {}) {
      return this.fetchNews({
        ...options,
        scope: 'TRADER',
      });
    },

    fetchInvestorNews(options: Omit<FetchNewsOptions, 'scope'> = {}) {
      return this.fetchNews({
        ...options,
        scope: 'INVESTOR',
      });
    },

    fetchAllNews(options: Omit<FetchNewsOptions, 'scope'> = {}) {
      return this.fetchNews({
        ...options,
        scope: 'ALL',
      });
    },

    async refresh() {
      return this.fetchNews({
        scope: this.scope,
        page: 1,
        limit: this.pagination.limit,
      });
    },

    async loadMore() {
      if (this.isLoading || !this.pagination.hasNext) {
        return this.news;
      }

      return this.fetchNews({
        scope: this.scope,
        page: this.pagination.page + 1,
        limit: this.pagination.limit,
        append: true,
      });
    },

    async togglePin(item: UnifiedNewsItem) {
      if (this.isPinning.includes(item.id)) {
        return item.isPinned;
      }

      this.isPinning.push(item.id);
      this.error = null;

      try {
        const pinned = await newsService.togglePin(item.scope, item.sourceId);

        this.patchNews(item.id, {
          isPinned: pinned,
        });

        return pinned;
      } catch (error) {
        this.error = getNewsErrorMessage(error, NEWS_MESSAGES.pinFailed);
        throw error;
      } finally {
        this.isPinning = this.isPinning.filter((id) => id !== item.id);
      }
    },

    patchNews(id: string, partial: Partial<UnifiedNewsItem>) {
      this.news = sortNews(
        this.news.map((item) =>
          item.id === id
            ? {
                ...item,
                ...partial,
              }
            : item,
        ),
      );
    },

    upsertRealtimeNews(payload: { scope: NewsItemScope; data: unknown }) {
      // Gateway emits raw database rows, while GET /news returns unified
      // items. We refresh the canonical feed rather than guessing mappings.
      if (this.scope !== 'ALL' && payload.scope !== this.scope) {
        return;
      }

      void this.refresh();
    },

    connectSocket() {
      if (this.socketConnected) {
        return;
      }

      // mock mode ไม่มี backend ให้ต่อ — ข้ามไปเลย ไม่งั้น console จะเต็มไปด้วย connect error
      if (isMockEnabled()) {
        return;
      }

      newsSocketService.connect({
        onCreated: (payload) => this.upsertRealtimeNews(payload),
        onDataChanged: (payload) => this.upsertRealtimeNews(payload),
        onAiEnriched: (payload) => this.upsertRealtimeNews(payload),
      });

      this.socketConnected = true;
    },

    disconnectSocket() {
      newsSocketService.disconnect();
      this.socketConnected = false;
    },

    clear() {
      this.disconnectSocket();
      this.scope = 'ALL';
      this.language = DEFAULT_NEWS_LANGUAGE;
      this.news = [];
      this.filters = createDefaultNewsFilters();
      this.pagination = createDefaultNewsPagination();
      this.isLoading = false;
      this.isPinning = [];
      this.error = null;
    },
  },
});

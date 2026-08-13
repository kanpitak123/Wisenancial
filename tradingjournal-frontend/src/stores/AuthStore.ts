import { defineStore } from 'pinia';
import { AUTH_STORAGE_KEYS } from 'src/constants/auth.constants';
import { authApi } from 'src/services/auth.api';
import type { AuthUser, LoginPayload, RegisterPayload } from 'src/types/auth.types';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
}

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEYS.user);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEYS.user);
    return null;
  }
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: readStoredUser(),
    accessToken: localStorage.getItem(AUTH_STORAGE_KEYS.accessToken),
    loading: false,
    initialized: false,
    error: null,
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.user && state.accessToken),

    isPaidUser: (state) => state.user?.subscription_tier !== null,

    aiTokenBalance: (state) => state.user?.ai_token_balance ?? 0,

    pointsBalance: (state) => state.user?.points_balance ?? 0,
  },

  actions: {
    clearError() {
      this.error = null;
    },

    async login(email: string, password: string) {
      this.loading = true;
      this.error = null;

      try {
        const payload: LoginPayload = {
          email,
          password,
        };

        const data = await authApi.login(payload);

        this.setSession(data.access_token, data.user);

        return data.user;
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async register(payload: RegisterPayload) {
      this.loading = true;
      this.error = null;

      try {
        return await authApi.register(payload);
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'สมัครสมาชิกไม่สำเร็จ';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async initialize(force = false) {
      if (this.initialized && !force) {
        return this.user;
      }

      this.initialized = true;

      if (!this.accessToken) {
        this.clearSession();
        return null;
      }

      try {
        const { user } = await authApi.getMe(this.accessToken);

        this.setSession(this.accessToken, user);

        return user;
      } catch {
        this.clearSession();
        return null;
      }
    },

    async refreshCurrentUser() {
      if (!this.accessToken) {
        this.clearSession();
        return null;
      }

      const { user } = await authApi.getMe(this.accessToken);

      this.patchUser(user);

      return user;
    },

    logout() {
      this.clearSession();
    },

    setSession(accessToken: string, user: AuthUser) {
      this.accessToken = accessToken;
      this.user = user;

      localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, accessToken);

      this.persistUser();
    },

    patchUser(partial: Partial<AuthUser>) {
      if (!this.user) {
        return;
      }

      this.user = {
        ...this.user,
        ...partial,
      };

      this.persistUser();
    },

    setAiCredits(balance: number) {
      this.patchUser({
        ai_token_balance: Math.max(0, Math.trunc(balance)),
      });
    },

    setPointsBalance(balance: number) {
      this.patchUser({
        points_balance: Math.max(0, Math.trunc(balance)),
      });
    },

    persistUser() {
      if (!this.user) {
        localStorage.removeItem(AUTH_STORAGE_KEYS.user);
        return;
      }

      localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(this.user));
    },

    clearSession() {
      this.user = null;
      this.accessToken = null;

      localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);

      localStorage.removeItem(AUTH_STORAGE_KEYS.user);
    },
  },
});

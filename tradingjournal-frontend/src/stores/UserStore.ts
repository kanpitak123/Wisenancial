import { defineStore } from 'pinia';
import { USER_MESSAGES } from 'src/constants/user.constants';
import { getUserErrorMessage, userService } from 'src/services/user.service';
import { useAuthStore } from 'src/stores/AuthStore';
import type { UpdateUserPayload, UserProfile } from 'src/types/user.types';

export const useUserStore = defineStore('user', {
  state: () => ({
    profile: null as UserProfile | null,
    loading: false,
    updating: false,
    error: null as string | null,
  }),

  getters: {
    displayName: (state): string => state.profile?.full_name || state.profile?.username || 'User',

    initials: (state): string => {
      const name = state.profile?.full_name || state.profile?.username || 'U';

      return name
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word[0] ?? '')
        .join('')
        .toUpperCase()
        .slice(0, 2);
    },

    planName: (state): string =>
      state.profile?.plan?.name ??
      (state.profile?.subscription_tier ? state.profile.subscription_tier : 'Free'),

    planColor(): string {
      return this.isPaidUser ? 'amber-8' : 'grey-7';
    },

    isPlanActive: (state): boolean => {
      if (state.profile?.subscription_tier) {
        return true;
      }

      const plan = state.profile?.plan;

      if (!plan) {
        return false;
      }

      return plan.status === 'ACTIVE' && new Date(plan.end_date).getTime() > Date.now();
    },

    isPaidUser: (state): boolean =>
      Boolean(state.profile?.subscription_tier || state.profile?.plan),
  },

  actions: {
    clearError() {
      this.error = null;
    },

    async fetchProfile() {
      this.loading = true;
      this.error = null;

      try {
        const profile = await userService.getMe();

        this.profile = profile;

        this.syncAuthStore(profile);

        return profile;
      } catch (error) {
        this.error = getUserErrorMessage(error, USER_MESSAGES.loadFailed);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async updateProfile(payload: UpdateUserPayload) {
      this.updating = true;
      this.error = null;

      try {
        await userService.updateMe(payload);

        return await this.fetchProfile();
      } catch (error) {
        this.error = getUserErrorMessage(error, USER_MESSAGES.updateFailed);
        throw error;
      } finally {
        this.updating = false;
      }
    },

    async removeAvatar() {
      this.updating = true;
      this.error = null;

      try {
        await userService.removeAvatar();

        if (this.profile) {
          this.profile = {
            ...this.profile,
            avatar_url: null,
          };
        }

        useAuthStore().patchUser({
          avatar_url: null,
        });
      } catch (error) {
        this.error = getUserErrorMessage(error, USER_MESSAGES.removeAvatarFailed);
        throw error;
      } finally {
        this.updating = false;
      }
    },

    syncAuthStore(profile: UserProfile) {
      useAuthStore().patchUser({
        id: profile.id,
        email: profile.email,
        username: profile.username,
        display_name: profile.full_name,
        role: profile.role,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        subscription_tier: profile.subscription_tier,
        points_balance: profile.points_balance,
        ai_token_balance: profile.ai_token_balance,
        current_streak: profile.current_streak,
        longest_streak: profile.longest_streak,
        created_at: profile.created_at,
      });
    },

    clear() {
      this.profile = null;
      this.loading = false;
      this.updating = false;
      this.error = null;
    },
  },
});

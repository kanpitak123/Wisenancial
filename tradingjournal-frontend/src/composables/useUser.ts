import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from 'src/stores/AuthStore';
import { useUserStore } from 'src/stores/UserStore';

export function useUser() {
  const authStore = useAuthStore();
  const userStore = useUserStore();

  const { profile, loading, updating, error } = storeToRefs(userStore);

  const displayName = computed(() => userStore.displayName);

  const initials = computed(() => userStore.initials);

  const planName = computed(() => userStore.planName);

  const isPlanActive = computed(() => userStore.isPlanActive);

  const isPaidUser = computed(() => userStore.isPaidUser);

  const aiTokenBalance = computed(() => authStore.aiTokenBalance);

  const pointsBalance = computed(() => authStore.pointsBalance);

  return {
    profile,
    loading,
    updating,
    error,

    displayName,
    initials,
    planName,
    isPlanActive,
    isPaidUser,
    aiTokenBalance,
    pointsBalance,

    fetchProfile: (...args: Parameters<typeof userStore.fetchProfile>) =>
      userStore.fetchProfile(...args),
    updateProfile: (...args: Parameters<typeof userStore.updateProfile>) =>
      userStore.updateProfile(...args),
    removeAvatar: (...args: Parameters<typeof userStore.removeAvatar>) =>
      userStore.removeAvatar(...args),
    refreshAuthUser: (...args: Parameters<typeof authStore.refreshCurrentUser>) =>
      authStore.refreshCurrentUser(...args),
    clearError: () => userStore.clearError(),
    clear: () => userStore.clear(),
  };
}

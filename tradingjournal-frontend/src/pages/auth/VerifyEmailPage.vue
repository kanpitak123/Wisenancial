<template>
  <AuthCard :title="t('ยืนยันอีเมล', 'Verify your email')">
    <div class="text-center">
      <template v-if="state === 'loading'">
        <q-spinner-dots size="40px" color="primary" data-test="verify-loading" />
        <p class="q-mt-md">{{ t('กำลังยืนยันอีเมล...', 'Verifying your email...') }}</p>
      </template>

      <template v-else-if="state === 'success'">
        <q-icon name="check_circle" size="48px" color="positive" class="q-mb-md" />
        <p class="q-mb-md" data-test="verify-success">
          {{ t('ยืนยันอีเมลสำเร็จ ขอบคุณ!', 'Your email is verified. Thank you!') }}
        </p>
        <q-btn
          unelevated
          rounded
          color="primary"
          :to="auth.isAuthenticated ? '/Dashboard' : '/Login'"
          :label="auth.isAuthenticated ? t('ไปที่แดชบอร์ด', 'Go to dashboard') : t('เข้าสู่ระบบ', 'Log in')"
        />
      </template>

      <template v-else>
        <q-icon name="error_outline" size="48px" color="negative" class="q-mb-md" />
        <p class="q-mb-md" data-test="verify-error">
          {{ message }}
        </p>
        <p class="dash-text-muted q-mb-md">
          {{
            auth.isAuthenticated
              ? t('กดปุ่ม "ส่งอีเมลยืนยันอีกครั้ง" ที่แบนเนอร์ด้านบนของแอปเพื่อขอลิงก์ใหม่', 'Use the "Resend email" button in the banner at the top of the app to get a new link.')
              : t('เข้าสู่ระบบแล้วขอลิงก์ยืนยันใหม่ได้จากแบนเนอร์ด้านบนของแอป', 'Log in and request a new link from the banner at the top of the app.')
          }}
        </p>
        <q-btn
          flat
          rounded
          color="primary"
          :to="auth.isAuthenticated ? '/Dashboard' : '/Login'"
          :label="auth.isAuthenticated ? t('ไปที่แดชบอร์ด', 'Go to dashboard') : t('เข้าสู่ระบบ', 'Log in')"
        />
      </template>
    </div>
  </AuthCard>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AuthCard from 'components/AuthCard.vue';
import { useAuthStore } from 'stores/AuthStore';
import { useLanguageStore } from 'stores/LanguageStore';
import { useUserStore } from 'stores/UserStore';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const userStore = useUserStore();
const languageStore = useLanguageStore();
const t = (th: string, en: string) => (languageStore.isThai ? th : en);

const state = ref<'loading' | 'success' | 'error'>('loading');
const message = ref('');

onMounted(async () => {
  const raw = route.query.token;
  const token = typeof raw === 'string' ? raw : '';

  // เอา token ออกจาก URL ทันที ไม่ให้ค้างในประวัติเบราว์เซอร์
  if (raw !== undefined) {
    void router.replace({ path: route.path, query: {} });
  }

  if (!token) {
    state.value = 'error';
    message.value = t('ลิงก์ยืนยันไม่ถูกต้อง', 'This verification link is not valid.');
    return;
  }

  try {
    await auth.verifyEmail(token);
    state.value = 'success';

    // ล็อกอินอยู่ในเครื่องนี้ — โหลดโปรไฟล์ใหม่ให้แบนเนอร์ "ยังไม่ยืนยัน" หายไปทันที
    if (auth.isAuthenticated) {
      await userStore.fetchProfile().catch(() => undefined);
    }
  } catch (e: unknown) {
    state.value = 'error';
    message.value =
      e instanceof Error ? e.message : t('ยืนยันอีเมลไม่สำเร็จ', 'Could not verify your email.');
  }
});
</script>

<style scoped>
.dash-text-muted {
  color: var(--text-muted, #64748b);
}
</style>

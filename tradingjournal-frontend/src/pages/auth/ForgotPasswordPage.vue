<template>
  <AuthCard
    :title="t('ลืมรหัสผ่าน', 'Forgot your password?')"
    :subtitle="
      sent ? '' : t('กรอกอีเมลของคุณ แล้วเราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้', 'Enter your email and we will send you a link to set a new one.')
    "
  >
    <!-- ข้อความหลังส่งเป็นข้อความเดียวกันเสมอ ไม่ว่าอีเมลนั้นจะมีบัญชีหรือไม่ -->
    <div v-if="sent" class="text-center" data-test="forgot-sent">
      <q-icon name="mark_email_read" size="48px" color="positive" class="q-mb-md" />
      <p class="q-mb-md">
        {{
          t(
            'หากอีเมลนี้มีบัญชีอยู่ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว ลิงก์ใช้ได้ 30 นาที ใช้ได้ครั้งเดียว',
            'If an account exists for this email, we have sent a link to set a new password. The link is valid for 30 minutes and can be used once.',
          )
        }}
      </p>
      <router-link to="/Login" class="auth-link text-weight-bold">
        {{ t('กลับไปหน้าเข้าสู่ระบบ', 'Back to log in') }}
      </router-link>
    </div>

    <q-form v-else class="q-gutter-y-md" @submit.prevent="submit">
      <q-input
        v-model="email"
        type="email"
        outlined
        dense
        autocomplete="email"
        :label="t('อีเมล', 'Email')"
        data-test="forgot-email"
      />

      <div v-if="error" class="text-negative text-center text-weight-medium" data-test="forgot-error">
        {{ error }}
      </div>

      <q-btn
        type="submit"
        unelevated
        rounded
        color="primary"
        class="full-width"
        :label="t('ส่งลิงก์ตั้งรหัสผ่านใหม่', 'Send reset link')"
        :loading="submitting"
        :disable="!email.trim()"
        data-test="forgot-submit"
      />

      <div class="text-center">
        <router-link to="/Login" class="auth-link">
          {{ t('กลับไปหน้าเข้าสู่ระบบ', 'Back to log in') }}
        </router-link>
      </div>
    </q-form>
  </AuthCard>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import AuthCard from 'components/AuthCard.vue';
import { useAuthStore } from 'stores/AuthStore';
import { useLanguageStore } from 'stores/LanguageStore';

const auth = useAuthStore();
const languageStore = useLanguageStore();
const t = (th: string, en: string) => (languageStore.isThai ? th : en);

const email = ref('');
const submitting = ref(false);
const sent = ref(false);
const error = ref('');

const submit = async () => {
  if (!email.value.trim() || submitting.value) return;

  submitting.value = true;
  error.value = '';

  try {
    await auth.forgotPassword(email.value.trim());
    sent.value = true;
  } catch (e: unknown) {
    // มีแค่กรณีเน็ต/เพดานคำขอ (429) เท่านั้นที่มาถึงตรงนี้ — หลังบ้านไม่เคยตอบ error
    // เพราะเหตุผลว่าอีเมลนี้ไม่มีบัญชี
    error.value = e instanceof Error ? e.message : t('ส่งคำขอไม่สำเร็จ', 'Could not send the request');
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.auth-link {
  color: var(--accent-700);
  text-decoration: none;
}

.auth-link:hover {
  color: var(--accent-900);
  text-decoration: underline;
}
</style>

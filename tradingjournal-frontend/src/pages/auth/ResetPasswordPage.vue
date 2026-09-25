<template>
  <AuthCard :title="t('ตั้งรหัสผ่านใหม่', 'Set a new password')">
    <!-- ไม่มี token ในลิงก์ (เปิดหน้านี้ตรง ๆ / ลิงก์ถูกตัด) -->
    <div v-if="!token && !done" class="text-center" data-test="reset-no-token">
      <p class="q-mb-md">
        {{
          t(
            'ลิงก์นี้ไม่ถูกต้อง กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง',
            'This link is not valid. Please request a new password reset link.',
          )
        }}
      </p>
      <q-btn
        unelevated
        rounded
        color="primary"
        to="/ForgotPassword"
        :label="t('ขอลิงก์ใหม่', 'Request a new link')"
      />
    </div>

    <div v-else-if="done" class="text-center" data-test="reset-done">
      <q-icon name="check_circle" size="48px" color="positive" class="q-mb-md" />
      <p class="q-mb-md">
        {{
          t(
            'ตั้งรหัสผ่านใหม่สำเร็จ ทุกอุปกรณ์ถูกออกจากระบบแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่',
            'Your password has been changed and every device has been signed out. Please log in with the new password.',
          )
        }}
      </p>
      <q-btn
        unelevated
        rounded
        color="primary"
        to="/Login"
        :label="t('เข้าสู่ระบบ', 'Log in')"
        data-test="reset-login"
      />
    </div>

    <q-form v-else class="q-gutter-y-md" @submit.prevent="submit">
      <q-input
        v-model="password"
        type="password"
        outlined
        dense
        autocomplete="new-password"
        :label="t('รหัสผ่านใหม่', 'New password')"
        :rules="passwordRules"
        hide-bottom-space
        data-test="reset-password"
      />

      <q-input
        v-model="confirm"
        type="password"
        outlined
        dense
        autocomplete="new-password"
        :label="t('ยืนยันรหัสผ่านใหม่', 'Confirm new password')"
        :rules="confirmRules"
        hide-bottom-space
        data-test="reset-confirm"
      />

      <div v-if="error" class="text-negative text-center text-weight-medium" data-test="reset-error">
        {{ error }}
        <div class="q-mt-sm">
          <router-link to="/ForgotPassword" class="auth-link" data-test="reset-request-new">
            {{ t('ขอลิงก์ใหม่', 'Request a new link') }}
          </router-link>
        </div>
      </div>

      <q-btn
        type="submit"
        unelevated
        rounded
        color="primary"
        class="full-width"
        :label="t('ตั้งรหัสผ่านใหม่', 'Set new password')"
        :loading="submitting"
        :disable="!canSubmit"
        data-test="reset-submit"
      />
    </q-form>
  </AuthCard>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AuthCard from 'components/AuthCard.vue';
import { PASSWORD_RULES } from 'src/constants/user.constants';
import { useAuthStore } from 'stores/AuthStore';
import { useLanguageStore } from 'stores/LanguageStore';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const languageStore = useLanguageStore();
const t = (th: string, en: string) => (languageStore.isThai ? th : en);

const token = ref('');
const password = ref('');
const confirm = ref('');
const submitting = ref(false);
const done = ref(false);
const error = ref('');

onMounted(() => {
  const raw = route.query.token;

  token.value = typeof raw === 'string' ? raw : '';

  // เก็บ token ไว้ในหน่วยความจำแล้วลบออกจาก URL ทันที — ไม่ให้ค้างในประวัติเบราว์เซอร์
  // หรือถูกคัดลอกไปพร้อมกับลิงก์หน้านี้
  if (raw !== undefined) {
    void router.replace({ path: route.path, query: {} });
  }
});

const passwordRules = [
  (value: string) =>
    (value.length >= PASSWORD_RULES.minLength &&
      value.length <= PASSWORD_RULES.maxLength &&
      PASSWORD_RULES.pattern.test(value)) ||
    t(
      `รหัสผ่านต้องยาว ${PASSWORD_RULES.minLength}-${PASSWORD_RULES.maxLength} ตัว และมีตัวอักษรกับตัวเลข`,
      `Password must be ${PASSWORD_RULES.minLength}-${PASSWORD_RULES.maxLength} characters with letters and numbers`,
    ),
];

const confirmRules = [
  (value: string) => value === password.value || t('รหัสผ่านไม่ตรงกัน', 'Passwords do not match'),
];

const canSubmit = computed(
  () =>
    passwordRules[0]!(password.value) === true &&
    confirm.value === password.value &&
    !submitting.value,
);

const submit = async () => {
  if (!canSubmit.value) return;

  submitting.value = true;
  error.value = '';

  try {
    await auth.resetPassword(token.value, password.value);
    token.value = '';
    password.value = '';
    confirm.value = '';
    done.value = true;
  } catch (e: unknown) {
    // 400 = ลิงก์หมดอายุ/ใช้ไปแล้ว/ไม่ถูกต้อง (ข้อความมาจากหลังบ้าน) หรือรหัสไม่ผ่านกฎ
    error.value =
      e instanceof Error ? e.message : t('ตั้งรหัสผ่านใหม่ไม่สำเร็จ', 'Could not set the new password');
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

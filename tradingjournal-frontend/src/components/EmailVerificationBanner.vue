<template>
  <q-banner
    v-if="visible"
    dense
    rounded
    class="verify-banner q-mb-md"
    data-test="verify-banner"
  >
    <template #avatar>
      <q-icon name="mark_email_unread" color="warning" />
    </template>

    <div data-test="verify-banner-text">
      <template v-if="sent">
        {{
          t(
            'ส่งอีเมลยืนยันแล้ว กรุณาตรวจกล่องจดหมาย (รวมถึงสแปม)',
            'Verification email sent. Please check your inbox (and spam folder).',
          )
        }}
      </template>
      <template v-else>
        {{
          t(
            'ยังไม่ได้ยืนยันอีเมล — ใช้แอปได้ตามปกติ แต่ฟีเจอร์ AI จะเปิดใช้เมื่อยืนยันแล้ว',
            'Your email is not verified yet — you can use the app, but AI features unlock once you verify.',
          )
        }}
      </template>
      <div v-if="error" class="text-negative q-mt-xs" data-test="verify-banner-error">{{ error }}</div>
    </div>

    <template #action>
      <q-btn
        flat
        dense
        no-caps
        :label="sent ? t('ส่งอีกครั้ง', 'Send again') : t('ส่งอีเมลยืนยัน', 'Resend email')"
        :loading="user.sendingVerification.value"
        data-test="verify-banner-resend"
        @click="resend"
      />
      <q-btn
        flat
        dense
        round
        icon="close"
        :aria-label="t('ปิด', 'Dismiss')"
        data-test="verify-banner-dismiss"
        @click="dismissed = true"
      />
    </template>
  </q-banner>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useUser } from 'src/composables/useUser';
import { getUserErrorMessage } from 'src/services/user.service';
import { useAuthStore } from 'stores/AuthStore';
import { useLanguageStore } from 'stores/LanguageStore';

/**
 * แถบเตือนบัญชีที่ยังไม่ยืนยันอีเมล — ใช้แอปได้ตามปกติ ไม่บล็อกอะไรนอกจากฟีเจอร์ AI
 * ปิดได้ (เฉพาะรอบนี้ — โหลดหน้าใหม่แล้วกลับมาจนกว่าจะยืนยัน)
 *
 * แสดงเฉพาะเมื่อหลังบ้านบอก email_verified === false ชัด ๆ (ไม่มีค่า = ไม่รู้ = ไม่เตือน)
 */
const authStore = useAuthStore();
const languageStore = useLanguageStore();
const user = useUser();
const t = (th: string, en: string) => (languageStore.isThai ? th : en);

const dismissed = ref(false);
const sent = ref(false);
const error = ref('');

const emailVerified = computed(
  () => user.profile.value?.email_verified ?? authStore.user?.email_verified,
);

const visible = computed(
  () => authStore.isAuthenticated && emailVerified.value === false && !dismissed.value,
);

const resend = async () => {
  error.value = '';

  try {
    const result = await user.sendVerificationEmail();

    // ตอบว่ายืนยันแล้ว = แถบนี้ล้าสมัย (เช่นเพิ่งยืนยันจากอีกเครื่อง) โหลดโปรไฟล์ใหม่ให้แถบหาย
    if (result.already_verified) {
      await user.fetchProfile().catch(() => undefined);
      return;
    }

    sent.value = true;
  } catch (e: unknown) {
    // 429 (ขอถี่เกินไป) / 503 (ระบบส่งอีเมลยังไม่พร้อม) — ข้อความมาจากหลังบ้าน
    error.value = getUserErrorMessage(e, t('ส่งอีเมลไม่สำเร็จ', 'Could not send the email'));
  }
};
</script>

<style scoped>
.verify-banner {
  background: rgba(255, 193, 7, 0.14);
  border: 1px solid rgba(255, 193, 7, 0.45);
}
</style>

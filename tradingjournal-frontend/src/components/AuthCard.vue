<template>
  <q-page padding class="dashboard-page flex flex-center">
    <q-card class="auth-card dash-card" flat>
      <div class="rainbow-bar"></div>

      <q-card-section class="q-pa-xl">
        <div class="text-center q-mb-lg">
          <div class="logo-box q-mb-md">
            <img :src="wisenancialLogo" alt="Wisenancial" class="brand-logo-img" />
          </div>
          <div class="text-h5 text-weight-bolder dash-text-main q-mb-sm" data-test="auth-card-title">
            {{ title }}
          </div>
          <div v-if="subtitle" class="text-subtitle2 dash-text-muted">{{ subtitle }}</div>
        </div>

        <slot />
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import wisenancialLogo from 'assets/wisenancial-logo-transparent.png';

/**
 * กรอบการ์ดของหน้า auth ที่ไม่ใช่ Login/Register (ลืมรหัสผ่าน / ตั้งรหัสใหม่ / ยืนยันอีเมล)
 * หน้าตาเดียวกับ LoginPage — แยกออกมาเพื่อไม่ต้องคัดลอก CSS ชุดใหญ่ไปสามที่
 */
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<style scoped>
.dashboard-page {
  --bg-page: #f8fafc;
  --bg-card: #ffffff;
  --text-main: #1e293b;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --shadow-card: 0 10px 40px -10px rgba(0, 0, 0, 0.08);
}

body.body--dark .dashboard-page {
  --bg-page: #0f172a;
  --bg-card: #151e32;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --border-color: #23314b;
  --shadow-card: 0 10px 40px -10px rgba(0, 0, 0, 0.4);
}

.auth-card {
  width: 100%;
  max-width: 440px;
  border-radius: 20px;
}

.dash-card {
  background-color: var(--bg-card);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

.rainbow-bar {
  height: 5px;
  width: 100%;
  background: linear-gradient(90deg, var(--accent-400) 0%, var(--accent-600) 50%, var(--accent-900) 100%);
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

.logo-box {
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-logo-img {
  height: 52px;
  width: auto;
  object-fit: contain;
}

.dash-text-main {
  color: var(--text-main);
}

.dash-text-muted {
  color: var(--text-muted);
}

body.body--dark .dash-text-main {
  color: var(--text-main) !important;
}

body.body--dark .dash-text-muted {
  color: var(--text-muted) !important;
}
</style>

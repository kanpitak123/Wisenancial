<template>
  <q-page padding class="dashboard-page flex flex-center">
    <q-card class="auth-card dash-card transition-theme" flat>
      <div class="rainbow-bar"></div>

      <q-card-section class="q-pa-xl">
        <div class="text-center q-mb-xl">
          <div class="logo-box q-mb-md">
            <img :src="wisenancialLogo" alt="Wisenancial" class="brand-logo-img" />
          </div>
          <div class="text-h4 text-weight-bolder dash-text-main q-mb-sm">Create Account</div>
          <div class="text-subtitle1 dash-text-muted">Join us and start tracking your trades.</div>
        </div>

        <q-form @submit.prevent="handleRegister" class="q-gutter-y-md">
          <div>
            <div class="text-subtitle2 q-mb-xs dash-text-muted text-weight-bold">Username</div>
            <q-input
              v-model="form.username"
              outlined
              dense
              :dark="$q.dark.isActive"
              class="custom-input"
              placeholder="Enter your username"
              hide-bottom-space
            >
              <template v-slot:prepend>
                <q-icon name="person" :color="$q.dark.isActive ? 'grey-5' : 'grey-7'" size="xs" />
              </template>
            </q-input>
          </div>

          <div>
            <div class="text-subtitle2 q-mb-xs dash-text-muted text-weight-bold">Full Name</div>
            <q-input
              v-model="form.full_name"
              outlined
              dense
              :dark="$q.dark.isActive"
              class="custom-input"
              placeholder="John Doe"
              hide-bottom-space
            >
              <template v-slot:prepend>
                <q-icon name="badge" :color="$q.dark.isActive ? 'grey-5' : 'grey-7'" size="xs" />
              </template>
            </q-input>
          </div>

          <div>
            <div class="text-subtitle2 q-mb-xs dash-text-muted text-weight-bold">Email</div>
            <q-input
              v-model="form.email"
              type="email"
              outlined
              dense
              :dark="$q.dark.isActive"
              class="custom-input"
              placeholder="example@mail.com"
              hide-bottom-space
            >
              <template v-slot:prepend>
                <q-icon name="email" :color="$q.dark.isActive ? 'grey-5' : 'grey-7'" size="xs" />
              </template>
            </q-input>
          </div>

          <div class="q-mb-lg">
            <div class="text-subtitle2 q-mb-xs dash-text-muted text-weight-bold">Password</div>
            <q-input
              v-model="form.password"
              type="password"
              outlined
              dense
              :dark="$q.dark.isActive"
              class="custom-input"
              placeholder="••••••••"
              hide-bottom-space
            >
              <template v-slot:prepend>
                <q-icon name="lock" :color="$q.dark.isActive ? 'grey-5' : 'grey-7'" size="xs" />
              </template>
            </q-input>
          </div>

          <q-btn
            type="submit"
            unelevated
            rounded
            label="Sign Up"
            class="full-width custom-theme-btn text-white text-weight-bold q-py-sm shadow-3 q-mt-md"
            :loading="auth.loading"
          >
            <template v-slot:loading>
              <q-spinner-dots class="on-left" />
              Processing...
            </template>
          </q-btn>
        </q-form>

        <div class="text-center q-mt-xl dash-text-muted text-weight-medium">
          Already have an account?
          <router-link to="/Login" class="login-link text-weight-bold q-ml-xs"> Login </router-link>
        </div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useAuthStore } from 'stores/AuthStore';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import wisenancialLogo from 'assets/wisenancial-logo-transparent.png';

const auth = useAuthStore();
const router = useRouter();
const $q = useQuasar();

const form = reactive({
  username: '',
  full_name: '',
  email: '',
  password: '',
});

const handleRegister = async () => {
  // Basic validation (Optional: add more as needed)
  if (!form.username || !form.email || !form.password) {
    $q.notify({
      type: 'warning',
      message: 'Please fill in all required fields.',
      position: 'top',
    });
    return;
  }

  try {
    await auth.register(form);
    $q.notify({
      type: 'positive',
      message: 'Account created successfully!',
      position: 'top',
    });
    await router.push('/login');
  } catch (error) {
    console.error('Registration failed:', error);

    $q.notify({
      type: 'negative',
      message: auth.error ?? (error instanceof Error ? error.message : 'สมัครสมาชิกไม่สำเร็จ'),
      position: 'top',
    });
  }
};
</script>

<style scoped>
/* 🌟 Dashboard Variables for Theme Consistency */
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

/* Auth Card Styling */
.auth-card {
  width: 100%;
  max-width: 440px;
  border-radius: 20px;
}

/* Logo Box */
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

.dash-card {
  background-color: var(--bg-card);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

body.body--dark .dash-card {
  background-color: var(--bg-card) !important;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-card);
}

/* Rainbow Top Bar — rebrand 2026-08-17: light-to-dark teal sweep (accent-400 -> 600 -> 900) */
.rainbow-bar {
  height: 5px;
  width: 100%;
  background: linear-gradient(90deg, var(--accent-400) 0%, var(--accent-600) 50%, var(--accent-900) 100%);
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

/* Typography */
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

/* Custom Gradient Button */
.custom-theme-btn {
  background: linear-gradient(135deg, var(--accent-400) 0%, var(--accent-600) 50%, var(--accent-900) 100%);
  background-size: 200% auto;
  transition: all 0.4s ease-in-out;
  font-size: 1.05rem;
}
.custom-theme-btn:hover {
  background-position: right center;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(51, 97, 96, 0.35) !important;
}

/* Custom Inputs */
.custom-input :deep(.q-field__control:before) {
  border-color: var(--border-color);
  transition: border-color 0.3s ease;
  border-radius: 10px;
}
.custom-input :deep(.q-field__control:hover:before) {
  border-color: var(--accent-600) !important;
}
.custom-input :deep(.q-field__control:after) {
  border-color: var(--accent-800);
  border-width: 2px;
  border-radius: 10px;
}

/* Links */
.login-link {
  color: var(--accent-700);
  text-decoration: none;
  transition: color 0.2s ease;
}
.login-link:hover {
  color: var(--accent-900);
  text-decoration: underline;
}

.transition-theme {
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease,
    color 0.3s ease,
    box-shadow 0.3s ease;
}
</style>

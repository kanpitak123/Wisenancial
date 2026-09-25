<script setup lang="ts">
/**
 * Settings — จัดการบัญชีของตัวเอง (โปรไฟล์ / รหัสผ่าน / ส่งออกข้อมูล)
 *
 * หน้านี้เป็นตัวส่งต่อ: state และการยิง API อยู่ที่ UserStore (ผ่าน useUser) ตามกฎของ
 * repo — Page -> Composable -> Store -> Service
 *
 * โปรไฟล์ใช้ PATCH /users/me เดิม, เปลี่ยนรหัสผ่านใช้ POST /auth/change-password
 * (ต้องอยู่ใต้ /auth เพราะ refresh cookie ส่งให้เฉพาะ path นั้น), ส่งออกข้อมูลใช้
 * GET /users/me/export — ไฟล์ถูกสร้างและดาวน์โหลดในเบราว์เซอร์เท่านั้น
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useLanguageStore } from 'stores/LanguageStore';
import { useUser } from 'src/composables/useUser';
import { getUserErrorMessage } from 'src/services/user.service';
import { PASSWORD_RULES } from 'src/constants/user.constants';
import { downloadJson, exportFilename } from 'src/utils/json-export';
import { WsCard } from 'src/components/ui';

const $q = useQuasar();
const languageStore = useLanguageStore();
const user = useUser();

const t = (th: string, en: string) => (languageStore.isThai ? th : en);

// ---------------------------------------------------------------- โปรไฟล์
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

const profileForm = reactive({
  full_name: '',
  username: '',
  bio: '',
  avatar_url: '',
  is_public_profile: false,
});

const fillProfileForm = () => {
  const profile = user.profile.value;

  if (!profile) return;

  profileForm.full_name = profile.full_name ?? '';
  profileForm.username = profile.username ?? '';
  profileForm.bio = profile.bio ?? '';
  profileForm.avatar_url = profile.avatar_url ?? '';
  profileForm.is_public_profile = profile.is_public_profile ?? false;
};

// เติมฟอร์มครั้งแรกที่ profile มา และทุกครั้งที่ store โหลดใหม่ (เช่นหลังบันทึกสำเร็จ)
watch(() => user.profile.value, fillProfileForm, { immediate: true });

onMounted(() => {
  // profile อาจถูกโหลดไว้แล้วโดย MainLayout — โหลดซ้ำเพื่อให้ได้ is_public_profile ล่าสุดเสมอ
  void user.fetchProfile().catch(() => undefined);
});

const profileRules = {
  fullName: (value: string) =>
    (value.trim().length >= 2 && value.trim().length <= 100) ||
    t('ชื่อต้องยาว 2–100 ตัวอักษร', 'Name must be 2–100 characters'),
  username: (value: string) =>
    (value.trim().length >= 3 &&
      value.trim().length <= 50 &&
      USERNAME_PATTERN.test(value.trim())) ||
    t('ชื่อผู้ใช้ 3–50 ตัว ใช้ได้เฉพาะ a-z 0-9 _ . -', 'Username: 3–50 chars, only a-z 0-9 _ . -'),
  bio: (value: string) => value.length <= 500 || t('ไม่เกิน 500 ตัวอักษร', 'Max 500 characters'),
  avatarUrl: (value: string) =>
    value.trim() === '' ||
    /^https?:\/\/\S+$/i.test(value.trim()) ||
    t('ต้องเป็น URL ที่ขึ้นต้นด้วย http:// หรือ https://', 'Must be an http(s):// URL'),
};

const profileValid = computed(
  () =>
    profileRules.fullName(profileForm.full_name) === true &&
    profileRules.username(profileForm.username) === true &&
    profileRules.bio(profileForm.bio) === true &&
    profileRules.avatarUrl(profileForm.avatar_url) === true,
);

const profileDirty = computed(() => {
  const profile = user.profile.value;

  if (!profile) return false;

  return (
    profileForm.full_name.trim() !== (profile.full_name ?? '') ||
    profileForm.username.trim() !== (profile.username ?? '') ||
    profileForm.bio.trim() !== (profile.bio ?? '') ||
    profileForm.avatar_url.trim() !== (profile.avatar_url ?? '') ||
    profileForm.is_public_profile !== (profile.is_public_profile ?? false)
  );
});

const saveProfile = async () => {
  if (!profileValid.value || !profileDirty.value) return;

  const profile = user.profile.value;

  // ส่งเฉพาะฟิลด์ที่เปลี่ยน — และไม่ส่ง avatar_url ว่าง (หลังบ้านตรวจว่าต้องเป็น URL
  // ถ้าอยากลบรูปให้ใช้ปุ่มลบรูป ซึ่งเรียก DELETE /users/me/avatar)
  const payload: Parameters<typeof user.updateProfile>[0] = {};
  const fullName = profileForm.full_name.trim();
  const username = profileForm.username.trim();
  const bio = profileForm.bio.trim();
  const avatarUrl = profileForm.avatar_url.trim();

  if (fullName !== (profile?.full_name ?? '')) payload.full_name = fullName;
  if (username !== (profile?.username ?? '')) payload.username = username;
  if (bio !== (profile?.bio ?? '')) payload.bio = bio;
  if (avatarUrl !== '' && avatarUrl !== (profile?.avatar_url ?? '')) payload.avatar_url = avatarUrl;
  if (profileForm.is_public_profile !== (profile?.is_public_profile ?? false)) {
    payload.is_public_profile = profileForm.is_public_profile;
  }

  try {
    await user.updateProfile(payload);

    $q.notify({
      type: 'positive',
      position: 'top',
      message: t('บันทึกโปรไฟล์แล้ว', 'Profile saved'),
    });
  } catch (error) {
    $q.notify({
      type: 'negative',
      position: 'top',
      message: getUserErrorMessage(error, t('บันทึกโปรไฟล์ไม่สำเร็จ', 'Could not save profile')),
    });
  }
};

const removeAvatar = async () => {
  try {
    await user.removeAvatar();
    profileForm.avatar_url = '';

    $q.notify({
      type: 'positive',
      position: 'top',
      message: t('ลบรูปโปรไฟล์แล้ว', 'Profile picture removed'),
    });
  } catch (error) {
    $q.notify({
      type: 'negative',
      position: 'top',
      message: getUserErrorMessage(error, t('ลบรูปไม่สำเร็จ', 'Could not remove picture')),
    });
  }
};

// ---------------------------------------------------------------- รหัสผ่าน
const passwordForm = reactive({ current: '', next: '', confirm: '' });
const showPasswords = ref(false);
const passwordDone = ref<{ others: number; kept: boolean } | null>(null);

const passwordRules = {
  current: (value: string) =>
    value.length > 0 || t('กรุณากรอกรหัสผ่านปัจจุบัน', 'Enter your current password'),
  next: (value: string) =>
    (value.length >= PASSWORD_RULES.minLength &&
      value.length <= PASSWORD_RULES.maxLength &&
      PASSWORD_RULES.pattern.test(value)) ||
    t(
      'อย่างน้อย 8 ตัว และต้องมีทั้งตัวอักษรและตัวเลข',
      'At least 8 characters, with letters and digits',
    ),
  differs: (value: string) =>
    value !== passwordForm.current ||
    t('ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน', 'Must differ from the current password'),
  confirm: (value: string) =>
    value === passwordForm.next || t('รหัสผ่านไม่ตรงกัน', 'Passwords do not match'),
};

const passwordValid = computed(
  () =>
    passwordRules.current(passwordForm.current) === true &&
    passwordRules.next(passwordForm.next) === true &&
    passwordRules.differs(passwordForm.next) === true &&
    passwordRules.confirm(passwordForm.confirm) === true,
);

const submitPassword = async () => {
  if (!passwordValid.value) return;

  passwordDone.value = null;

  try {
    const result = await user.changePassword({
      current_password: passwordForm.current,
      new_password: passwordForm.next,
    });

    passwordDone.value = {
      others: result.other_sessions_revoked,
      kept: result.current_session_kept,
    };
    passwordForm.current = '';
    passwordForm.next = '';
    passwordForm.confirm = '';

    $q.notify({
      type: 'positive',
      position: 'top',
      message: t('เปลี่ยนรหัสผ่านสำเร็จ', 'Password changed'),
    });
  } catch (error) {
    // 400 = รหัสปัจจุบันผิด/รหัสใหม่ไม่ผ่านกฎ — ข้อความมาจากหลังบ้านอยู่แล้ว
    $q.notify({
      type: 'negative',
      position: 'top',
      message: getUserErrorMessage(
        error,
        t('เปลี่ยนรหัสผ่านไม่สำเร็จ', 'Could not change password'),
      ),
    });
  }
};

// ---------------------------------------------------------------- ส่งออกข้อมูล
const exportMyData = async () => {
  try {
    const bundle = await user.exportMyData();

    downloadJson(exportFilename(bundle.exported_at), bundle);

    $q.notify({
      type: 'positive',
      position: 'top',
      message: t('ดาวน์โหลดข้อมูลของคุณแล้ว', 'Your data has been downloaded'),
    });
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;

    $q.notify({
      type: 'negative',
      position: 'top',
      message:
        status === 429
          ? t(
              'ขอส่งออกบ่อยเกินไป กรุณาลองใหม่ภายหลัง',
              'Too many export requests — try again later',
            )
          : getUserErrorMessage(error, t('ส่งออกข้อมูลไม่สำเร็จ', 'Could not export your data')),
    });
  }
};
</script>

<template>
  <q-page class="settings-page q-pa-md q-pa-sm-lg" data-test="settings-page">
    <div class="settings-head">
      <div class="settings-title">{{ t('ตั้งค่าบัญชี', 'Account settings') }}</div>
      <div class="settings-sub">
        {{
          t(
            'จัดการโปรไฟล์ รหัสผ่าน และข้อมูลของคุณ',
            'Manage your profile, password and personal data',
          )
        }}
      </div>
    </div>

    <!-- ── โปรไฟล์ ── -->
    <WsCard class="settings-card" data-test="settings-profile">
      <template #header>
        <div class="settings-card-title">{{ t('โปรไฟล์', 'Profile') }}</div>
      </template>

      <q-form class="settings-form" @submit.prevent="saveProfile">
        <q-input
          :model-value="user.profile.value?.email ?? ''"
          outlined
          dense
          readonly
          :label="t('อีเมล (เปลี่ยนไม่ได้)', 'Email (cannot be changed)')"
          data-test="profile-email"
        />
        <q-input
          v-model="profileForm.full_name"
          outlined
          dense
          :label="t('ชื่อที่แสดง', 'Display name')"
          :rules="[profileRules.fullName]"
          data-test="profile-full-name"
        />
        <q-input
          v-model="profileForm.username"
          outlined
          dense
          :label="t('ชื่อผู้ใช้', 'Username')"
          :rules="[profileRules.username]"
          data-test="profile-username"
        />
        <q-input
          v-model="profileForm.bio"
          outlined
          dense
          autogrow
          type="textarea"
          counter
          maxlength="500"
          :label="t('แนะนำตัว', 'Bio')"
          :rules="[profileRules.bio]"
          data-test="profile-bio"
        />
        <div class="settings-avatar-row">
          <q-input
            v-model="profileForm.avatar_url"
            outlined
            dense
            class="col"
            :label="t('URL รูปโปรไฟล์', 'Profile picture URL')"
            :rules="[profileRules.avatarUrl]"
            data-test="profile-avatar-url"
          />
          <q-btn
            v-if="user.profile.value?.avatar_url"
            flat
            no-caps
            color="negative"
            icon="delete_outline"
            :label="t('ลบรูป', 'Remove')"
            :disable="user.updating.value"
            data-test="profile-avatar-remove"
            @click="removeAvatar"
          />
        </div>

        <div class="settings-toggle-row">
          <div>
            <div class="settings-toggle-title">{{ t('เปิดโปรไฟล์สาธารณะ', 'Public profile') }}</div>
            <div class="settings-toggle-sub">
              {{
                t(
                  'เปิดแล้วสมาชิกคนอื่นจะเห็นมูลค่าพอร์ตรวม กำไร/ขาดทุน และหุ้นที่ถืออยู่',
                  'When on, other members can see your total assets, P&L and holdings.',
                )
              }}
            </div>
          </div>
          <q-toggle
            v-model="profileForm.is_public_profile"
            color="primary"
            data-test="profile-public-toggle"
          />
        </div>

        <div class="settings-actions">
          <q-btn
            unelevated
            no-caps
            color="primary"
            type="submit"
            :label="t('บันทึกโปรไฟล์', 'Save profile')"
            :loading="user.updating.value"
            :disable="!profileDirty || !profileValid"
            data-test="profile-save"
          />
        </div>
      </q-form>
    </WsCard>

    <!-- ── รหัสผ่าน ── -->
    <WsCard class="settings-card" data-test="settings-password">
      <template #header>
        <div class="settings-card-title">{{ t('เปลี่ยนรหัสผ่าน', 'Change password') }}</div>
      </template>

      <q-form class="settings-form" @submit.prevent="submitPassword">
        <q-input
          v-model="passwordForm.current"
          outlined
          dense
          autocomplete="current-password"
          :type="showPasswords ? 'text' : 'password'"
          :label="t('รหัสผ่านปัจจุบัน', 'Current password')"
          :rules="[passwordRules.current]"
          data-test="password-current"
        />
        <q-input
          v-model="passwordForm.next"
          outlined
          dense
          autocomplete="new-password"
          :type="showPasswords ? 'text' : 'password'"
          :label="t('รหัสผ่านใหม่', 'New password')"
          :hint="
            t(
              'อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข',
              'At least 8 characters with letters and digits',
            )
          "
          :rules="[passwordRules.next, passwordRules.differs]"
          data-test="password-new"
        />
        <q-input
          v-model="passwordForm.confirm"
          outlined
          dense
          autocomplete="new-password"
          :type="showPasswords ? 'text' : 'password'"
          :label="t('ยืนยันรหัสผ่านใหม่', 'Confirm new password')"
          :rules="[passwordRules.confirm]"
          data-test="password-confirm"
        >
          <template #append>
            <q-icon
              :name="showPasswords ? 'visibility_off' : 'visibility'"
              class="cursor-pointer"
              data-test="password-toggle-visibility"
              @click="showPasswords = !showPasswords"
            />
          </template>
        </q-input>

        <div class="settings-note">
          <q-icon name="devices" size="16px" class="q-mr-xs" />
          {{
            t(
              'เมื่อเปลี่ยนรหัสผ่าน ระบบจะออกจากระบบในอุปกรณ์เครื่องอื่นทั้งหมด',
              'Changing your password signs you out of all your other devices.',
            )
          }}
        </div>

        <div
          v-if="passwordDone"
          class="settings-result"
          :class="passwordDone.kept ? 'is-ok' : 'is-warn'"
          data-test="password-result"
        >
          <template v-if="passwordDone.kept">
            {{
              t(
                `ออกจากระบบในอุปกรณ์อื่นแล้ว ${passwordDone.others} เซสชัน อุปกรณ์นี้ยังใช้งานต่อได้`,
                `Signed out ${passwordDone.others} other session(s). This device stays signed in.`,
              )
            }}
          </template>
          <template v-else>
            {{
              t(
                'อุปกรณ์นี้อาจถูกให้ล็อกอินใหม่ภายในไม่กี่นาที (ระบบระบุเซสชันของเครื่องนี้ไม่ได้ จึงออกจากระบบทุกเครื่อง)',
                'You may be asked to sign in again on this device shortly (all sessions were signed out).',
              )
            }}
          </template>
        </div>

        <div class="settings-actions">
          <q-btn
            unelevated
            no-caps
            color="primary"
            type="submit"
            :label="t('เปลี่ยนรหัสผ่าน', 'Change password')"
            :loading="user.changingPassword.value"
            :disable="!passwordValid"
            data-test="password-submit"
          />
        </div>
      </q-form>
    </WsCard>

    <!-- ── ส่งออกข้อมูล ── -->
    <WsCard class="settings-card" data-test="settings-export">
      <template #header>
        <div class="settings-card-title">{{ t('ส่งออกข้อมูลของฉัน', 'Export my data') }}</div>
      </template>

      <p class="settings-copy">
        {{
          t(
            'ดาวน์โหลดข้อมูลทั้งหมดของคุณเป็นไฟล์ JSON — พอร์ต รายการเทรด บันทึก ปันผล โพสต์ และประวัติการใช้งาน โดยไม่รวมรหัสผ่านและข้อมูลลับของระบบ',
            'Download all your data as a JSON file — portfolios, trades, records, dividends, posts and usage history. Passwords and internal secrets are never included.',
          )
        }}
      </p>

      <div class="settings-actions">
        <q-btn
          outline
          no-caps
          color="primary"
          icon="download"
          :label="t('ดาวน์โหลดข้อมูล (JSON)', 'Download my data (JSON)')"
          :loading="user.exporting.value"
          data-test="export-button"
          @click="exportMyData"
        />
      </div>
    </WsCard>
  </q-page>
</template>

<style scoped>
.settings-page {
  max-width: 760px;
  margin: 0 auto;
}

.settings-head {
  margin-bottom: 16px;
}

.settings-title {
  font-size: 22px;
  font-weight: 800;
}

.settings-sub {
  opacity: 0.7;
  font-size: 13px;
  margin-top: 2px;
}

.settings-card {
  margin-bottom: 16px;
}

.settings-card-title {
  font-weight: 700;
  font-size: 15px;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-avatar-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.settings-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
}

.settings-toggle-title {
  font-weight: 600;
  font-size: 14px;
}

.settings-toggle-sub {
  opacity: 0.7;
  font-size: 12px;
}

.settings-note {
  display: flex;
  align-items: center;
  font-size: 12px;
  opacity: 0.75;
  margin: 4px 0 8px;
}

.settings-result {
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 10px;
  margin-bottom: 8px;
}

.settings-result.is-ok {
  background: rgba(33, 186, 69, 0.12);
}

.settings-result.is-warn {
  background: rgba(242, 192, 55, 0.18);
}

.settings-copy {
  font-size: 13px;
  opacity: 0.8;
  margin: 0 0 12px;
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
</style>

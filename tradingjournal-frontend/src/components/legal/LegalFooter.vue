<template>
  <footer class="legal-footer" data-test="legal-footer">
    <router-link :to="TERMS_ROUTE" class="legal-footer__link" data-test="footer-terms">
      {{ languageStore.isThai ? 'ข้อกำหนดการให้บริการ' : 'Terms of Service' }}
    </router-link>
    <span class="legal-footer__sep" aria-hidden="true">·</span>
    <router-link :to="PRIVACY_ROUTE" class="legal-footer__link" data-test="footer-privacy">
      {{ languageStore.isThai ? 'นโยบายความเป็นส่วนตัว' : 'Privacy Policy' }}
    </router-link>
  </footer>
</template>

<script setup lang="ts">
import { PRIVACY_ROUTE, TERMS_ROUTE } from 'src/constants/legal.constants';
import { useLanguageStore } from 'stores/LanguageStore';

/** ลิงก์ท้ายหน้าไปยัง Terms / Privacy — ใช้ซ้ำทั้งหน้า auth, ในแอป และหน้ากฎหมายเอง */
const languageStore = useLanguageStore();
</script>

<style scoped>
.legal-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px;
  font-size: 12.5px;
  color: var(--text-secondary, #64748b);
}

.legal-footer__link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.legal-footer__link:hover {
  color: var(--text-primary, inherit);
}
</style>

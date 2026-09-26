<template>
  <div class="legal" :data-test="`legal-page-${doc}`">
    <header class="legal__header">
      <router-link to="/" class="legal-brand" data-test="legal-home">
        <span class="legal-brand__mark">W</span>
        <span class="legal-brand__name">wisenancial</span>
      </router-link>

      <div class="legal-lang" role="group" aria-label="Language">
        <button
          type="button"
          class="legal-lang__option"
          :class="{ 'legal-lang__option--active': language.isThai }"
          data-test="legal-lang-th"
          @click="language.setLanguage('th')"
        >
          TH
        </button>
        <button
          type="button"
          class="legal-lang__option"
          :class="{ 'legal-lang__option--active': language.isEnglish }"
          data-test="legal-lang-en"
          @click="language.setLanguage('en')"
        >
          EN
        </button>
      </div>
    </header>

    <main class="legal__main">
      <div class="legal-draft" role="note" data-test="legal-draft-banner">
        <q-icon name="warning" size="22px" class="legal-draft__icon" />
        <div>
          <div class="legal-draft__title" data-test="legal-draft-title">{{ banner }}</div>
          <div class="legal-draft__text">{{ content.draftNotice }}</div>
          <div v-if="placeholderCount > 0" class="legal-draft__text" data-test="legal-draft-count">
            {{
              language.isThai
                ? `ยังมีตัวยึดที่รอคำตอบ ${placeholderCount} จุด (ไฮไลต์สีเหลืองด้านล่าง)`
                : `${placeholderCount} placeholder(s) below are still unresolved (highlighted).`
            }}
          </div>
        </div>
      </div>

      <article class="legal-doc">
        <h1 class="legal-doc__title">{{ content.title }}</h1>
        <p class="legal-doc__updated" data-test="legal-updated">
          <LegalText :text="content.updated" />
        </p>
        <p v-if="content.intro" class="legal-doc__intro">
          <LegalText :text="content.intro" />
        </p>

        <section
          v-for="section in content.sections"
          :id="section.id"
          :key="section.heading"
          class="legal-section"
          :data-test="section.id ? `legal-section-${section.id}` : undefined"
        >
          <h2 class="legal-section__heading">{{ section.heading }}</h2>
          <p class="legal-section__body"><LegalText :text="section.body" /></p>
        </section>
      </article>
    </main>

    <LegalFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import LegalFooter from 'components/legal/LegalFooter.vue';
import LegalText from 'components/legal/LegalText.vue';
import { LEGAL_DOCUMENTS, LEGAL_DRAFT_BANNER, type LegalDocKey } from 'src/constants/legal.content';
import { countLegalPlaceholders } from 'src/utils/legal-markup';
import { useLanguageStore } from 'stores/LanguageStore';

/**
 * หน้า Terms / Privacy สาธารณะ (ไม่ต้องล็อกอิน) — เนื้อหาเป็นฉบับร่างที่ยังไม่ผ่านทนายความ
 * แบนเนอร์ DRAFT อยู่บนสุดทุกครั้งและตัวยึดที่ยังไม่มีคำตอบถูกไฮไลต์ ไม่ซ่อน
 *
 * ภาษาเดินตาม LanguageStore ตัวเดียวกับทั้งแอป (สลับได้จากปุ่มมุมขวาบน)
 */
const props = defineProps<{ doc: LegalDocKey }>();

const language = useLanguageStore();
const route = useRoute();

const lang = computed(() => (language.isThai ? 'th' : 'en'));
const content = computed(() => LEGAL_DOCUMENTS[props.doc][lang.value]);
const banner = computed(() => LEGAL_DRAFT_BANNER[lang.value]);

const placeholderCount = computed(() => {
  const doc = content.value;
  const texts = [doc.updated, doc.intro ?? '', ...doc.sections.map((s) => s.body)];

  return texts.reduce((sum, text) => sum + countLegalPlaceholders(text), 0);
});

/**
 * router ตั้งให้เลื่อนขึ้นบนสุดทุกครั้ง (scrollBehavior) จึงเลื่อนไปหัวข้อเองเมื่อมี #anchor
 * เช่น ลิงก์จากการ์ด AI มาที่ /terms#ai-disclaimer
 */
async function scrollToHash(): Promise<void> {
  const id = String(route.hash ?? '').replace(/^#/, '');
  if (!id) return;

  await nextTick();
  document.getElementById(id)?.scrollIntoView({ block: 'start' });
}

onMounted(() => void scrollToHash());
watch(
  () => route.hash,
  () => void scrollToHash(),
);
</script>

<style scoped>
.legal {
  min-height: 100vh;
  background: var(--bg-page);
  color: var(--text-primary);
}

.legal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 820px;
  margin: 0 auto;
  padding: 16px;
}

.legal-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  font-size: 16px;
  color: var(--text-primary);
  text-decoration: none;
}

.legal-brand__mark {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, var(--accent-400), var(--accent-600));
}

.legal-lang {
  display: inline-flex;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  overflow: hidden;
}

.legal-lang__option {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  padding: 6px 14px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.legal-lang__option--active {
  background: var(--accent-600);
  color: #fff;
}

.legal__main {
  max-width: 820px;
  margin: 0 auto;
  padding: 8px 16px 32px;
}

.legal-draft {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 16px;
  margin-bottom: 24px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.5);
}

.legal-draft__icon {
  flex: 0 0 auto;
  color: #f59e0b;
}

.legal-draft__title {
  font-weight: 800;
  letter-spacing: 0.02em;
}

.legal-draft__text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.legal-doc__title {
  font-size: 28px;
  line-height: 1.25;
  margin: 0 0 8px;
}

.legal-doc__updated {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 0 0 16px;
}

.legal-doc__intro {
  line-height: 1.7;
  margin: 0 0 24px;
}

.legal-section {
  margin-bottom: 20px;
  /* หัวข้อที่ลิงก์ลึกมาหา (#ai-disclaimer) ไม่ให้ติดขอบบนจอ */
  scroll-margin-top: 16px;
}

.legal-section__heading {
  font-size: 17px;
  margin: 0 0 6px;
}

.legal-section__body {
  line-height: 1.75;
  margin: 0;
  white-space: pre-line;
}

@media (max-width: 599px) {
  .legal-doc__title {
    font-size: 22px;
  }
}
</style>

<template>
  <div class="landing" data-test="landing-page">
    <!-- แสงพื้นหลังนุ่ม ๆ สองก้อนตามแบบ — อยู่หลังทุกอย่างและไม่รับ pointer -->
    <div class="landing__ambient" aria-hidden="true">
      <span class="landing__blob landing__blob--one"></span>
      <span class="landing__blob landing__blob--two"></span>
    </div>

    <header class="landing__header">
      <nav class="landing__nav">
        <div class="landing-brand">
          <span class="landing-brand__mark">W</span>
          <span class="landing-brand__name">wisenancial</span>
        </div>

        <div class="landing__nav-right">
          <!-- ปุ่มภาษาใช้ LanguageStore ตัวเดียวกับที่ MainLayout ใช้ ค่าจึงค้างข้ามหน้า -->
          <div class="landing-pill" role="group" aria-label="Language">
            <button
              type="button"
              class="landing-pill__option"
              :class="{ 'landing-pill__option--active': language.isThai }"
              data-test="landing-lang-th"
              @click="language.setLanguage('th')"
            >
              TH
            </button>
            <button
              type="button"
              class="landing-pill__option"
              :class="{ 'landing-pill__option--active': language.isEnglish }"
              data-test="landing-lang-en"
              @click="language.setLanguage('en')"
            >
              EN
            </button>
          </div>

          <button
            type="button"
            class="landing-icon-btn"
            :title="$q.dark.isActive ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            data-test="landing-theme-toggle"
            @click="toggleTheme"
          >
            <q-icon :name="$q.dark.isActive ? 'light_mode' : 'dark_mode'" size="18px" />
          </button>

          <router-link
            :to="LOGIN_ROUTE"
            class="landing-btn landing-btn--ghost"
            data-test="landing-login"
          >
            เข้าสู่ระบบ
          </router-link>
          <router-link
            :to="REGISTER_ROUTE"
            class="landing-btn landing-btn--primary"
            data-test="landing-cta-header"
          >
            เริ่มใช้งานฟรี
          </router-link>
        </div>
      </nav>
    </header>

    <div class="landing__wrap">
      <section class="landing-hero">
        <div>
          <div class="landing-eyebrow">
            <q-icon name="auto_awesome" size="14px" />
            AI-POWERED TRADING JOURNAL
          </div>
          <h1 class="landing-hero__title">
            รวมโลกการลงทุนของคุณ<br /><span>ไว้ใน</span
            ><span class="landing-hero__accent">ที่เดียว</span>
          </h1>
          <p class="landing-hero__sub">
            บันทึกเทรด วิเคราะห์พอร์ต และรับคำแนะนำจาก AI ทั้ง Forex และหุ้น
            ในแอปเดียวที่ออกแบบมาให้ใช้งานง่ายที่สุด
          </p>

          <div class="landing-hero__cta">
            <router-link
              :to="REGISTER_ROUTE"
              class="landing-btn landing-btn--primary landing-btn--lg"
              data-test="landing-cta-hero"
            >
              เริ่มใช้งานฟรี
            </router-link>
            <router-link :to="LOGIN_ROUTE" class="landing-btn landing-btn--ghost landing-btn--lg">
              เข้าสู่ระบบ
            </router-link>
          </div>

          <div class="landing-hero__stats">
            <template v-for="(stat, index) in HERO_STATS" :key="stat.label">
              <span v-if="index > 0" class="landing-hero__stat-divider" aria-hidden="true"></span>
              <div class="landing-hero__stat">
                <div class="landing-hero__stat-value">{{ stat.value }}</div>
                <div class="landing-hero__stat-label">{{ stat.label }}</div>
              </div>
            </template>
          </div>
        </div>

        <!-- การ์ดตัวอย่างหน้า Dashboard — เป็นภาพประกอบล้วน ไม่ได้ยิง API
             (หน้านี้เปิดได้โดยไม่ต้องล็อกอิน จะดึงพอร์ตจริงมาโชว์ไม่ได้อยู่แล้ว) -->
        <div class="landing-hero__visual">
          <div class="landing-float landing-float--up">
            <q-icon name="trending_up" size="14px" />
            +12.4% เดือนนี้
          </div>

          <div class="landing-mock">
            <div class="landing-mock__top">
              <div class="landing-mock__dots" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
              <span class="landing-mock__tag">Dashboard</span>
            </div>
            <div class="landing-mock__label">มูลค่าพอร์ตรวม</div>
            <div class="landing-mock__value">฿1,284,592</div>
            <div class="landing-mock__delta">▲ +2.34% วันนี้</div>

            <svg class="landing-mock__spark" viewBox="0 0 400 110" preserveAspectRatio="none">
              <defs>
                <linearGradient id="landingSparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--accent-500)" stop-opacity="0.3" />
                  <stop offset="100%" stop-color="var(--accent-500)" stop-opacity="0" />
                </linearGradient>
              </defs>
              <path :d="SPARK_AREA" fill="url(#landingSparkFill)" />
              <path
                :d="SPARK_LINE"
                fill="none"
                stroke="var(--accent-700)"
                stroke-width="2.5"
                stroke-linecap="round"
              />
            </svg>
          </div>

          <div class="landing-float landing-float--ai">
            <q-icon name="auto_awesome" size="14px" />
            AI แนะนำ 3 หุ้นใหม่
          </div>
        </div>
      </section>

      <section class="landing-section">
        <div class="landing-section__head">
          <h2>ทุกเครื่องมือที่นักลงทุนต้องการ</h2>
          <p>จากบันทึกเทรดไปจนถึงคำแนะนำจาก AI ครบในที่เดียว ไม่ต้องสลับแอปไปมา</p>
        </div>

        <div class="landing-feats">
          <article v-for="feature in FEATURES" :key="feature.title" class="landing-feat">
            <div
              class="landing-feat__icon"
              :style="{ background: feature.tint, color: feature.color }"
            >
              <q-icon :name="feature.icon" size="20px" />
            </div>
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.body }}</p>
          </article>
        </div>
      </section>

      <section class="landing-section">
        <div class="landing-section__head">
          <h2>เลือกแพ็กเกจที่ใช่สำหรับคุณ</h2>
        </div>

        <div class="landing-pricing">
          <div class="landing-price">
            <div class="landing-price__tier">Free</div>
            <div class="landing-price__amount">฿0</div>
            <div class="landing-price__per">ตลอดไป</div>
            <div class="landing-price__list">
              <div v-for="item in FREE_FEATURES" :key="item">
                <q-icon name="check" size="16px" />{{ item }}
              </div>
            </div>
            <router-link
              :to="REGISTER_ROUTE"
              class="landing-btn landing-btn--ghost landing-btn--block"
            >
              เริ่มใช้ฟรี
            </router-link>
          </div>

          <div class="landing-price landing-price--pro" data-test="landing-price-pro">
            <div class="landing-price__tier landing-price__tier--pro">{{ proName }}</div>
            <div class="landing-price__amount">
              ฿{{ proPrice }}<span class="landing-price__suffix">/เดือน</span>
            </div>
            <div class="landing-price__per">ยกเลิกได้ทุกเมื่อ</div>
            <div class="landing-price__list">
              <div v-for="item in proFeatures" :key="item">
                <q-icon name="check" size="16px" />{{ item }}
              </div>
            </div>
            <router-link
              :to="REGISTER_ROUTE"
              class="landing-btn landing-btn--primary landing-btn--block"
            >
              อัปเกรดเป็น {{ proName }}
            </router-link>
          </div>
        </div>
      </section>

      <section class="landing-section landing-section--tight">
        <div class="landing-cta">
          <h2>พร้อมเริ่มลงทุนอย่างมีระบบแล้วหรือยัง?</h2>
          <p>สมัครฟรีวันนี้ ไม่ต้องใช้บัตรเครดิต</p>
          <router-link
            :to="REGISTER_ROUTE"
            class="landing-btn landing-btn--invert landing-btn--lg"
            data-test="landing-cta-banner"
          >
            เริ่มใช้งานฟรี
          </router-link>
        </div>
      </section>

      <footer class="landing-footer">
        <div class="landing-brand landing-brand--sm">
          <span class="landing-brand__mark">W</span>
          <span class="landing-brand__name">wisenancial</span>
        </div>
        <div class="landing-footer__links">
          <span>เกี่ยวกับเรา</span>
          <span>ความเป็นส่วนตัว</span>
          <span>ข้อกำหนด</span>
          <span>ติดต่อ</span>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';

import { useLanguageStore } from 'stores/LanguageStore';
import { LOGIN_ROUTE } from 'src/constants/workspace.constants';
import {
  FREE_TIER_MAX_PORTFOLIOS,
  TIER_DISPLAY_NAMES,
  TIER_FEATURES,
  TIER_PRICE_THB,
} from 'src/constants/billing.constants';

const $q = useQuasar();
const language = useLanguageStore();

const REGISTER_ROUTE = '/Register';

/**
 * ⚠️ ตัวเลขการตลาด — ยกมาจากแบบ (mockup) ตรง ๆ ยังไม่ใช่สถิติจริงของระบบ
 * ต้องแทนด้วยตัวเลขจริงหรือถอดทั้งบล็อกออกก่อนเปิดหน้านี้ให้คนนอกเห็น
 */
const HERO_STATS = [
  { value: '50K+', label: 'ผู้ใช้งาน' },
  { value: '2.4M', label: 'เทรดที่บันทึกแล้ว' },
  { value: '4.8/5', label: 'คะแนนรีวิว' },
] as const;

/** เส้นกราฟประกอบในการ์ดตัวอย่าง — คงที่ ไม่ผูกกับข้อมูลจริง */
const SPARK_LINE =
  'M0,80 C40,75 60,90 90,72 C120,54 140,64 170,46 C200,28 220,42 250,30 C280,18 310,26 340,14 L400,4';
const SPARK_AREA = `${SPARK_LINE} L400,110 L0,110 Z`;

const FEATURES = [
  {
    icon: 'insights',
    title: 'วิเคราะห์เชิงลึก',
    body: 'กราฟและสถิติที่ช่วยให้เห็นภาพรวมพอร์ตและจุดที่ต้องปรับปรุงได้ชัดเจน',
    tint: 'var(--accent-100)',
    color: 'var(--accent-800)',
  },
  {
    icon: 'auto_awesome',
    title: 'AI Insights',
    body: 'รับคำแนะนำการลงทุนและวิเคราะห์ความเสี่ยงจาก AI แบบเรียลไทม์',
    tint: 'rgba(23, 130, 48, 0.12)',
    color: '#178230',
  },
  {
    icon: 'schedule',
    title: 'ติดตามหุ้นเรียลไทม์',
    body: 'กราฟแท่งเทียนอัปเดตสด เลื่อนดูย้อนหลังได้ ไม่ต้องรีเฟรชหน้า',
    tint: 'rgba(242, 192, 55, 0.16)',
    color: '#a16207',
  },
  {
    icon: 'forum',
    title: 'ชุมชนนักลงทุน',
    body: 'แชร์มุมมอง เปรียบเทียบผลตอบแทน และเรียนรู้จากนักลงทุนคนอื่น',
    tint: 'rgba(49, 204, 236, 0.14)',
    color: '#0e7490',
  },
] as const;

/**
 * ราคา/ฟีเจอร์ของแพ็กดึงจาก billing.constants ตัวเดียวกับหน้า Upgrade
 * (แบบวาดไว้ที่ ฿299 ซึ่งไม่ตรงกับแพ็กที่ขายจริง — ยึดค่าจริงเป็นหลัก)
 */
const PRO_TIER = 'PACK_279' as const;

const proName = TIER_DISPLAY_NAMES[PRO_TIER];
const proPrice = TIER_PRICE_THB[PRO_TIER];
const proFeatures = computed(() => TIER_FEATURES[PRO_TIER].slice(0, 3));

const FREE_FEATURES = [
  `${FREE_TIER_MAX_PORTFOLIOS} พอร์ต`,
  'บันทึกเทรดไม่จำกัด',
  'Watchlist พื้นฐาน',
];

// สลับธีมด้วยกลไกเดียวกับ MainLayout เพื่อให้ค่าที่เลือกจากหน้านี้ติดไปหลังล็อกอิน
const toggleTheme = () => {
  $q.dark.toggle();
  localStorage.setItem('darkMode', $q.dark.isActive ? 'true' : 'false');
};
</script>

<style scoped>
.landing {
  position: relative;
  min-height: 100vh;
  background: var(--bg-page);
  color: var(--text-primary);
  overflow-x: hidden;
}

/* ---------- แสงพื้นหลัง ---------- */
.landing__ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.landing__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.35;
}

.landing__blob--one {
  width: 520px;
  height: 520px;
  background: var(--accent-400);
  top: -180px;
  right: -120px;
}

.landing__blob--two {
  width: 420px;
  height: 420px;
  background: var(--accent-200);
  bottom: -160px;
  left: -100px;
  opacity: 0.4;
}

body.body--dark .landing__blob {
  opacity: 0.16;
}

/* ---------- header ---------- */
.landing__header {
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(14px);
  /* color-mix ไม่รองรับใน Safari รุ่นเก่า — ตกไปที่พื้นทึบแทนซึ่งยังอ่านออก */
  background: var(--bg-page);
  background: color-mix(in srgb, var(--bg-page) 78%, transparent);
  border-bottom: 1px solid var(--border-color);
}

.landing__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 32px;
  max-width: 1180px;
  margin: 0 auto;
}

.landing__nav-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.landing-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  font-size: 16px;
  color: var(--text-primary);
}

.landing-brand__mark {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--accent-500), var(--accent-900));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 800;
}

.landing-brand--sm {
  font-size: 13px;
}

.landing-brand--sm .landing-brand__mark {
  width: 26px;
  height: 26px;
  font-size: 12px;
}

.landing-pill {
  display: flex;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 3px;
}

.landing-pill__option {
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  padding: 5px 9px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.landing-pill__option--active {
  background: var(--bg-card);
  color: var(--accent-800);
}

body.body--dark .landing-pill__option--active {
  color: var(--accent-400);
}

.landing-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
}

/* ---------- ปุ่ม ---------- */
.landing-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 11px;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}

.landing-btn--primary {
  background: var(--accent-800);
  color: #fff;
  box-shadow: 0 8px 20px -8px rgba(51, 97, 96, 0.55);
}

body.body--dark .landing-btn--primary {
  background: var(--accent-400);
  color: var(--accent-900);
  box-shadow: 0 8px 20px -8px rgba(155, 197, 192, 0.35);
}

.landing-btn--ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border-color);
}

/* ปุ่มบนแถบ CTA พื้นเข้ม — กลับสีให้ตัดกับพื้น */
.landing-btn--invert {
  background: #fff;
  color: var(--accent-900);
}

.landing-btn--lg {
  padding: 13px 24px;
  font-size: 14px;
  border-radius: 13px;
}

.landing-btn--block {
  width: 100%;
  justify-content: center;
}

/* ---------- hero ---------- */
.landing__wrap {
  position: relative;
  z-index: 1;
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 32px;
}

.landing-hero {
  padding: 76px 0 60px;
  display: grid;
  grid-template-columns: 1fr 460px;
  gap: 48px;
  align-items: center;
}

.landing-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent-700);
  background: var(--accent-100);
  padding: 6px 12px;
  border-radius: 999px;
  margin-bottom: 20px;
}

body.body--dark .landing-eyebrow {
  color: var(--accent-400);
  background: rgba(133, 182, 176, 0.14);
}

.landing-hero__title {
  font-size: 50px;
  line-height: 1.08;
  font-weight: 900;
  letter-spacing: -0.02em;
  margin: 0 0 18px;
}

.landing-hero__accent {
  background: linear-gradient(135deg, var(--accent-500), var(--accent-900));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* ไล่สีบนตัวอักษรบนพื้นเข้มจะจมหาย — โหมดมืดใช้โทนสว่างขึ้น */
body.body--dark .landing-hero__accent {
  background: linear-gradient(135deg, var(--accent-300), var(--accent-500));
  background-clip: text;
  -webkit-background-clip: text;
}

.landing-hero__sub {
  font-size: 16px;
  color: var(--text-secondary);
  line-height: 1.7;
  max-width: 480px;
  margin: 0 0 30px;
}

.landing-hero__cta {
  display: flex;
  gap: 12px;
  margin-bottom: 38px;
  flex-wrap: wrap;
}

.landing-hero__stats {
  display: flex;
  gap: 28px;
}

.landing-hero__stat-divider {
  width: 1px;
  background: var(--border-color);
}

.landing-hero__stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.landing-hero__stat-label {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* ---------- การ์ดตัวอย่าง ---------- */
.landing-hero__visual {
  position: relative;
}

.landing-mock {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 26px;
  box-shadow:
    0 1px 2px rgba(27, 54, 54, 0.04),
    0 20px 44px -16px rgba(27, 54, 54, 0.14);
  padding: 22px;
}

body.body--dark .landing-mock {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.2),
    0 26px 60px -18px rgba(0, 0, 0, 0.6);
}

.landing-mock__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.landing-mock__dots {
  display: flex;
  gap: 5px;
}

.landing-mock__dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-color);
}

.landing-mock__tag {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 700;
}

.landing-mock__label {
  font-size: 10.5px;
  color: var(--text-muted);
  font-weight: 700;
  margin-bottom: 4px;
}

.landing-mock__value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.landing-mock__delta {
  font-size: 12px;
  font-weight: 700;
  color: #178230;
  margin-top: 2px;
}

body.body--dark .landing-mock__delta {
  color: #4ade80;
}

.landing-mock__spark {
  width: 100%;
  height: 110px;
  margin-top: 14px;
  display: block;
}

.landing-float {
  position: absolute;
  z-index: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 8px 12px;
  box-shadow:
    0 1px 2px rgba(27, 54, 54, 0.04),
    0 20px 44px -16px rgba(27, 54, 54, 0.14);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
}

.landing-float--up {
  top: -16px;
  right: -18px;
  color: #178230;
}

.landing-float--ai {
  bottom: 22px;
  left: -24px;
  color: var(--accent-800);
}

body.body--dark .landing-float--ai {
  color: var(--accent-400);
}

/* ---------- section ---------- */
.landing-section {
  padding: 70px 0;
}

.landing-section--tight {
  padding-top: 10px;
}

.landing-section__head {
  text-align: center;
  max-width: 560px;
  margin: 0 auto 42px;
}

.landing-section__head h2 {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 0 0 10px;
}

.landing-section__head p {
  color: var(--text-secondary);
  font-size: 14.5px;
  line-height: 1.6;
  margin: 0;
}

/* ---------- ฟีเจอร์ ---------- */
.landing-feats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.landing-feat {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 24px 20px;
  box-shadow:
    0 1px 2px rgba(27, 54, 54, 0.04),
    0 20px 44px -16px rgba(27, 54, 54, 0.14);
}

body.body--dark .landing-feat,
body.body--dark .landing-price,
body.body--dark .landing-float {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.2),
    0 26px 60px -18px rgba(0, 0, 0, 0.6);
}

.landing-feat__icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.landing-feat h3 {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 8px;
}

.landing-feat p {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* ---------- ราคา ---------- */
.landing-pricing {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  max-width: 680px;
  margin: 0 auto;
}

.landing-price {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 22px;
  padding: 28px 26px;
  box-shadow:
    0 1px 2px rgba(27, 54, 54, 0.04),
    0 20px 44px -16px rgba(27, 54, 54, 0.14);
}

.landing-price--pro {
  border: 2px solid var(--accent-500);
}

.landing-price__tier {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.landing-price__tier--pro {
  color: var(--accent-700);
}

body.body--dark .landing-price__tier--pro {
  color: var(--accent-400);
}

.landing-price__amount {
  font-size: 34px;
  font-weight: 800;
  margin: 8px 0 2px;
}

.landing-price__suffix {
  font-size: 15px;
  font-weight: 600;
}

.landing-price__per {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 18px;
}

.landing-price__list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-bottom: 20px;
}

.landing-price__list div {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.landing-price__list .q-icon {
  color: #178230;
  flex-shrink: 0;
}

body.body--dark .landing-price__list .q-icon {
  color: #4ade80;
}

/* ---------- CTA + footer ---------- */
.landing-cta {
  background: linear-gradient(135deg, var(--accent-800), var(--accent-900));
  border-radius: 28px;
  padding: 52px 40px;
  text-align: center;
  color: #fff;
}

.landing-cta h2 {
  font-size: 26px;
  margin: 0 0 10px;
  font-weight: 800;
}

.landing-cta p {
  opacity: 0.85;
  margin: 0 0 24px;
  font-size: 14px;
}

.landing-footer {
  padding: 40px 0;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.landing-footer__links {
  display: flex;
  gap: 22px;
  font-size: 12.5px;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

/* ---------- จอแคบ ---------- */
@media (max-width: 1023px) {
  .landing-hero {
    grid-template-columns: 1fr;
    padding-top: 48px;
  }

  .landing-hero__title {
    font-size: 38px;
  }

  .landing-feats {
    grid-template-columns: repeat(2, 1fr);
  }

  /* ป้ายลอยล้นออกนอกจอบนมือถือ — ดึงกลับเข้ามาชิดขอบการ์ด */
  .landing-float--up {
    right: 0;
  }

  .landing-float--ai {
    left: 0;
  }
}

@media (max-width: 599px) {
  .landing__wrap,
  .landing__nav {
    padding-left: 16px;
    padding-right: 16px;
  }

  .landing-hero__title {
    font-size: 30px;
  }

  .landing-feats,
  .landing-pricing {
    grid-template-columns: 1fr;
  }

  .landing-cta {
    padding: 36px 20px;
  }
}
</style>

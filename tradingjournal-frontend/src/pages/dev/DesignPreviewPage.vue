<script setup lang="ts">
/**
 * Dev-only design token / component preview — rebrand 2026-08-17.
 * Not linked from any nav; reachable only via direct URL (/dev/design-preview).
 * Purpose: let a human eyeball the new light/dark teal theme before Phase B
 * rolls the tokens out across every real page. See
 * claude/ui-rebrand-light-dark-mode.md (Cowork project doc) for the full
 * derivation of every value shown here.
 */
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { WsAiLoader, WsBadge, WsCard } from 'src/components/ui';

const $q = useQuasar();
const isProd = import.meta.env.PROD;

onMounted(() => {
  const isDark = localStorage.getItem('darkMode') === 'true';
  $q.dark.set(isDark);
});

function toggleDark() {
  $q.dark.toggle();
  localStorage.setItem('darkMode', $q.dark.isActive ? 'true' : 'false');
}

const privacyMode = ref(false);
const activeTab = ref('overview');

const neutralTokens = [
  { name: '--bg-page', hex: { light: '#F6F9F9', dark: '#151819' } },
  { name: '--bg-card', hex: { light: '#FDFEFE', dark: '#1F2323' } },
  { name: '--bg-card-soft', hex: { light: '#F0F5F4', dark: '#282E2E' } },
  { name: '--bg-subtle', hex: { light: '#F6F9F9', dark: '#101314' } },
  { name: '--border-color', hex: { light: '#DAE7E5', dark: '#394141' } },
  { name: '--text-primary', hex: { light: '#1B3636', dark: '#F4F6F5' } },
  { name: '--text-secondary', hex: { light: '#496565', dark: '#B7C2BF' } },
  { name: '--text-muted', hex: { light: '#789191', dark: '#7D8C89' } },
];

const accentScale = [
  { step: 50, hex: '#F4FAFA' },
  { step: 100, hex: '#E7F4F2' },
  { step: 200, hex: '#CDE5E2' },
  { step: 300, hex: '#B0D4CF' },
  { step: 400, hex: '#9BC5C0' },
  { step: 500, hex: '#85B6B0' },
  { step: 600, hex: '#64A6A0' },
  { step: 700, hex: '#4C8A87' },
  { step: 800, hex: '#336160' },
  { step: 900, hex: '#1B3636' },
];

const statusColors = [
  { name: 'positive', hex: '#21ba45' },
  { name: 'negative', hex: '#c10015' },
  { name: 'warning', hex: '#f2c037' },
  { name: 'info', hex: '#31ccec' },
];

const sampleRows = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 234.12, change: 1.84 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 128.55, change: -2.31 },
  { symbol: 'PTT', name: 'PTT PCL', price: 34.5, change: 0.0 },
];

const heatmapValues = [4.2, 2.1, 0.8, -0.5, -2.4, 1.1, -1.8, 3.6, 0.2, -0.9, 2.9, -3.3];
function heatmapColor(v: number) {
  if (v > 1) return 'rgba(33, 186, 69, 0.55)';
  if (v > 0) return 'rgba(33, 186, 69, 0.25)';
  if (v > -1) return 'rgba(193, 0, 21, 0.25)';
  return 'rgba(193, 0, 21, 0.55)';
}
</script>

<template>
  <q-page v-if="!isProd" class="preview-page q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <div>
        <div class="text-overline text-muted">DEV ONLY — /dev/design-preview</div>
        <h1 class="text-h4 text-weight-bold q-my-none" style="color: var(--text-primary)">
          Wisenancial — Design Token Preview
        </h1>
        <div class="text-body2" style="color: var(--text-secondary)">
          Rebrand 2026-08-17 · เทียบ Light/Dark ก่อนขึ้นเฟส B (roll out ทั้งแอป)
        </div>
      </div>
      <q-btn
        unelevated
        no-caps
        color="primary"
        :icon="$q.dark.isActive ? 'light_mode' : 'dark_mode'"
        :label="$q.dark.isActive ? 'Light mode' : 'Dark mode'"
        @click="toggleDark"
      />
    </div>

    <!-- ================= Color tokens ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">1. Neutral tokens (current theme)</h2>
      <div class="swatch-grid">
        <div v-for="t in neutralTokens" :key="t.name" class="swatch">
          <div
            class="swatch-color"
            :style="{ background: $q.dark.isActive ? t.hex.dark : t.hex.light, border: '1px solid var(--border-color)' }"
          />
          <div class="swatch-label">{{ t.name }}</div>
          <div class="swatch-hex">{{ $q.dark.isActive ? t.hex.dark : t.hex.light }}</div>
        </div>
      </div>

      <h2 class="text-h6 q-mt-lg q-mb-sm" style="color: var(--text-primary)">
        Accent scale (same in both themes)
      </h2>
      <div class="swatch-grid">
        <div v-for="a in accentScale" :key="a.step" class="swatch">
          <div class="swatch-color" :style="{ background: a.hex }" />
          <div class="swatch-label">accent-{{ a.step }}</div>
          <div class="swatch-hex">{{ a.hex }}</div>
        </div>
      </div>

      <h2 class="text-h6 q-mt-lg q-mb-sm" style="color: var(--text-primary)">Status colors (unchanged)</h2>
      <div class="swatch-grid">
        <div v-for="s in statusColors" :key="s.name" class="swatch">
          <div class="swatch-color" :style="{ background: s.hex }" />
          <div class="swatch-label">{{ s.name }}</div>
          <div class="swatch-hex">{{ s.hex }}</div>
        </div>
      </div>
    </section>

    <!-- ================= Typography ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">2. Typography</h2>
      <ws-card tone="solid" class="q-pa-md">
        <div class="text-h3" style="color: var(--text-primary)">Display / H1 — ยอดพอร์ตรวม 1,284,500 บาท</div>
        <div class="text-h5 q-mt-sm" style="color: var(--text-primary)">H2 — Stock Terminal</div>
        <div class="text-h6 q-mt-sm" style="color: var(--text-secondary)">H3 — สรุปผลตอบแทน</div>
        <div class="text-body1 q-mt-sm" style="color: var(--text-primary)">
          Body text ปกติ — Portfolio growth is calculated against the SET Index benchmark.
        </div>
        <div class="text-caption q-mt-sm" style="color: var(--text-muted)">
          Caption / eyebrow text — UPDATED 2 MIN AGO
        </div>
        <div class="q-mt-sm" style="font-family: 'JetBrains Mono', monospace; color: var(--text-primary)">
          ตัวเลขการเงิน (tabular mono): ฿1,284,500.00 · +2.34% · NVDA 128.55
        </div>
      </ws-card>
    </section>

    <!-- ================= Buttons ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">3. Buttons</h2>
      <div class="row q-gutter-sm items-center">
        <q-btn unelevated no-caps color="primary" label="Primary" icon="auto_awesome" />
        <q-btn outline no-caps color="primary" label="Secondary / outline" />
        <q-btn flat no-caps color="primary" label="Ghost / text" />
        <q-btn unelevated no-caps color="negative" label="Destructive" />
        <q-btn unelevated no-caps color="primary" label="Disabled" disable />
        <q-btn unelevated no-caps color="primary" label="Loading" loading />
      </div>
    </section>

    <!-- ================= Badges / chips ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">4. Badges &amp; chips</h2>
      <div class="row q-gutter-sm items-center">
        <ws-badge kind="ai" value="RECOMMENDED" />
        <ws-badge kind="ai" value="AVOID" />
        <ws-badge kind="ai" value="VOLATILE_UP" />
        <q-chip color="positive" text-color="white" label="+2.3% วันนี้" />
        <q-chip color="negative" text-color="white" label="-1.1% วันนี้" />
        <q-chip outline color="primary" label="Neutral tag" />
      </div>
    </section>

    <!-- ================= Cards ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">5. Cards</h2>
      <div class="row q-gutter-md">
        <ws-card tone="solid" class="col-grow" style="min-width: 260px">
          <template #header>
            <div class="text-subtitle1 text-weight-bold" style="color: var(--text-primary)">Surface card</div>
          </template>
          <div style="color: var(--text-secondary)">bg-card / border-color — เนื้อหาการ์ดทั่วไป</div>
        </ws-card>
        <ws-card tone="glass" class="col-grow" style="min-width: 260px">
          <template #header>
            <div class="text-subtitle1 text-weight-bold" style="color: var(--text-primary)">Glass card</div>
          </template>
          <div style="color: var(--text-secondary)">ใช้กับ hero/marketing เท่านั้น</div>
        </ws-card>
      </div>
    </section>

    <!-- ================= KPI grid ================= -->
    <section class="q-mb-xl">
      <div class="row items-center justify-between q-mb-sm">
        <h2 class="text-h6 q-my-none" style="color: var(--text-primary)">6. KPI cards</h2>
        <q-toggle v-model="privacyMode" label="Privacy mode" color="primary" />
      </div>
      <div class="row q-gutter-md">
        <ws-card v-for="kpi in ['มูลค่าพอร์ตรวม', 'กำไร/ขาดทุนวันนี้', 'กำไร/ขาดทุนรวม']" :key="kpi" tone="solid" style="min-width: 220px">
          <div class="text-caption" style="color: var(--text-muted)">{{ kpi }}</div>
          <div class="text-h5 text-weight-bold q-mt-xs" style="color: var(--text-primary)">
            {{ privacyMode ? '***' : '฿1,284,500' }}
          </div>
          <div class="text-caption q-mt-xs" style="color: #21ba45">
            <q-icon name="arrow_upward" size="14px" /> {{ privacyMode ? '***' : '+2.34%' }}
          </div>
        </ws-card>
      </div>
    </section>

    <!-- ================= Table ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">7. Data table</h2>
      <ws-card tone="solid" :padded="false">
        <table class="preview-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th class="text-right">Price</th>
              <th class="text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sampleRows" :key="row.symbol">
              <td class="mono">{{ row.symbol }}</td>
              <td>{{ row.name }}</td>
              <td class="text-right mono">{{ row.price.toFixed(2) }}</td>
              <td
                class="text-right mono"
                :style="{ color: row.change > 0 ? '#21ba45' : row.change < 0 ? '#c10015' : 'var(--text-muted)' }"
              >
                {{ row.change > 0 ? '+' : '' }}{{ row.change.toFixed(2) }}%
              </td>
            </tr>
          </tbody>
        </table>
      </ws-card>
    </section>

    <!-- ================= Tabs ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">8. Tabs</h2>
      <q-tabs v-model="activeTab" active-color="primary" indicator-color="primary" align="left" no-caps>
        <q-tab name="overview" label="Overview" />
        <q-tab name="ai" label="AI Insights" />
        <q-tab name="planning" label="Planning &amp; Tools" />
      </q-tabs>
      <q-separator />
    </section>

    <!-- ================= Empty / loading / error ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">9. Empty / loading / error states</h2>
      <div class="row q-gutter-md">
        <ws-card tone="solid" class="state-card">
          <q-icon name="inbox" size="40px" style="color: var(--text-muted)" />
          <div class="text-subtitle1 q-mt-sm" style="color: var(--text-primary)">ยังไม่มีข้อมูล</div>
          <div class="text-caption" style="color: var(--text-secondary)">เริ่มต้นโดยการสร้างพอร์ตแรกของคุณ</div>
          <q-btn unelevated no-caps color="primary" label="สร้างพอร์ต" class="q-mt-sm" />
        </ws-card>
        <ws-card tone="solid" class="state-card">
          <q-spinner-dots color="primary" size="40px" />
          <div class="text-subtitle1 q-mt-sm" style="color: var(--text-primary)">กำลังโหลด...</div>
        </ws-card>
        <ws-card tone="solid" class="state-card">
          <q-icon name="error_outline" size="40px" color="negative" />
          <div class="text-subtitle1 q-mt-sm" style="color: var(--text-primary)">โหลดข้อมูลไม่สำเร็จ</div>
          <q-btn flat no-caps color="primary" label="ลองใหม่" class="q-mt-sm" />
        </ws-card>
      </div>
    </section>

    <!-- ================= AI loader ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">10. AI loader (WsAiLoader, 3 accents)</h2>
      <div class="row q-gutter-md">
        <ws-card tone="solid" class="state-card">
          <ws-ai-loader accent="primary" compact />
        </ws-card>
        <ws-card tone="solid" class="state-card">
          <ws-ai-loader accent="warning" compact />
        </ws-card>
        <ws-card tone="solid" class="state-card">
          <ws-ai-loader accent="negative" compact />
        </ws-card>
      </div>
    </section>

    <!-- ================= Gauge ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">11. Risk gauge (0-100)</h2>
      <div
        class="gauge"
        style="background: conic-gradient(#21ba45 0deg 90deg, #f2c037 90deg 216deg, #c10015 216deg 360deg)"
      >
        <div class="gauge-inner">
          <div class="text-h5 text-weight-bold" style="color: var(--text-primary)">62</div>
          <div class="text-caption" style="color: var(--text-muted)">Risk score</div>
        </div>
      </div>
    </section>

    <!-- ================= Heatmap ================= -->
    <section class="q-mb-xl">
      <h2 class="text-h6 q-mb-sm" style="color: var(--text-primary)">12. Heatmap tiles</h2>
      <div class="heatmap-grid">
        <div v-for="(v, i) in heatmapValues" :key="i" class="heatmap-tile" :style="{ background: heatmapColor(v) }">
          {{ v > 0 ? '+' : '' }}{{ v.toFixed(1) }}%
        </div>
      </div>
    </section>
  </q-page>

  <q-page v-else class="flex flex-center">
    <div class="text-h6">Not available in production build.</div>
  </q-page>
</template>

<style scoped>
.preview-page {
  background: var(--bg-page);
  min-height: 100vh;
}

.swatch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.swatch-color {
  width: 100%;
  height: 56px;
  border-radius: 10px;
}

.swatch-label {
  font-size: 12px;
  font-weight: 600;
  margin-top: 4px;
  color: var(--text-primary);
}

.swatch-hex {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted);
}

.state-card {
  min-width: 220px;
  text-align: center;
  padding: 24px 16px;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
}

.preview-table th {
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 11px;
  color: var(--text-muted);
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
}

.preview-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
}

.preview-table .mono {
  font-family: 'JetBrains Mono', monospace;
}

.gauge {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gauge-inner {
  width: 108px;
  height: 108px;
  border-radius: 50%;
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.heatmap-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 6px;
}

.heatmap-tile {
  height: 56px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}
</style>

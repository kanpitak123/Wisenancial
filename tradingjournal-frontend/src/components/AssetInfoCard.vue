<script setup lang="ts">
type CardVariant = 'positive' | 'negative' | 'primary' | 'warning';

interface AssetCardItem {
  id: string | number;
  symbol: string;
  name?: string | null;
  currentPrice: number;
  pastPrice: number;
  growthPercent: number;
}

const props = defineProps<{
  coin: AssetCardItem;
  variant: CardVariant;
}>();

const emit = defineEmits<{
  select: [symbol: string];
}>();

const formatPrice = (value: number) => {
  if (!Number.isFinite(value)) return '—';

  const absoluteValue = Math.abs(value);
  let maximumFractionDigits = 2;

  if (absoluteValue > 0 && absoluteValue < 0.01) {
    maximumFractionDigits = 8;
  } else if (absoluteValue < 1) {
    maximumFractionDigits = 4;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value);
};

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return '—';

  const formattedValue = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

  return `${value > 0 ? '+' : ''}${formattedValue}%`;
};

const getTrendIcon = (value: number) => {
  if (value > 0) return 'trending_up';
  if (value < 0) return 'trending_down';
  return 'trending_flat';
};

const getTrendClass = (value: number) => {
  if (value > 0) return 'trend-positive';
  if (value < 0) return 'trend-negative';
  return 'trend-neutral';
};

const handleSelect = () => {
  emit('select', props.coin.symbol);
};
</script>

<template>
  <q-card
    :class="['asset-card', `asset-card--${variant}`]"
    role="button"
    tabindex="0"
    @click="handleSelect"
    @keyup.enter="handleSelect"
    @keyup.space.prevent="handleSelect"
  >
    <q-card-section class="asset-card__content">
      <div class="asset-card__header">
        <div class="asset-identity">
          <div :class="['asset-logo', `asset-logo--${variant}`]">
            {{ coin.symbol.substring(0, 2).toUpperCase() }}
          </div>

          <div class="asset-identity__text">
            <div class="asset-symbol">{{ coin.symbol }}</div>
            <div class="asset-name">{{ coin.name || 'Unknown asset' }}</div>
          </div>
        </div>

        <q-icon name="chevron_right" class="open-icon" size="22px" />
      </div>

      <div class="price-block">
        <div class="price-label">Current price</div>
        <div class="current-price">{{ formatPrice(coin.currentPrice) }}</div>
      </div>

      <div class="asset-card__footer">
        <div class="previous-price">
          <span class="metric-label">Previous price</span>
          <strong>{{ formatPrice(coin.pastPrice) }}</strong>
        </div>

        <div :class="['trend-pill', getTrendClass(coin.growthPercent)]">
          <q-icon :name="getTrendIcon(coin.growthPercent)" size="16px" />
          <span>{{ formatPercent(coin.growthPercent) }}</span>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.asset-card {
  --card-background: #ffffff;
  --card-soft-background: #f8fafc;
  --card-text: #172033;
  --card-muted: #6b778c;
  --card-border: #e3e8f1;
  --card-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
  --card-shadow-hover: 0 18px 40px rgba(15, 23, 42, 0.12);

  position: relative;
  flex: 0 0 340px;
  width: 340px;
  min-width: 340px;
  min-height: 220px;
  overflow: hidden;
  color: var(--card-text);
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 22px;
  box-shadow: var(--card-shadow);
  scroll-snap-align: start;
  user-select: none;
  cursor: pointer;
  outline: none;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
}

.body--dark .asset-card {
  --card-background: #141d2e;
  --card-soft-background: #101827;
  --card-text: #f8fafc;
  --card-muted: #94a3b8;
  --card-border: #26334a;
  --card-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);
  --card-shadow-hover: 0 18px 42px rgba(0, 0, 0, 0.32);
}

.asset-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 4px;
}

.asset-card--positive::before {
  background: #10b981;
}

.asset-card--negative::before {
  background: #ef4444;
}

.asset-card--primary::before {
  background: #3b82f6;
}

.asset-card--warning::before {
  background: #f59e0b;
}

.asset-card:hover,
.asset-card:focus-visible {
  transform: translateY(-4px);
  border-color: rgba(100, 116, 139, 0.48);
  box-shadow: var(--card-shadow-hover);
}

.asset-card:focus-visible {
  box-shadow:
    0 0 0 3px rgba(59, 130, 246, 0.18),
    var(--card-shadow-hover);
}

.asset-card__content {
  min-height: 220px;
  padding: 22px;
  display: flex;
  flex-direction: column;
}

.asset-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.asset-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.asset-identity__text {
  min-width: 0;
}

.asset-logo {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  color: #ffffff;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.3px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.asset-logo--positive {
  background: linear-gradient(145deg, #10b981, #047857);
}

.asset-logo--negative {
  background: linear-gradient(145deg, #ef4444, #b91c1c);
}

.asset-logo--primary {
  background: linear-gradient(145deg, #3b82f6, #1d4ed8);
}

.asset-logo--warning {
  background: linear-gradient(145deg, #f59e0b, #d97706);
}

.asset-symbol {
  overflow: hidden;
  color: var(--card-text);
  font-size: 17px;
  font-weight: 800;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-name {
  max-width: 205px;
  margin-top: 3px;
  overflow: hidden;
  color: var(--card-muted);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.open-icon {
  flex: 0 0 auto;
  color: var(--card-muted);
  opacity: 0.75;
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}

.asset-card:hover .open-icon,
.asset-card:focus-visible .open-icon {
  transform: translateX(2px);
  opacity: 1;
}

.price-block {
  margin-top: 24px;
}

.price-label,
.metric-label {
  display: block;
  color: var(--card-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.35px;
  line-height: 1.3;
  text-transform: uppercase;
}

.current-price {
  margin-top: 5px;
  overflow: hidden;
  color: var(--card-text);
  font-size: clamp(25px, 2.1vw, 30px);
  font-weight: 850;
  letter-spacing: -0.75px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-card__footer {
  margin-top: auto;
  padding-top: 18px;
  border-top: 1px solid var(--card-border);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
}

.previous-price {
  min-width: 0;
}

.previous-price strong {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: var(--card-text);
  font-size: 14px;
  font-weight: 750;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trend-pill {
  min-width: 86px;
  min-height: 34px;
  padding: 7px 10px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.trend-positive {
  color: #047857;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.trend-negative {
  color: #b91c1c;
  background: rgba(239, 68, 68, 0.11);
  border: 1px solid rgba(239, 68, 68, 0.18);
}

.trend-neutral {
  color: var(--card-muted);
  background: var(--card-soft-background);
  border: 1px solid var(--card-border);
}

@media (max-width: 700px) {
  .asset-card {
    flex-basis: calc(100vw - 48px);
    width: calc(100vw - 48px);
    min-width: calc(100vw - 48px);
    max-width: 340px;
  }

  .asset-name {
    max-width: calc(100vw - 190px);
  }
}

@media (max-width: 390px) {
  .asset-card__content {
    padding: 19px;
  }

  .current-price {
    font-size: 24px;
  }

  .trend-pill {
    min-width: 80px;
    padding-inline: 8px;
  }
}
</style>

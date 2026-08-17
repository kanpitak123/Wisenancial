/**
 * ฟีด AI stock-recommendations ของหน้า Watchlist (ต้นฉบับคือหน้า StockRadar)
 *
 * ไม่ได้สร้าง endpoint ใหม่ — GET /stocks/radar กับ stocksService.getRadar() มีอยู่แล้วและ
 * ทำงานได้ ตัวนี้แค่ถือ state + ตัวกรองรายหมวดให้หน้า Watchlist เรียกใช้
 *
 * ตัวกรองแยกกันคนละชุดระหว่าง Upside/Downside โดยตั้งใจ — ผู้ใช้กรอง Upside แล้ว Downside
 * ต้องไม่ถูกกรองตาม ส่วน Near/Not-recommended ไม่มีตัวกรองเลย (ต้นฉบับใช้ปุ่มดูทั้งหมดแทน)
 */
import { defineStore } from 'pinia';
import { stocksService } from 'src/services/stocks.service';
import type { RadarCategory, RadarDateBucket, RadarStock } from 'src/services/stocks.service';
import type { StockSector } from 'src/types/stocks.types';

export type { RadarCategory, RadarDateBucket, RadarStock };

/** ชุดตัวกรองของ section เดียว (Upside กับ Downside ถือคนละชุด) */
export interface SectionFilters {
  sector: StockSector | 'ALL';
  dateBucket: RadarDateBucket | 'ALL';
  /** กรองด้วย "ขนาด" ของการเปลี่ยนแปลง จึงเทียบกับค่าสัมบูรณ์ — ฝั่ง Downside เป็นลบทั้งหมด */
  minChangeMagnitude: number;
}

const EMPTY_FILTERS = (): SectionFilters => ({
  sector: 'ALL',
  dateBucket: 'ALL',
  minChangeMagnitude: 0,
});

function filterSection(
  list: RadarStock[],
  category: RadarCategory,
  filters: SectionFilters,
): RadarStock[] {
  return list.filter((rec) => {
    if (rec.category !== category) return false;
    if (filters.sector !== 'ALL' && rec.sector !== filters.sector) return false;
    if (filters.dateBucket !== 'ALL' && rec.dateBucket !== filters.dateBucket) return false;
    if (Math.abs(rec.returnPercent) < filters.minChangeMagnitude) return false;
    return true;
  });
}

export const useAiRecommendationsStore = defineStore('aiRecommendations', {
  state: () => ({
    recommendations: [] as RadarStock[],
    loading: false,
    error: null as string | null,
    loaded: false,
    upsideFilters: EMPTY_FILTERS(),
    downsideFilters: EMPTY_FILTERS(),
  }),

  getters: {
    upsideSection(state): RadarStock[] {
      return filterSection(state.recommendations, 'Upside', state.upsideFilters);
    },

    downsideSection(state): RadarStock[] {
      return filterSection(state.recommendations, 'Downside', state.downsideFilters);
    },

    /** ไม่ถูกกรอง — section นี้ไม่มีแถวตัวกรอง */
    nearRecommendedSection(state): RadarStock[] {
      return state.recommendations.filter((rec) => rec.category === 'Near-recommended');
    },

    /** ไม่ถูกกรอง — section นี้ไม่มีแถวตัวกรอง */
    notRecommendedSection(state): RadarStock[] {
      return state.recommendations.filter((rec) => rec.category === 'Not-recommended');
    },
  },

  actions: {
    async loadRecommendations(force = false): Promise<void> {
      if (this.loading) return;
      if (this.loaded && !force) return;

      this.loading = true;
      this.error = null;

      try {
        this.recommendations = await stocksService.getRadar();
        this.loaded = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'โหลดคำแนะนำจาก AI ไม่สำเร็จ';
        this.recommendations = [];
      } finally {
        this.loading = false;
      }
    },

    setUpsideSector(sector: StockSector | 'ALL') {
      this.upsideFilters.sector = sector;
    },
    setUpsideDateBucket(dateBucket: RadarDateBucket | 'ALL') {
      this.upsideFilters.dateBucket = dateBucket;
    },
    setUpsideMinChange(value: number) {
      this.upsideFilters.minChangeMagnitude = value;
    },
    setDownsideSector(sector: StockSector | 'ALL') {
      this.downsideFilters.sector = sector;
    },
    setDownsideDateBucket(dateBucket: RadarDateBucket | 'ALL') {
      this.downsideFilters.dateBucket = dateBucket;
    },
    setDownsideMinChange(value: number) {
      this.downsideFilters.minChangeMagnitude = value;
    },
  },
});

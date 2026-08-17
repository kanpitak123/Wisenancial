import { ref } from 'vue';
import { api } from 'boot/axios';

/**
 * รายชื่อหุ้นสำหรับช่องค้นหา — โหลดครั้งเดียวแล้วใช้ร่วมกันทุกหน้า
 *
 * แคชไว้ระดับโมดูล เพราะหน้า/การ์ดหลายตัวเปิดพร้อมกันได้ (เทอร์มินัล, DCA, หน้าบันทึกซื้อ)
 * ถ้าต่างคนต่างโหลดจะยิง GET /stocks ซ้ำโดยไม่จำเป็น
 */
export interface StockCatalogItem {
  symbol: string;
  name: string;
  sector?: string | null;
}

/**
 * ใช้ตอน /stocks ตอบว่างหรือยิงไม่ผ่าน — ช่องค้นหาที่ว่างเปล่าสนิทใช้งานไม่ได้เลย
 * อย่างน้อยต้องพิมพ์หุ้นยอดนิยมได้
 */
export const STOCK_CATALOG_FALLBACK: StockCatalogItem[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', sector: 'Consumer' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Finance' },
  { symbol: 'META', name: 'Meta Platforms, Inc.', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', sector: 'Consumer' },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Finance' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
];

const catalog = ref<StockCatalogItem[]>([]);
const loading = ref(false);
/** กันยิงซ้ำตอนหลายคอมโพเนนต์ mount พร้อมกัน — ทุกตัวรอ promise ก้อนเดียวกัน */
let inFlight: Promise<StockCatalogItem[]> | null = null;

async function load(): Promise<StockCatalogItem[]> {
  if (catalog.value.length > 0) return catalog.value;
  if (inFlight) return inFlight;

  loading.value = true;

  inFlight = api
    .get<StockCatalogItem[]>('/stocks')
    .then((response) => {
      // /stocks อ่านจากตาราง stocks ถ้ายังไม่ได้ seed มันตอบ 200 พร้อม [] ไม่ใช่ throw
      catalog.value =
        Array.isArray(response.data) && response.data.length > 0
          ? response.data
          : STOCK_CATALOG_FALLBACK;

      return catalog.value;
    })
    .catch(() => {
      catalog.value = STOCK_CATALOG_FALLBACK;
      return catalog.value;
    })
    .finally(() => {
      loading.value = false;
      inFlight = null;
    });

  return inFlight;
}

/**
 * ค้นหาได้ทั้งสัญลักษณ์และชื่อบริษัทเต็ม
 *
 * เรียงผลลัพธ์ให้ตัวที่ "ขึ้นต้นด้วย" คำค้นมาก่อนตัวที่แค่ "มีคำค้นอยู่ข้างใน"
 * พิมพ์ "AP" จึงได้ AAPL ก่อน ไม่ใช่หุ้นที่บังเอิญมี ap อยู่กลางชื่อ
 */
export function searchStockCatalog(
  items: StockCatalogItem[],
  query: string,
  limit = 20,
): StockCatalogItem[] {
  const needle = query.trim().toUpperCase();

  if (!needle) return [];

  const scored: { item: StockCatalogItem; score: number }[] = [];

  for (const item of items) {
    const symbol = item.symbol.toUpperCase();
    const name = (item.name ?? '').toUpperCase();

    let score = -1;

    if (symbol.startsWith(needle)) score = 0;
    else if (name.startsWith(needle)) score = 1;
    else if (symbol.includes(needle)) score = 2;
    else if (name.includes(needle)) score = 3;

    if (score >= 0) scored.push({ item, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.item.symbol.localeCompare(b.item.symbol))
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function useStockCatalog() {
  return { catalog, loading, load, search: searchStockCatalog };
}

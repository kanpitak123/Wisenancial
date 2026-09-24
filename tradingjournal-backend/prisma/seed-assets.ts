/**
 * Seed รายชื่อ Asset (universe) ของฝั่ง Trader/Forex — ตาราง `assets` เป็น catalog กลาง
 * ไม่มี user_id/portfolio_id ผูกอยู่ (ดู schema.prisma) แต่ไม่เคยมี seed มาก่อนเลยตั้งแต่
 * สร้างตารางนี้ขึ้นมา — ไม่มี path เขียนข้อมูลใน AssetsService (มีแต่ findMany/findFirst)
 * และไม่เจอ seed/fixture ของ assets ทั้งในโปรเจกต์เดิมและใน git history ของ repo นี้
 *
 * ตารางนี้ว่าง = AssetExplorerPage (โหมด Trader) ไม่มี symbol ให้เลือกเลย ทั้งที่
 * AssetsService.toYahooTraderSymbol มี symbol map ไว้รองรับอยู่แล้ว 14 ตัว — ใช้ชุดเดียวกัน
 * ตรงนี้เพื่อให้ catalog กับ symbol-mapping ตรงกัน
 *
 * รันด้วย: npm run db:seed:assets (หรือ npm run db:seed ที่รวม stocks/missions/assets)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AssetSeed {
  symbol: string;
  name: string;
  asset_type: 'CRYPTO' | 'FOREX' | 'INDICES';
}

// ตรงกับ symbolMap ใน AssetsService.toYahooTraderSymbol (assets.service.ts)
const assetUniverse: AssetSeed[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin', asset_type: 'CRYPTO' },
  { symbol: 'ETH/USD', name: 'Ethereum', asset_type: 'CRYPTO' },
  { symbol: 'BNB/USD', name: 'BNB', asset_type: 'CRYPTO' },
  { symbol: 'SOL/USD', name: 'Solana', asset_type: 'CRYPTO' },
  { symbol: 'XRP/USD', name: 'XRP', asset_type: 'CRYPTO' },
  { symbol: 'DOGE/USD', name: 'Dogecoin', asset_type: 'CRYPTO' },
  { symbol: 'XAU/USD', name: 'Gold', asset_type: 'FOREX' },
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', asset_type: 'FOREX' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', asset_type: 'FOREX' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', asset_type: 'FOREX' },
  { symbol: 'USD/CHF', name: 'US Dollar / Swiss Franc', asset_type: 'FOREX' },
  { symbol: 'US30', name: 'Dow Jones Industrial Average', asset_type: 'INDICES' },
  { symbol: 'NAS100', name: 'Nasdaq 100', asset_type: 'INDICES' },
  { symbol: 'SPX500', name: 'S&P 500', asset_type: 'INDICES' },
];

export async function seedAssets(prismaClient: PrismaClient = prisma) {
  let created = 0;
  let updated = 0;

  // upsert แทน create เฉยๆ — รันซ้ำได้โดยไม่สร้างซ้ำ/error ถ้ารันสอง environment
  for (const asset of assetUniverse) {
    const before = await prismaClient.assets.findUnique({
      where: { symbol: asset.symbol },
      select: { id: true },
    });

    await prismaClient.assets.upsert({
      where: { symbol: asset.symbol },
      update: {
        name: asset.name,
        asset_type: asset.asset_type,
      },
      create: asset,
    });

    if (before) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return { total: assetUniverse.length, created, updated };
}

if (require.main === module) {
  seedAssets()
    .then((result) => {
      console.log(
        `Seeded assets: ${result.total} symbols (created ${result.created}, updated ${result.updated})`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

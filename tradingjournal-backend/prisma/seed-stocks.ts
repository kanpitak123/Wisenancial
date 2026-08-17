/**
 * Seed รายชื่อหุ้น (universe) ที่ทั้งระบบใช้อ้างอิง
 *
 * ยกมาจากโปรเจกต์เดิม (TradingJournal-Backend/prisma/seed-stocks.ts) แบบตรงตัว
 * model `stocks` ของ Wisenancial เป็น superset ของเดิม (เพิ่ม industry/currency/country
 * ที่ nullable ทั้งหมด) เลยใช้ข้อมูลชุดเดิมได้โดยไม่ต้องแตะ schema
 *
 * ตารางนี้ว่าง = /stocks คืน [] -> ช่องค้นหาหุ้นใน StockAnalysis ไม่มีอะไรให้เลือก
 * และ /stocks/listing ต้องถอยไปใช้ fallback list สั้นๆ ที่ hardcode ไว้ในโค้ด
 *
 * รันด้วย: npm run db:seed:stocks (หรือ npm run db:seed ที่รันทั้งหุ้นและ missions)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface StockSeed {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
}

// Popular stocks data from the hardcoded list
const stockUniverse: StockSeed[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', sector: 'Automotive', exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', sector: 'Consumer Discretionary', exchange: 'NASDAQ' },
  { symbol: 'META', name: 'Meta Platforms, Inc.', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Staples', exchange: 'NYSE' },
  { symbol: 'PG', name: 'Procter & Gamble Co.', sector: 'Consumer Staples', exchange: 'NYSE' },
  { symbol: 'UNH', name: 'UnitedHealth Group Incorporated', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'HD', name: 'The Home Depot, Inc.', sector: 'Consumer Discretionary', exchange: 'NYSE' },
  { symbol: 'BAC', name: 'Bank of America Corporation', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', sector: 'Energy', exchange: 'NYSE' },
  { symbol: 'CVX', name: 'Chevron Corporation', sector: 'Energy', exchange: 'NYSE' },
  { symbol: 'LLY', name: 'Eli Lilly and Company', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'T', name: 'AT&T Inc.', sector: 'Communication Services', exchange: 'NYSE' },
  { symbol: 'CRM', name: 'Salesforce, Inc.', sector: 'Technology', exchange: 'NYSE' },
  { symbol: 'ACN', name: 'Accenture plc', sector: 'Technology', exchange: 'NYSE' },
  { symbol: 'MRK', name: 'Merck & Co., Inc.', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'KO', name: 'The Coca-Cola Company', sector: 'Consumer Staples', exchange: 'NYSE' },
  { symbol: 'PEP', name: 'PepsiCo, Inc.', sector: 'Consumer Staples', exchange: 'NASDAQ' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', sector: 'Consumer Staples', exchange: 'NASDAQ' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'WFC', name: 'Wells Fargo & Company', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'MCD', name: "McDonald's Corporation", sector: 'Consumer Discretionary', exchange: 'NYSE' },
  { symbol: 'CSCO', name: 'Cisco Systems, Inc.', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'INTC', name: 'Intel Corporation', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'HON', name: 'Honeywell International Inc.', sector: 'Industrials', exchange: 'NASDAQ' },
  { symbol: 'TXN', name: 'Texas Instruments Incorporated', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'NEE', name: 'NextEra Energy, Inc.', sector: 'Utilities', exchange: 'NYSE' },
  { symbol: 'AMAT', name: 'Applied Materials, Inc.', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'QCOM', name: 'QUALCOMM Incorporated', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'TMUS', name: 'T-Mobile US, Inc.', sector: 'Communication Services', exchange: 'NASDAQ' },
  { symbol: 'SAP', name: 'SAP SE', sector: 'Technology', exchange: 'NYSE' },
  { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials', exchange: 'NYSE' },
  { symbol: 'GE', name: 'General Electric Company', sector: 'Industrials', exchange: 'NYSE' },
  { symbol: 'BA', name: 'The Boeing Company', sector: 'Industrials', exchange: 'NYSE' },
  { symbol: 'DIS', name: 'The Walt Disney Company', sector: 'Communication Services', exchange: 'NYSE' },
  { symbol: 'NFLX', name: 'Netflix, Inc.', sector: 'Communication Services', exchange: 'NASDAQ' },
  { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'CMCSA', name: 'Comcast Corporation', sector: 'Communication Services', exchange: 'NASDAQ' },
  { symbol: 'NKE', name: 'NIKE, Inc.', sector: 'Consumer Discretionary', exchange: 'NYSE' },
  { symbol: 'VZ', name: 'Verizon Communications Inc.', sector: 'Communication Services', exchange: 'NYSE' },
  { symbol: 'SPGI', name: 'S&P Global Inc.', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'RTX', name: 'Raytheon Technologies Corporation', sector: 'Industrials', exchange: 'NYSE' },
  { symbol: 'UPS', name: 'United Parcel Service, Inc.', sector: 'Industrials', exchange: 'NYSE' },
  { symbol: 'LOW', name: "Lowe's Companies, Inc.", sector: 'Consumer Discretionary', exchange: 'NYSE' },
  { symbol: 'MAR', name: 'Marriott International', sector: 'Consumer Discretionary', exchange: 'NASDAQ' },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'ORCL', name: 'Oracle Corporation', sector: 'Technology', exchange: 'NYSE' },
  { symbol: 'ABT', name: 'Abbott Laboratories', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'DHR', name: 'Danaher Corporation', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'IBM', name: 'International Business Machines', sector: 'Technology', exchange: 'NYSE' },
  { symbol: 'NOW', name: 'ServiceNow, Inc.', sector: 'Technology', exchange: 'NYSE' },
  { symbol: 'CVS', name: 'CVS Health Corporation', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'MDT', name: 'Medtronic plc', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'ISRG', name: 'Intuitive Surgical, Inc.', sector: 'Healthcare', exchange: 'NASDAQ' },
  { symbol: 'GS', name: 'The Goldman Sachs Group, Inc.', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'AMGN', name: 'Amgen Inc.', sector: 'Healthcare', exchange: 'NASDAQ' },
  { symbol: 'SYY', name: 'Sysco Corporation', sector: 'Consumer Staples', exchange: 'NYSE' },
  { symbol: 'PLD', name: 'Prologis, Inc.', sector: 'Real Estate', exchange: 'NYSE' },
  { symbol: 'ADP', name: 'Automatic Data Processing, Inc.', sector: 'Technology', exchange: 'NASDAQ' },
  { symbol: 'CB', name: 'Chubb Limited', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'MO', name: 'Altria Group, Inc.', sector: 'Consumer Staples', exchange: 'NYSE' },
  { symbol: 'DE', name: 'Deere & Company', sector: 'Industrials', exchange: 'NYSE' },
  { symbol: 'ICE', name: 'Intercontinental Exchange, Inc.', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'CI', name: 'The Cigna Group', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'EL', name: 'Estée Lauder Companies Inc.', sector: 'Consumer Staples', exchange: 'NYSE' },
  { symbol: 'SLB', name: 'Schlumberger Limited', sector: 'Energy', exchange: 'NYSE' },
  { symbol: 'NOC', name: 'Northrop Grumman Corporation', sector: 'Industrials', exchange: 'NYSE' },
  { symbol: 'DUK', name: 'Duke Energy Corporation', sector: 'Utilities', exchange: 'NYSE' },
  { symbol: 'SO', name: 'The Southern Company', sector: 'Utilities', exchange: 'NYSE' },
  { symbol: 'EOG', name: 'EOG Resources, Inc.', sector: 'Energy', exchange: 'NYSE' },
  { symbol: 'FDX', name: 'FedEx Corporation', sector: 'Industrials', exchange: 'NYSE' },
  { symbol: 'AXP', name: 'American Express Company', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'Energy', exchange: 'NYSE' },
  { symbol: 'USB', name: 'U.S. Bancorp', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'LMT', name: 'Lockheed Martin Corporation', sector: 'Industrials', exchange: 'NYSE' },
  { symbol: 'GM', name: 'General Motors Company', sector: 'Consumer Discretionary', exchange: 'NYSE' },
  { symbol: 'C', name: 'Citigroup Inc.', sector: 'Financials', exchange: 'NYSE' },
  { symbol: 'CL', name: 'Colgate-Palmolive Company', sector: 'Consumer Staples', exchange: 'NYSE' },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'HUM', name: 'Humana Inc.', sector: 'Healthcare', exchange: 'NYSE' },
  { symbol: 'KMB', name: 'Kimberly-Clark Corporation', sector: 'Consumer Staples', exchange: 'NYSE' },
  { symbol: 'WBA', name: 'Walgreens Boots Alliance, Inc.', sector: 'Consumer Staples', exchange: 'NASDAQ' },
  { symbol: 'MPC', name: 'Marathon Petroleum Corporation', sector: 'Energy', exchange: 'NYSE' },
  { symbol: 'KMI', name: 'Kinder Morgan, Inc.', sector: 'Energy', exchange: 'NYSE' },
  { symbol: 'K', name: 'Kellogg Company', sector: 'Consumer Staples', exchange: 'NYSE' },
  { symbol: 'OXY', name: 'Occidental Petroleum Corporation', sector: 'Energy', exchange: 'NYSE' },
  { symbol: 'PSX', name: 'Phillips 66', sector: 'Energy', exchange: 'NYSE' },

  // ---- Thai stocks (SET) — symbols carry the .BK suffix Yahoo Finance uses ----
  { symbol: 'PTT.BK', name: 'PTT PCL', sector: 'Energy', exchange: 'SET' },
  { symbol: 'PTTEP.BK', name: 'PTT Exploration & Production', sector: 'Energy', exchange: 'SET' },
  { symbol: 'PTTGC.BK', name: 'PTT Global Chemical', sector: 'Materials', exchange: 'SET' },
  { symbol: 'TOP.BK', name: 'Thai Oil', sector: 'Energy', exchange: 'SET' },
  { symbol: 'IRPC.BK', name: 'IRPC PCL', sector: 'Energy', exchange: 'SET' },
  { symbol: 'BCP.BK', name: 'Bangchak Corporation', sector: 'Energy', exchange: 'SET' },
  { symbol: 'GULF.BK', name: 'Gulf Energy Development', sector: 'Energy', exchange: 'SET' },
  { symbol: 'GPSC.BK', name: 'Global Power Synergy', sector: 'Utilities', exchange: 'SET' },
  { symbol: 'EGCO.BK', name: 'Electricity Generating', sector: 'Utilities', exchange: 'SET' },
  { symbol: 'RATCH.BK', name: 'Ratch Group', sector: 'Utilities', exchange: 'SET' },
  { symbol: 'BGRIM.BK', name: 'B.Grimm Power', sector: 'Utilities', exchange: 'SET' },
  { symbol: 'KBANK.BK', name: 'Kasikornbank', sector: 'Financials', exchange: 'SET' },
  { symbol: 'SCB.BK', name: 'SCB X', sector: 'Financials', exchange: 'SET' },
  { symbol: 'BBL.BK', name: 'Bangkok Bank', sector: 'Financials', exchange: 'SET' },
  { symbol: 'KTB.BK', name: 'Krung Thai Bank', sector: 'Financials', exchange: 'SET' },
  { symbol: 'TTB.BK', name: 'TMBThanachart Bank', sector: 'Financials', exchange: 'SET' },
  { symbol: 'BAY.BK', name: 'Bank of Ayudhya', sector: 'Financials', exchange: 'SET' },
  { symbol: 'TISCO.BK', name: 'Tisco Financial Group', sector: 'Financials', exchange: 'SET' },
  { symbol: 'KKP.BK', name: 'Kiatnakin Phatra Bank', sector: 'Financials', exchange: 'SET' },
  { symbol: 'AOT.BK', name: 'Airports of Thailand', sector: 'Industrials', exchange: 'SET' },
  { symbol: 'BEM.BK', name: 'Bangkok Expressway and Metro', sector: 'Industrials', exchange: 'SET' },
  { symbol: 'BTS.BK', name: 'BTS Group Holdings', sector: 'Industrials', exchange: 'SET' },
  { symbol: 'DELTA.BK', name: 'Delta Electronics (Thailand)', sector: 'Technology', exchange: 'SET' },
  { symbol: 'HANA.BK', name: 'Hana Microelectronics', sector: 'Technology', exchange: 'SET' },
  { symbol: 'KCE.BK', name: 'KCE Electronics', sector: 'Technology', exchange: 'SET' },
  { symbol: 'ADVANC.BK', name: 'Advanced Info Service', sector: 'Communication Services', exchange: 'SET' },
  { symbol: 'INTUCH.BK', name: 'Intouch Holdings', sector: 'Communication Services', exchange: 'SET' },
  { symbol: 'TRUE.BK', name: 'True Corporation', sector: 'Communication Services', exchange: 'SET' },
  { symbol: 'CPALL.BK', name: 'CP All', sector: 'Consumer Staples', exchange: 'SET' },
  { symbol: 'CPF.BK', name: 'Charoen Pokphand Foods', sector: 'Consumer Staples', exchange: 'SET' },
  { symbol: 'CPN.BK', name: 'Central Pattana', sector: 'Real Estate', exchange: 'SET' },
  { symbol: 'CRC.BK', name: 'Central Retail Corporation', sector: 'Consumer Discretionary', exchange: 'SET' },
  { symbol: 'HMPRO.BK', name: 'Home Product Center', sector: 'Consumer Discretionary', exchange: 'SET' },
  { symbol: 'BJC.BK', name: 'Berli Jucker', sector: 'Consumer Staples', exchange: 'SET' },
  { symbol: 'MAKRO.BK', name: 'CP Axtra', sector: 'Consumer Staples', exchange: 'SET' },
  { symbol: 'OSP.BK', name: 'Osotspa', sector: 'Consumer Staples', exchange: 'SET' },
  { symbol: 'CBG.BK', name: 'Carabao Group', sector: 'Consumer Staples', exchange: 'SET' },
  { symbol: 'SCC.BK', name: 'Siam Cement', sector: 'Materials', exchange: 'SET' },
  { symbol: 'SCGP.BK', name: 'SCG Packaging', sector: 'Materials', exchange: 'SET' },
  { symbol: 'BDMS.BK', name: 'Bangkok Dusit Medical Services', sector: 'Healthcare', exchange: 'SET' },
  { symbol: 'BH.BK', name: 'Bumrungrad Hospital', sector: 'Healthcare', exchange: 'SET' },
  { symbol: 'MINT.BK', name: 'Minor International', sector: 'Consumer Discretionary', exchange: 'SET' },
  { symbol: 'LH.BK', name: 'Land and Houses', sector: 'Real Estate', exchange: 'SET' },
  { symbol: 'AWC.BK', name: 'Asset World Corp', sector: 'Real Estate', exchange: 'SET' },
];

export async function seedStocks(prismaClient: PrismaClient = prisma) {
  let created = 0;
  let updated = 0;

  // upsert แทน find-then-create ของเดิม — รันซ้ำได้และแก้ชื่อ/sector ที่เปลี่ยนไปให้ด้วย
  for (const stock of stockUniverse) {
    const before = await prismaClient.stocks.findUnique({
      where: { symbol: stock.symbol },
      select: { id: true },
    });

    await prismaClient.stocks.upsert({
      where: { symbol: stock.symbol },
      update: {
        name: stock.name,
        sector: stock.sector,
        exchange: stock.exchange,
      },
      create: stock,
    });

    if (before) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return { total: stockUniverse.length, created, updated };
}

if (require.main === module) {
  seedStocks()
    .then((result) => {
      console.log(
        `Seeded stocks: ${result.total} symbols (created ${result.created}, updated ${result.updated})`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

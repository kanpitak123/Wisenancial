import {
  MissionAudience,
  MissionEventType,
  MissionFrequency,
  MissionZone,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

const missions = [
  {
    code: 'DAILY_LOGIN',
    title: 'เข้าใช้งานวันนี้',
    description: 'เข้าใช้งาน Wisenancial 1 ครั้ง',
    points: 5,
    target_count: 1,
    frequency: MissionFrequency.DAILY,
    zone: MissionZone.DAILY,
    audience: MissionAudience.ALL,
    event_type: MissionEventType.LOGIN,
  },
  {
    code: 'TRADER_CLOSE_3',
    title: 'ปิดการเทรด 3 รายการ',
    description: 'ปิดรายการเทรดให้ครบ 3 รายการ',
    points: 20,
    target_count: 3,
    frequency: MissionFrequency.DAILY,
    zone: MissionZone.DAILY,
    audience: MissionAudience.TRADER,
    event_type: MissionEventType.TRADE_CLOSED,
  },
  {
    code: 'TRADER_JOURNAL_1',
    title: 'บันทึก Trading Journal',
    description: 'เขียนบันทึกหลังการเทรด 1 ครั้ง',
    points: 10,
    target_count: 1,
    frequency: MissionFrequency.DAILY,
    zone: MissionZone.DAILY,
    audience: MissionAudience.TRADER,
    event_type: MissionEventType.JOURNAL_COMPLETED,
  },
  {
    code: 'INVESTOR_BUY_1',
    title: 'บันทึกการซื้อหุ้น',
    description: 'เพิ่มรายการซื้อหุ้น 1 รายการ',
    points: 10,
    target_count: 1,
    frequency: MissionFrequency.DAILY,
    zone: MissionZone.DAILY,
    audience: MissionAudience.INVESTOR,
    event_type: MissionEventType.STOCK_PURCHASED,
  },
  {
    code: 'INVESTOR_REVIEW_1',
    title: 'ทบทวนพอร์ตลงทุน',
    description: 'เปิดดูและทบทวนพอร์ตลงทุน 1 ครั้ง',
    points: 5,
    target_count: 1,
    frequency: MissionFrequency.DAILY,
    zone: MissionZone.DAILY,
    audience: MissionAudience.INVESTOR,
    event_type: MissionEventType.PORTFOLIO_REVIEWED,
  },
  {
    code: 'COMMUNITY_POST_1',
    title: 'แชร์มุมมองกับชุมชน',
    description: 'สร้างโพสต์ใน Community 1 ครั้ง',
    points: 10,
    target_count: 1,
    frequency: MissionFrequency.DAILY,
    zone: MissionZone.DAILY,
    audience: MissionAudience.ALL,
    event_type: MissionEventType.POST_CREATED,
  },
];

async function main() {
  for (const mission of missions) {
    await prisma.missions.upsert({
      where: {
        code: mission.code,
      },
      update: mission,
      create: mission,
    });
  }

  return missions.length;
}

// เดิมมีแต่ .finally() ไม่มี .catch() — seed ที่ล้มเหลวจึงเงียบและ exit 0
// (ตาราง missions ว่างอยู่นานโดยไม่มีใครรู้ว่า seed ไม่เคยรันสำเร็จ)
main()
  .then((count) => {
    console.log(`Seeded missions: ${count}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

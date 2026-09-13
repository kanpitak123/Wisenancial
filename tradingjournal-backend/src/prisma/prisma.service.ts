import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // ค่า default ของ Prisma interactive transaction คือ timeout 5000ms/maxWait 2000ms
    // ซึ่งไม่พอสำหรับ transaction ที่มีหลาย round-trip (เช่น stock sell ที่ query DB
    // remote หลายครั้งต่อ 1 transaction) — เจอ "Transaction API error: Transaction not found"
    // เพราะ Prisma ปิด transaction ไปก่อนที่ query ท้ายๆจะรัน ทำให้ 500 ทุกครั้ง
    super({
      transactionOptions: {
        maxWait: 10000,
        timeout: 20000,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    console.log('Database Connected!');
  }
}

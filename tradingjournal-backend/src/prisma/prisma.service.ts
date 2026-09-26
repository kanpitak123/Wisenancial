import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
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

  /**
   * เรียกตอน shutdown (SIGTERM ผ่าน enableShutdownHooks) — ปิด connection คืนให้ Neon
   * แทนที่จะทิ้งไว้ให้หมดเวลาเอง ซึ่งกิน connection slot ของ compute ไปเรื่อย ๆ ทุกครั้งที่ deploy
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

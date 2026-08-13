import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // ใส่ @Global() ไว้ จะได้ไม่ต้องคอย import module นี้ซ้ำๆ ในที่อื่น
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // ส่งออก PrismaService ไปให้เพื่อนๆ ใช้
})
export class PrismaModule {}

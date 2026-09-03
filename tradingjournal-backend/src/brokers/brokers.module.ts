import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { TradesModule } from '../trades/trades.module';
import { Mt4AdapterService } from './adapters/mt4/mt4-adapter.service';
import { Mt5AdapterService } from './adapters/mt5/mt5-adapter.service';
import { WebullAdapterService } from './adapters/webull/webull-adapter.service';
import { DimeAdapterService } from './adapters/dime/dime-adapter.service';
import { BrokerSyncGateway } from './broker-sync.gateway';
import { BrokerApiKeyGuard } from './connections/broker-api-key.guard';
import { BrokerApiKeyService } from './connections/broker-api-key.service';
import { BrokerConnectionsController } from './connections/broker-connections.controller';
import { BrokerConnectionsService } from './connections/broker-connections.service';
import { MtConnectionThrottleGuard } from './ingestion/mt-connection-throttle.guard';
import { MtIngestionController } from './ingestion/mt-ingestion.controller';
import { MtIngestionService } from './ingestion/mt-ingestion.service';
import { Mt5SyncService } from './ingestion/mt5-sync.service';

@Module({
  // JwtModule ถูก register เป็น global ไว้ที่ AuthModule แล้ว — BrokerSyncGateway ใช้
  // ตัวนั้นตรวจ token ตอน handshake เหมือน ChatGateway/NewsGateway ไม่ต้อง register เอง
  imports: [PrismaModule, TradesModule, ConfigModule],
  controllers: [BrokerConnectionsController, MtIngestionController],
  providers: [
    BrokerConnectionsService,
    BrokerApiKeyService,
    BrokerApiKeyGuard,
    MtIngestionService,
    Mt5SyncService,
    MtConnectionThrottleGuard,
    BrokerSyncGateway,
    // Adapter placeholder — ยังไม่มี consumer เรียกใช้จริงใน Phase 2 แต่ลงทะเบียนไว้ล่วงหน้า
    // ให้ Phase 3+ inject ได้ทันทีโดยไม่ต้องแก้ module นี้อีก
    Mt5AdapterService,
    Mt4AdapterService,
    WebullAdapterService,
    DimeAdapterService,
  ],
  exports: [BrokerConnectionsService, BrokerApiKeyService],
})
export class BrokersModule {}

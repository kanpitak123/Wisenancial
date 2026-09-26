import { Global, Module } from '@nestjs/common';
import { createStorage, StorageService } from './storage.service';

/** Global: PostsService and ShareStatisticsService inject StorageService without importing this. */
@Global()
@Module({
  providers: [{ provide: StorageService, useFactory: () => createStorage() }],
  exports: [StorageService],
})
export class StorageModule {}

import { Global, Module } from '@nestjs/common';
import { AdvisoryLockService } from './advisory-lock.service';

/** Global so any cron service can take a cluster-wide lock without importing this module. */
@Global()
@Module({
  providers: [AdvisoryLockService],
  exports: [AdvisoryLockService],
})
export class LocksModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BrokersModule } from '../brokers/brokers.module';
import { CloudConnector } from './cloud-connector';
import { CredentialStoreService } from './credential-store.service';
import { CredentialVaultService } from './credential-vault.service';
import { EaConnector } from './ea-connector';
import { Mt5CloudConnectorBetaGuard } from './mt5-cloud-connector-beta.guard';
import { DeployLogService } from './mt5-cloud-connector-deploy-log.service';
import { Mt5CloudConnectorIdleReaperService } from './mt5-cloud-connector-idle-reaper.service';
import { Mt5CloudConnectorController } from './mt5-cloud-connector.controller';
import { Mt5CloudSpikeController } from './mt5-cloud-spike.controller';
import { Mt5CloudSpikeEnabledGuard } from './mt5-cloud-spike-enabled.guard';

/**
 * Started as a technical spike (see docs/mt5-investor-password-spike.md) and now also
 * hosts the real, gated beta feature graduated from it — same underlying
 * CloudConnector/EaConnector/CredentialStoreService/CredentialVaultService, two
 * controllers:
 *  - Mt5CloudSpikeController — the original dev-only `/dev/mt5-cloud-spike` surface,
 *    unchanged, gated by Mt5CloudSpikeEnabledGuard alone.
 *  - Mt5CloudConnectorController — the real `/brokers/mt5-cloud-connector` surface used
 *    by BrokerConnectionsPage.vue, gated by Mt5CloudConnectorBetaGuard (flag AND a
 *    per-user allowlist — see that guard's doc comment).
 * Still additive only: imports BrokersModule to reuse BrokerConnectionsService.list()
 * (read-only), exports nothing back, and is never imported by any other module.
 */
@Module({
  imports: [PrismaModule, BrokersModule],
  controllers: [Mt5CloudSpikeController, Mt5CloudConnectorController],
  providers: [
    EaConnector,
    CloudConnector,
    CredentialStoreService,
    CredentialVaultService,
    DeployLogService,
    Mt5CloudSpikeEnabledGuard,
    Mt5CloudConnectorBetaGuard,
    Mt5CloudConnectorIdleReaperService,
  ],
})
export class Mt5CloudSpikeModule {}

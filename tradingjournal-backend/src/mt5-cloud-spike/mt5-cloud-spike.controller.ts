import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BrokerType } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { BrokerConnectionsService } from '../brokers/connections/broker-connections.service';
import { CloudConnector } from './cloud-connector';
import { EaConnector } from './ea-connector';
import { ConnectMt5CloudSpikeDto } from './dto/connect-mt5-cloud-spike.dto';
import { Mt5CloudSpikeEnabledGuard } from './mt5-cloud-spike-enabled.guard';
import { CredentialStoreService } from './credential-store.service';
import { Mt5Connector, Mt5ConnectorError, Mt5ConnectorKind } from './mt5-connector.interface';

/**
 * Dev-only surface for the spike — see docs/mt5-investor-password-spike.md. Not linked
 * from any real nav, gated behind Mt5CloudSpikeEnabledGuard (404s unless
 * MT5_CLOUD_SPIKE_ENABLED=true) *and* still requires a real JWT, since it reads real
 * trade data through EaConnector. Never call into BrokerConnectionsService's write
 * methods (create/revoke/rotateKey/softDelete) from here — read-only (`list`) only.
 */
@UseGuards(JwtAuthGuard, Mt5CloudSpikeEnabledGuard)
@Controller('dev/mt5-cloud-spike')
export class Mt5CloudSpikeController {
  constructor(
    private readonly eaConnector: EaConnector,
    private readonly cloudConnector: CloudConnector,
    private readonly brokerConnections: BrokerConnectionsService,
    private readonly store: CredentialStoreService,
  ) {}

  /** Existing EA-based MT5 connections the user already set up via the real wizard —
   * EaConnector only ever reads these, never creates them. */
  @Get('ea-connections')
  async listEaConnections(@CurrentUser() user: AuthUser) {
    const connections = await this.brokerConnections.list(user.userId);
    return connections.filter((c) => c.broker_type === BrokerType.MT5);
  }

  /** Cloud-connector spike records for the current user — no plaintext secret ever
   * returned, only what's safe to show on the dev page. */
  @Get('cloud-records')
  async listCloudRecords(@CurrentUser() user: AuthUser) {
    const records = await this.store.listForUser(user.userId);
    return records.map((r) => ({
      id: r.id,
      login: r.login,
      server: r.server,
      metaApiAccountId: r.metaApiAccountId,
      createdAt: r.createdAt,
      connectedAt: r.connectedAt,
    }));
  }

  @Post('connect')
  async connect(@Body() dto: ConnectMt5CloudSpikeDto, @CurrentUser() user: AuthUser) {
    const connector = this.resolve(dto.kind);

    try {
      if (dto.kind === 'EA') {
        if (dto.brokerConnectionId === undefined) {
          throw new BadRequestException('brokerConnectionId is required for kind=EA');
        }
        return await connector.connect({ kind: 'EA', brokerConnectionId: dto.brokerConnectionId }, user.userId);
      }

      if (!dto.login || !dto.investorPassword || !dto.server) {
        throw new BadRequestException('login, investorPassword, server are required for kind=CLOUD');
      }

      return await connector.connect(
        { kind: 'CLOUD', login: dto.login, investorPassword: dto.investorPassword, server: dto.server },
        user.userId,
      );
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Delete(':kind/:ref')
  async disconnect(@Param('kind') kind: string, @Param('ref') ref: string, @CurrentUser() user: AuthUser) {
    const connector = this.resolve(this.assertKind(kind));

    try {
      await connector.disconnect(ref, user.userId);
      return { message: 'revoked' };
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Get(':kind/:ref/status')
  async status(@Param('kind') kind: string, @Param('ref') ref: string, @CurrentUser() user: AuthUser) {
    const connector = this.resolve(this.assertKind(kind));

    try {
      return await connector.getStatus(ref, user.userId);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Get(':kind/:ref/account')
  async account(@Param('kind') kind: string, @Param('ref') ref: string, @CurrentUser() user: AuthUser) {
    const connector = this.resolve(this.assertKind(kind));

    try {
      return await connector.getAccountSnapshot(ref, user.userId);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Get(':kind/:ref/positions')
  async positions(@Param('kind') kind: string, @Param('ref') ref: string, @CurrentUser() user: AuthUser) {
    const connector = this.resolve(this.assertKind(kind));

    try {
      return await connector.getPositions(ref, user.userId);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Get(':kind/:ref/deals')
  async deals(
    @Param('kind') kind: string,
    @Param('ref') ref: string,
    @Query('sinceDays') sinceDays: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const connector = this.resolve(this.assertKind(kind));
    const days = sinceDays ? Number(sinceDays) : undefined;

    try {
      return await connector.getDealHistory(ref, user.userId, days);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private resolve(kind: Mt5ConnectorKind): Mt5Connector {
    return kind === 'EA' ? this.eaConnector : this.cloudConnector;
  }

  private assertKind(kind: string): Mt5ConnectorKind {
    if (kind !== 'EA' && kind !== 'CLOUD') {
      throw new BadRequestException(`invalid kind: ${kind}`);
    }
    return kind;
  }

  private toHttpException(error: unknown): Error {
    if (error instanceof Mt5ConnectorError) {
      return new BadRequestException({ message: error.message, code: error.code });
    }
    return error as Error;
  }
}

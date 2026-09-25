import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CloudConnector } from './cloud-connector';
import { CredentialStoreService } from './credential-store.service';
import { ConnectMt5CloudConnectorDto } from './dto/connect-mt5-cloud-connector.dto';
import { isBetaUser, Mt5CloudConnectorBetaGuard } from './mt5-cloud-connector-beta.guard';
import { DeployLogService } from './mt5-cloud-connector-deploy-log.service';
import { Mt5ConnectorError } from './mt5-connector.interface';

/**
 * Real, user-facing MT5 investor-password connector — the beta surface graduated from
 * the dev-only spike (see docs/mt5-investor-password-spike.md, "Beta graduation work").
 * This is what BrokerConnectionsPage.vue's "เชื่อมต่อด้วยรหัสผ่านนักลงทุน" option calls;
 * the dev page (mt5-cloud-spike.controller.ts) is untouched and still exists separately.
 *
 * Reuses CloudConnector as-is — same MetaApi SDK wrapper, same Part-1 session RPC-reuse
 * fix, same on-demand deploy lifecycle (redeploy/undeploy) added alongside this
 * controller. Every route except `beta-status` is gated by Mt5CloudConnectorBetaGuard:
 * 404s unless MT5_CLOUD_SPIKE_ENABLED=true AND the caller's user id is in
 * MT5_CLOUD_CONNECTOR_BETA_USER_IDS. Never wired into onboarding — the frontend only
 * renders this option after `beta-status` returns `{enabled: true}`.
 *
 * Never touches the EA wizard's flow (ConnectMt5Wizard.vue, BrokerConnectionsController,
 * broker_connections table) at all — this is exclusively the CLOUD/investor-password
 * path, a parallel option, not a replacement.
 */
@Controller('brokers/mt5-cloud-connector')
export class Mt5CloudConnectorController {
  constructor(
    private readonly cloudConnector: CloudConnector,
    private readonly store: CredentialStoreService,
    private readonly deployLog: DeployLogService,
  ) {}

  /** Callable by any logged-in user — returns only a boolean, never account data, so it
   * doesn't need the strict 404-if-disallowed guard the rest of this controller uses.
   * The frontend calls this once to decide whether to render the beta entry point at
   * all. */
  @UseGuards(JwtAuthGuard)
  @Get('beta-status')
  betaStatus(@CurrentUser() user: AuthUser) {
    return { enabled: isBetaUser(user.userId) };
  }

  @UseGuards(JwtAuthGuard, Mt5CloudConnectorBetaGuard)
  @Get('records')
  async listRecords(@CurrentUser() user: AuthUser) {
    const records = await this.store.listForUser(user.userId);

    return records.map((r) => ({
      id: r.id,
      login: r.login,
      server: r.server,
      metaApiAccountId: r.metaApiAccountId,
      deployState: r.deployState,
      createdAt: r.createdAt,
      connectedAt: r.connectedAt,
      lastActivityAt: r.lastActivityAt,
    }));
  }

  /** Audit trail of every deploy/undeploy transition for this user's CLOUD records —
   * lets the beta user check actual MetaApi deploy activity against what the UI (and
   * the idle reaper) did. */
  @UseGuards(JwtAuthGuard, Mt5CloudConnectorBetaGuard)
  @Get('deploy-log')
  async listDeployLog(@CurrentUser() user: AuthUser) {
    return this.deployLog.listForUser(user.userId);
  }

  @UseGuards(JwtAuthGuard, Mt5CloudConnectorBetaGuard)
  @Post('connect')
  async connect(@Body() dto: ConnectMt5CloudConnectorDto, @CurrentUser() user: AuthUser) {
    if (dto.consentAccepted !== true) {
      throw new BadRequestException('ต้องกดยินยอมก่อนเชื่อมต่อ (consentAccepted must be true)');
    }

    try {
      const handle = await this.cloudConnector.connect(
        { kind: 'CLOUD', login: dto.login, investorPassword: dto.investorPassword, server: dto.server },
        user.userId,
      );

      await this.store.update(handle.ref, { consentAcceptedAt: new Date().toISOString() }).catch(() => undefined);

      return handle;
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /** The "refresh / sync now" action, and what the frontend's auto-poll (while the
   * detail view is open) calls too — `trigger` distinguishes the two for the deploy log.
   * If the account is already deployed this just reports that; if it's been idle-
   * undeployed (or never came up), this redeploys it on demand — same fire-and-forget +
   * poll-status pattern as the initial connect(). */
  @UseGuards(JwtAuthGuard, Mt5CloudConnectorBetaGuard)
  @Post(':ref/sync')
  async sync(
    @Param('ref') ref: string,
    @Query('trigger') trigger: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const reason = trigger === 'manual' ? 'manual-refresh' : 'auto-poll';

    try {
      const status = await this.cloudConnector.getStatus(ref, user.userId);

      if (status.state === 'CONNECTED' || status.state === 'CONNECTING') {
        return { state: status.state, redeployed: false };
      }

      await this.cloudConnector.redeploy(ref, user.userId, reason);
      return { state: 'CONNECTING', redeployed: true };
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @UseGuards(JwtAuthGuard, Mt5CloudConnectorBetaGuard)
  @Get(':ref/status')
  async status(@Param('ref') ref: string, @CurrentUser() user: AuthUser) {
    try {
      return await this.cloudConnector.getStatus(ref, user.userId);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @UseGuards(JwtAuthGuard, Mt5CloudConnectorBetaGuard)
  @Get(':ref/account')
  async account(@Param('ref') ref: string, @CurrentUser() user: AuthUser) {
    try {
      return await this.cloudConnector.getAccountSnapshot(ref, user.userId);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @UseGuards(JwtAuthGuard, Mt5CloudConnectorBetaGuard)
  @Get(':ref/positions')
  async positions(@Param('ref') ref: string, @CurrentUser() user: AuthUser) {
    try {
      return await this.cloudConnector.getPositions(ref, user.userId);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @UseGuards(JwtAuthGuard, Mt5CloudConnectorBetaGuard)
  @Get(':ref/deals')
  async deals(
    @Param('ref') ref: string,
    @Query('sinceDays') sinceDays: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      return await this.cloudConnector.getDealHistory(ref, user.userId, sinceDays ? Number(sinceDays) : undefined);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /** Always undeploys + revokes immediately via CloudConnector.disconnect() — the same
   * deterministic path Part 1 hardened (dropConnection() closes the cached RPC socket,
   * then account.remove() is awaited, not fire-and-forget). */
  @UseGuards(JwtAuthGuard, Mt5CloudConnectorBetaGuard)
  @Delete(':ref')
  async disconnect(@Param('ref') ref: string, @CurrentUser() user: AuthUser) {
    try {
      await this.cloudConnector.disconnect(ref, user.userId);
      return { message: 'disconnected' };
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private toHttpException(error: unknown): Error {
    if (error instanceof Mt5ConnectorError) {
      return new BadRequestException({ message: error.message, code: error.code });
    }
    return error as Error;
  }
}

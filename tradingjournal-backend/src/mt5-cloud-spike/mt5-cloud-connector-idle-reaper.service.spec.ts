import { Test, TestingModule } from '@nestjs/testing';
import { CloudConnector } from './cloud-connector';
import { CredentialStoreService } from './credential-store.service';
import { Mt5CloudConnectorIdleReaperService } from './mt5-cloud-connector-idle-reaper.service';

describe('Mt5CloudConnectorIdleReaperService', () => {
  const storeMock = { listDeployed: jest.fn() };
  const cloudConnectorMock = { undeploy: jest.fn().mockResolvedValue(true) };

  let service: Mt5CloudConnectorIdleReaperService;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.MT5_CLOUD_CONNECTOR_IDLE_UNDEPLOY_MS;
    delete process.env.MT5_CLOUD_CONNECTOR_MAX_SESSION_MS;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Mt5CloudConnectorIdleReaperService,
        { provide: CredentialStoreService, useValue: storeMock },
        { provide: CloudConnector, useValue: cloudConnectorMock },
      ],
    }).compile();

    service = module.get(Mt5CloudConnectorIdleReaperService);
  });

  it('undeploys a record idle past the default 5-minute threshold', async () => {
    const staleAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    storeMock.listDeployed.mockResolvedValue([
      { id: 'rec-1', userId: 5, lastActivityAt: staleAt },
    ]);

    await service.sweep();

    expect(cloudConnectorMock.undeploy).toHaveBeenCalledWith('rec-1', 5, 'idle-timeout');
  });

  it('leaves a record alone if its last activity is within the threshold', async () => {
    const recentAt = new Date(Date.now() - 30 * 1000).toISOString();
    storeMock.listDeployed.mockResolvedValue([
      { id: 'rec-2', userId: 5, lastActivityAt: recentAt },
    ]);

    await service.sweep();

    expect(cloudConnectorMock.undeploy).not.toHaveBeenCalled();
  });

  it('skips records with no lastActivityAt yet (never touched since deploy)', async () => {
    storeMock.listDeployed.mockResolvedValue([{ id: 'rec-3', userId: 5, lastActivityAt: null }]);

    await service.sweep();

    expect(cloudConnectorMock.undeploy).not.toHaveBeenCalled();
  });

  it('respects MT5_CLOUD_CONNECTOR_IDLE_UNDEPLOY_MS when set', async () => {
    process.env.MT5_CLOUD_CONNECTOR_IDLE_UNDEPLOY_MS = '1000';
    const idleFor2s = new Date(Date.now() - 2000).toISOString();
    storeMock.listDeployed.mockResolvedValue([{ id: 'rec-4', userId: 5, lastActivityAt: idleFor2s }]);

    await service.sweep();

    expect(cloudConnectorMock.undeploy).toHaveBeenCalledWith('rec-4', 5, 'idle-timeout');
    delete process.env.MT5_CLOUD_CONNECTOR_IDLE_UNDEPLOY_MS;
  });

  it('does not let one failing undeploy stop the sweep from processing the rest', async () => {
    const staleAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    cloudConnectorMock.undeploy
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(true);

    storeMock.listDeployed.mockResolvedValue([
      { id: 'rec-5', userId: 5, lastActivityAt: staleAt },
      { id: 'rec-6', userId: 5, lastActivityAt: staleAt },
    ]);

    await expect(service.sweep()).resolves.toBeUndefined();

    expect(cloudConnectorMock.undeploy).toHaveBeenCalledTimes(2);
  });

  it('undeploys a record past the max-session cap even though a keep-alive poll kept lastActivityAt fresh', async () => {
    const justNow = new Date(Date.now() - 1000).toISOString();
    const sessionStartedOver6hAgo = new Date(Date.now() - (6 * 60 * 60 * 1000 + 1000)).toISOString();

    storeMock.listDeployed.mockResolvedValue([
      { id: 'rec-7', userId: 5, lastActivityAt: justNow, deploySessionStartedAt: sessionStartedOver6hAgo },
    ]);

    await service.sweep();

    expect(cloudConnectorMock.undeploy).toHaveBeenCalledWith('rec-7', 5, 'max-session-timeout');
  });

  it('leaves a record deployed under the default max-session cap even with fresh activity', async () => {
    const justNow = new Date(Date.now() - 1000).toISOString();
    const sessionStartedRecently = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    storeMock.listDeployed.mockResolvedValue([
      { id: 'rec-8', userId: 5, lastActivityAt: justNow, deploySessionStartedAt: sessionStartedRecently },
    ]);

    await service.sweep();

    expect(cloudConnectorMock.undeploy).not.toHaveBeenCalled();
  });

  it('skips the max-session check for a record with no deploySessionStartedAt yet', async () => {
    const justNow = new Date(Date.now() - 1000).toISOString();

    storeMock.listDeployed.mockResolvedValue([
      { id: 'rec-9', userId: 5, lastActivityAt: justNow, deploySessionStartedAt: null },
    ]);

    await service.sweep();

    expect(cloudConnectorMock.undeploy).not.toHaveBeenCalled();
  });

  it('respects MT5_CLOUD_CONNECTOR_MAX_SESSION_MS when set', async () => {
    process.env.MT5_CLOUD_CONNECTOR_MAX_SESSION_MS = '1000';
    const justNow = new Date(Date.now() - 1000).toISOString();
    const sessionStartedOver1sAgo = new Date(Date.now() - 2000).toISOString();

    storeMock.listDeployed.mockResolvedValue([
      { id: 'rec-10', userId: 5, lastActivityAt: justNow, deploySessionStartedAt: sessionStartedOver1sAgo },
    ]);

    await service.sweep();

    expect(cloudConnectorMock.undeploy).toHaveBeenCalledWith('rec-10', 5, 'max-session-timeout');
    delete process.env.MT5_CLOUD_CONNECTOR_MAX_SESSION_MS;
  });

  it('applies idle-timeout, not max-session-timeout, when both thresholds are tripped at once', async () => {
    const staleAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const sessionStartedOver6hAgo = new Date(Date.now() - (6 * 60 * 60 * 1000 + 1000)).toISOString();

    storeMock.listDeployed.mockResolvedValue([
      { id: 'rec-11', userId: 5, lastActivityAt: staleAt, deploySessionStartedAt: sessionStartedOver6hAgo },
    ]);

    await service.sweep();

    expect(cloudConnectorMock.undeploy).toHaveBeenCalledTimes(1);
    expect(cloudConnectorMock.undeploy).toHaveBeenCalledWith('rec-11', 5, 'idle-timeout');
  });
});

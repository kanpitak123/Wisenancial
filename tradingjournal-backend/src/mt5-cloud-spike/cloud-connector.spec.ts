import { Test, TestingModule } from '@nestjs/testing';
import { CloudConnector } from './cloud-connector';
import { CredentialStoreService } from './credential-store.service';
import { CredentialVaultService } from './credential-vault.service';
import { DeployLogService } from './mt5-cloud-connector-deploy-log.service';

/**
 * Reproduces the exact failure sequence found in the live spike test (see
 * docs/mt5-investor-password-spike.md, "Live test #2"): connect -> account snapshot ->
 * positions -> deal history, all in one session, no disconnect between. Against the
 * previous open-a-fresh-RPC-connection-per-call implementation, the second call
 * (positions) in that live run timed out after ~107s and the MetaApi-side account ended
 * up UNDEPLOYED with no explicit undeploy ever issued by the app. This test can't
 * reproduce MetaApi's own network flakiness, but it *can* pin down the actual root
 * cause the fix targets: how many times the connector opens/closes an RPC connection
 * for that exact call sequence. One connection, reused, is the fix; three
 * opens-and-closes was the bug.
 */

const createAccountMock = jest.fn();
const getAccountMock = jest.fn();

jest.mock('metaapi.cloud-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    metatraderAccountApi: {
      createAccount: createAccountMock,
      getAccount: getAccountMock,
    },
  }));
});

describe('CloudConnector — session RPC connection reuse', () => {
  const USER_ID = 5;
  const RECORD_ID = 'record-1';
  const META_ACCOUNT_ID = 'meta-account-1';

  const storeMock = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    get: jest.fn(),
    listForUser: jest.fn(),
  };

  const vaultMock = {
    encrypt: jest.fn().mockReturnValue('v1:iv:tag:ciphertext'),
    decrypt: jest.fn(),
  };

  const deployLogMock = {
    record: jest.fn().mockResolvedValue(undefined),
    listForUser: jest.fn().mockResolvedValue([]),
  };

  let connector: CloudConnector;
  let getRPCConnectionMock: jest.Mock;
  let connectMock: jest.Mock;
  let waitSynchronizedMock: jest.Mock;
  let closeMock: jest.Mock;
  let removeAccountMock: jest.Mock;
  let deployAccountMock: jest.Mock;
  let undeployAccountMock: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.MT5_CLOUD_SPIKE_METAAPI_TOKEN = 'test-token';

    connectMock = jest.fn().mockResolvedValue(undefined);
    waitSynchronizedMock = jest.fn().mockResolvedValue(undefined);
    closeMock = jest.fn().mockResolvedValue(undefined);
    removeAccountMock = jest.fn().mockResolvedValue(undefined);
    deployAccountMock = jest.fn().mockResolvedValue(undefined);
    undeployAccountMock = jest.fn().mockResolvedValue(undefined);

    const rpcConnection = {
      connect: connectMock,
      waitSynchronized: waitSynchronizedMock,
      close: closeMock,
      getAccountInformation: jest.fn().mockResolvedValue({
        broker: 'Exness Technologies Ltd',
        currency: 'USD',
        balance: 1000200,
        equity: 863516,
        margin: 101497.76,
        freeMargin: 762018.24,
        marginLevel: 850.77,
        leverage: 500,
        credit: 0,
      }),
      getPositions: jest.fn().mockResolvedValue([
        {
          id: 111,
          symbol: 'EURUSD',
          type: 'POSITION_TYPE_BUY',
          volume: 0.1,
          openPrice: 1.1,
          currentPrice: 1.105,
          profit: 5,
          time: new Date('2026-09-08T00:00:00Z'),
        },
      ]),
      getDealsByTimeRange: jest.fn().mockResolvedValue({
        deals: [
          {
            id: 222,
            symbol: 'EURUSD',
            volume: 0.1,
            price: 1.1,
            profit: 5,
            commission: -0.1,
            swap: 0,
            time: new Date('2026-09-07T00:00:00Z'),
          },
        ],
      }),
    };

    getRPCConnectionMock = jest.fn().mockReturnValue(rpcConnection);

    const account = {
      id: META_ACCOUNT_ID,
      state: 'DEPLOYED',
      connectionStatus: 'CONNECTED',
      deploy: deployAccountMock,
      undeploy: undeployAccountMock,
      remove: removeAccountMock,
      getRPCConnection: getRPCConnectionMock,
    };

    createAccountMock.mockResolvedValue(account);
    getAccountMock.mockResolvedValue(account);

    const record = {
      id: RECORD_ID,
      userId: USER_ID,
      login: '414307761',
      server: 'Exness-MT5Trial6',
      encryptedInvestorPassword: 'v1:iv:tag:ciphertext',
      metaApiAccountId: META_ACCOUNT_ID,
      createdAt: new Date().toISOString(),
      connectedAt: null,
      lastActivityAt: null,
      deployState: 'DEPLOYED' as const,
      deploySessionStartedAt: new Date().toISOString(),
      consentAcceptedAt: null,
    };

    storeMock.create.mockResolvedValue({ ...record, metaApiAccountId: null, deploySessionStartedAt: null });
    storeMock.update.mockResolvedValue(record);
    storeMock.get.mockResolvedValue(record);
    storeMock.remove.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudConnector,
        { provide: CredentialStoreService, useValue: storeMock },
        { provide: CredentialVaultService, useValue: vaultMock },
        { provide: DeployLogService, useValue: deployLogMock },
      ],
    }).compile();

    connector = module.get(CloudConnector);
  });

  afterEach(async () => {
    await connector.onModuleDestroy();
    delete process.env.MT5_CLOUD_SPIKE_METAAPI_TOKEN;
  });

  it('reuses one RPC connection across snapshot -> positions -> deal history in one session, with no timeout', async () => {
    const handle = await connector.connect(
      { kind: 'CLOUD', login: '414307761', investorPassword: 'Tester@123', server: 'Exness-MT5Trial6' },
      USER_ID,
    );

    expect(handle).toEqual({ kind: 'CLOUD', ref: RECORD_ID });

    // Regression check for the live-test billing bug: createAccount() must explicitly
    // request 'regular' reliability, not fall through to the SDK's 'high' default (which
    // requires a topped-up MetaApi.cloud account and fails with "please top up your
    // account" otherwise).
    expect(createAccountMock).toHaveBeenCalledWith(expect.objectContaining({ reliability: 'regular' }));

    // deploySessionStartedAt must be stamped on connect() too — it's what the idle
    // reaper's hard session-length cap (separate from lastActivityAt/idle-timeout)
    // compares against.
    expect(storeMock.update).toHaveBeenCalledWith(
      RECORD_ID,
      expect.objectContaining({ deploySessionStartedAt: expect.any(String) }),
    );

    // Same session, no disconnect() between calls — this is the exact sequence that
    // failed live.
    const snapshot = await connector.getAccountSnapshot(handle.ref, USER_ID);
    const positions = await connector.getPositions(handle.ref, USER_ID);
    const deals = await connector.getDealHistory(handle.ref, USER_ID);

    expect(snapshot.balance).toBe(1000200);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('EURUSD');
    expect(deals).toHaveLength(1);
    expect(deals[0].ticket).toBe('222');

    // The actual regression check: the old code opened (and immediately closed) a fresh
    // RPC connection for every one of the three read calls above. The fix must open
    // exactly one connection for the whole session and reuse it.
    expect(getRPCConnectionMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(waitSynchronizedMock).toHaveBeenCalledTimes(1);

    // It must not have been torn down mid-session either — only disconnect(), the idle
    // reaper, or module shutdown should close it.
    expect(closeMock).not.toHaveBeenCalled();

    // Account lookup is only needed once too (on the cache miss that creates the
    // connection) — reads after that reuse the cached connection object directly.
    expect(getAccountMock).toHaveBeenCalledTimes(1);
  });

  it('closes the cached connection deterministically on explicit disconnect', async () => {
    const handle = await connector.connect(
      { kind: 'CLOUD', login: '414307761', investorPassword: 'Tester@123', server: 'Exness-MT5Trial6' },
      USER_ID,
    );

    await connector.getAccountSnapshot(handle.ref, USER_ID);
    expect(getRPCConnectionMock).toHaveBeenCalledTimes(1);
    expect(closeMock).not.toHaveBeenCalled();

    await connector.disconnect(handle.ref, USER_ID);

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(removeAccountMock).toHaveBeenCalledTimes(1);
    expect(storeMock.remove).toHaveBeenCalledWith(RECORD_ID);

    // A read after disconnect must re-establish from scratch (there's nothing cached to
    // reuse anymore), not silently reuse a closed socket.
    await connector.getAccountSnapshot(handle.ref, USER_ID);
    expect(getRPCConnectionMock).toHaveBeenCalledTimes(2);
  });

  it('closes any still-open session connection on module shutdown', async () => {
    const handle = await connector.connect(
      { kind: 'CLOUD', login: '414307761', investorPassword: 'Tester@123', server: 'Exness-MT5Trial6' },
      USER_ID,
    );

    await connector.getAccountSnapshot(handle.ref, USER_ID);
    expect(closeMock).not.toHaveBeenCalled();

    await connector.onModuleDestroy();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('drops the cached connection on a read failure so the next call re-establishes instead of retrying a stale socket', async () => {
    const handle = await connector.connect(
      { kind: 'CLOUD', login: '414307761', investorPassword: 'Tester@123', server: 'Exness-MT5Trial6' },
      USER_ID,
    );

    await connector.getAccountSnapshot(handle.ref, USER_ID);
    expect(getRPCConnectionMock).toHaveBeenCalledTimes(1);

    const rpcConnection = getRPCConnectionMock.mock.results[0].value;
    const timeoutError = Object.assign(new Error('Timed out waiting for MetaApi to synchronize'), {
      name: 'TimeoutError',
    });
    rpcConnection.getPositions.mockRejectedValueOnce(timeoutError);

    await expect(connector.getPositions(handle.ref, USER_ID)).rejects.toMatchObject({ code: 'TIMEOUT' });

    // The failed connection should have been dropped (and closed) rather than kept
    // around for the next call to retry against.
    expect(closeMock).toHaveBeenCalledTimes(1);

    await connector.getDealHistory(handle.ref, USER_ID);
    expect(getRPCConnectionMock).toHaveBeenCalledTimes(2);
  });
});

describe('CloudConnector — on-demand deploy lifecycle (Part 2)', () => {
  const USER_ID = 5;
  const RECORD_ID = 'record-1';
  const META_ACCOUNT_ID = 'meta-account-1';

  const storeMock = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    get: jest.fn(),
    listForUser: jest.fn(),
    listDeployed: jest.fn(),
  };

  const vaultMock = { encrypt: jest.fn(), decrypt: jest.fn() };
  const deployLogMock = { record: jest.fn().mockResolvedValue(undefined), listForUser: jest.fn() };

  let connector: CloudConnector;
  let deployAccountMock: jest.Mock;
  let undeployAccountMock: jest.Mock;

  const record = {
    id: RECORD_ID,
    userId: USER_ID,
    login: '414307761',
    server: 'Exness-MT5Trial6',
    encryptedInvestorPassword: 'v1:iv:tag:ciphertext',
    metaApiAccountId: META_ACCOUNT_ID,
    createdAt: new Date().toISOString(),
    connectedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    deployState: 'UNDEPLOYED' as const,
    deploySessionStartedAt: null,
    consentAcceptedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.MT5_CLOUD_SPIKE_METAAPI_TOKEN = 'test-token';

    deployAccountMock = jest.fn().mockResolvedValue(undefined);
    undeployAccountMock = jest.fn().mockResolvedValue(undefined);

    const account = {
      id: META_ACCOUNT_ID,
      deploy: deployAccountMock,
      undeploy: undeployAccountMock,
      getRPCConnection: jest.fn().mockReturnValue({
        connect: jest.fn().mockResolvedValue(undefined),
        waitSynchronized: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      }),
    };

    // Reuse the module-level metaapi.cloud-sdk mock declared at the top of this file
    // (both describe blocks share the same jest.mock('metaapi.cloud-sdk', ...) factory)
    // — just point its getAccount() at this block's own account double.
    getAccountMock.mockResolvedValue(account);

    storeMock.get.mockResolvedValue(record);
    storeMock.update.mockResolvedValue(record);
    storeMock.listDeployed.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudConnector,
        { provide: CredentialStoreService, useValue: storeMock },
        { provide: CredentialVaultService, useValue: vaultMock },
        { provide: DeployLogService, useValue: deployLogMock },
      ],
    }).compile();

    connector = module.get(CloudConnector);
  });

  afterEach(async () => {
    await connector.onModuleDestroy();
    delete process.env.MT5_CLOUD_SPIKE_METAAPI_TOKEN;
  });

  it('redeploy() calls account.deploy() again, marks the record DEPLOYED, stamps a fresh deploySessionStartedAt, and logs the transition with the given reason', async () => {
    await connector.redeploy(RECORD_ID, USER_ID, 'manual-refresh');

    expect(deployAccountMock).toHaveBeenCalledTimes(1);
    expect(storeMock.update).toHaveBeenCalledWith(
      RECORD_ID,
      expect.objectContaining({ deployState: 'DEPLOYED', deploySessionStartedAt: expect.any(String) }),
    );
    expect(deployLogMock.record).toHaveBeenCalledWith(RECORD_ID, USER_ID, 'deploy', 'manual-refresh', META_ACCOUNT_ID);
  });

  it('undeploy() calls account.undeploy() (not remove()), marks the record UNDEPLOYED, clears deploySessionStartedAt, and logs the transition', async () => {
    const ok = await connector.undeploy(RECORD_ID, USER_ID, 'idle-timeout');

    expect(ok).toBe(true);
    expect(undeployAccountMock).toHaveBeenCalledTimes(1);
    expect(storeMock.update).toHaveBeenCalledWith(RECORD_ID, {
      deployState: 'UNDEPLOYED',
      deploySessionStartedAt: null,
    });
    expect(deployLogMock.record).toHaveBeenCalledWith(RECORD_ID, USER_ID, 'undeploy', 'idle-timeout', META_ACCOUNT_ID);
  });

  it('undeploy() returns false and leaves local deployState alone if the MetaApi call fails, so the reaper retries next sweep', async () => {
    undeployAccountMock.mockRejectedValueOnce(new Error('network blip'));

    const ok = await connector.undeploy(RECORD_ID, USER_ID, 'idle-timeout');

    expect(ok).toBe(false);
    expect(storeMock.update).not.toHaveBeenCalledWith(RECORD_ID, {
      deployState: 'UNDEPLOYED',
      deploySessionStartedAt: null,
    });
    expect(deployLogMock.record).not.toHaveBeenCalled();
  });
});

describe('CloudConnector — mapSdkError billing case', () => {
  const USER_ID = 5;

  const storeMock = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    get: jest.fn(),
    listForUser: jest.fn(),
  };

  const vaultMock = { encrypt: jest.fn().mockReturnValue('v1:iv:tag:ciphertext'), decrypt: jest.fn() };
  const deployLogMock = { record: jest.fn().mockResolvedValue(undefined), listForUser: jest.fn() };

  let connector: CloudConnector;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.MT5_CLOUD_SPIKE_METAAPI_TOKEN = 'test-token';

    storeMock.create.mockResolvedValue({
      id: 'record-billing',
      userId: USER_ID,
      login: '414307761',
      server: 'Exness-MT5Trial6',
      encryptedInvestorPassword: 'v1:iv:tag:ciphertext',
      metaApiAccountId: null,
      createdAt: new Date().toISOString(),
      connectedAt: null,
      lastActivityAt: null,
      deployState: null,
      deploySessionStartedAt: null,
      consentAcceptedAt: null,
    });
    storeMock.remove.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudConnector,
        { provide: CredentialStoreService, useValue: storeMock },
        { provide: CredentialVaultService, useValue: vaultMock },
        { provide: DeployLogService, useValue: deployLogMock },
      ],
    }).compile();

    connector = module.get(CloudConnector);
  });

  afterEach(async () => {
    await connector.onModuleDestroy();
    delete process.env.MT5_CLOUD_SPIKE_METAAPI_TOKEN;
  });

  it('maps a MetaApi "top up" error from createAccount() to a readable BILLING_REQUIRED error instead of UNKNOWN', async () => {
    createAccountMock.mockRejectedValueOnce(
      new Error('To allow high reliability please top up your account'),
    );

    await expect(
      connector.connect(
        { kind: 'CLOUD', login: '414307761', investorPassword: 'Tester@123', server: 'Exness-MT5Trial6' },
        USER_ID,
      ),
    ).rejects.toMatchObject({ code: 'BILLING_REQUIRED' });

    // Also confirms connect()'s cleanup-on-failure path still runs.
    expect(storeMock.remove).toHaveBeenCalledWith('record-billing');
  });
});

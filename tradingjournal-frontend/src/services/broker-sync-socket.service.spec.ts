/**
 * Same test shape as news-socket.service.spec.ts on purpose — same underlying
 * pattern, same risk (forgetting to attach the access token means the realtime
 * feed silently never connects, with no error visible on screen).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const socket = {
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
};

const io = vi.hoisted(() => vi.fn());

vi.mock('socket.io-client', () => ({ io }));

const ACCESS_TOKEN_KEY = 'access_token';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  io.mockReturnValue(socket);
  vi.resetModules();
});

afterEach(() => {
  localStorage.clear();
});

async function loadService() {
  const module = await import('./broker-sync-socket.service');
  return module.brokerSyncSocketService;
}

function handshakeOptions(call = 1) {
  const options = io.mock.calls[call - 1]?.[1] as { auth?: { token?: string } } | undefined;
  expect(options).toBeDefined();
  return options as { auth?: { token?: string } };
}

describe('brokerSyncSocketService.connect', () => {
  it('attaches the access token from localStorage to the handshake', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'jwt-from-login');

    const service = await loadService();
    service.connect({});

    expect(io).toHaveBeenCalledTimes(1);
    expect(handshakeOptions()).toMatchObject({ auth: { token: 'jwt-from-login' } });
  });

  it('connects even with no token yet, with an empty string rather than throwing — the server rejects it, not the page', async () => {
    const service = await loadService();

    expect(() => service.connect({})).not.toThrow();
    expect(handshakeOptions()).toMatchObject({ auth: { token: '' } });
  });

  it('registers the onSyncUpdate handler on the mt5_sync_update event', async () => {
    const onSyncUpdate = vi.fn();
    const service = await loadService();

    service.connect({ onSyncUpdate });

    expect(socket.on).toHaveBeenCalledWith('mt5_sync_update', onSyncUpdate);
  });

  it('reconnecting without disconnecting first does not create a second socket', async () => {
    const service = await loadService();

    service.connect({});
    service.connect({});

    expect(io).toHaveBeenCalledTimes(1);
  });

  it('disconnect then reconnect reads the latest token (rotated on refresh)', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');

    const service = await loadService();
    service.connect({});
    service.disconnect();

    localStorage.setItem(ACCESS_TOKEN_KEY, 'rotated-token');
    service.connect({});

    expect(io).toHaveBeenCalledTimes(2);
    expect(handshakeOptions(2)).toMatchObject({ auth: { token: 'rotated-token' } });
  });
});

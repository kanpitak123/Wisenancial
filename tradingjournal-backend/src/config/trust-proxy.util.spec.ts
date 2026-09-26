import * as http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { resolveTrustProxy } from './trust-proxy.util';

describe('resolveTrustProxy', () => {
  it('is off locally by default and one hop in production', () => {
    expect(resolveTrustProxy({})).toBe(false);
    expect(resolveTrustProxy({ NODE_ENV: 'development' })).toBe(false);
    expect(resolveTrustProxy({ NODE_ENV: 'production' })).toBe(1);
  });

  it('an explicit TRUST_PROXY wins over the default', () => {
    expect(
      resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: 'false' }),
    ).toBe(false);
    expect(
      resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: '0' }),
    ).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: '1' })).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: '2' })).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: 'true' })).toBe(true);
    expect(resolveTrustProxy({ TRUST_PROXY: ' TRUE ' })).toBe(true);
  });

  it('a non-numeric value is passed through as a subnet list', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: 'loopback, 10.0.0.0/8' })).toBe(
      'loopback, 10.0.0.0/8',
    );
  });

  it('an empty value behaves like unset', () => {
    expect(
      resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: '  ' }),
    ).toBe(1);
  });
});

/** What the setting is for: the client IP the rate limiter sees. */
describe('effect on req.ip', () => {
  const ipSeenBy = async (setting: boolean | number | string) => {
    const app = express();
    app.set('trust proxy', setting);
    app.get('/', (req, res) => {
      res.json({ ip: req.ip });
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;

    try {
      return await new Promise<string>((resolve, reject) => {
        http
          .get(
            {
              host: '127.0.0.1',
              port,
              headers: { 'x-forwarded-for': '203.0.113.7' },
            },
            (res) => {
              let body = '';
              res.on('data', (chunk: Buffer) => (body += chunk.toString()));
              res.on('end', () =>
                resolve((JSON.parse(body) as { ip: string }).ip),
              );
            },
          )
          .on('error', reject);
      });
    } finally {
      server.close();
    }
  };

  it('with trust proxy off, everyone is the proxy address (the bug)', async () => {
    expect(await ipSeenBy(false)).toMatch(/127\.0\.0\.1/);
  });

  it('with one trusted hop, the real client address is used', async () => {
    expect(await ipSeenBy(resolveTrustProxy({ NODE_ENV: 'production' }))).toBe(
      '203.0.113.7',
    );
  });
});

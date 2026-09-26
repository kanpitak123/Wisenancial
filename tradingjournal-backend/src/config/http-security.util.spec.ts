import * as http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import helmet from 'helmet';
import { PrismaService } from '../prisma/prisma.service';
import { buildHelmetOptions, isSwaggerEnabled } from './http-security.util';

describe('isSwaggerEnabled', () => {
  it('on in development, off in production by default', () => {
    expect(isSwaggerEnabled({})).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('SWAGGER_ENABLED=true opens it in production; only "true" does', () => {
    expect(
      isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }),
    ).toBe(true);
    expect(
      isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: ' TRUE ' }),
    ).toBe(true);
    expect(
      isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: '1' }),
    ).toBe(false);
    expect(
      isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: '' }),
    ).toBe(false);
  });

  it('SWAGGER_ENABLED=false closes it in development too', () => {
    expect(
      isSwaggerEnabled({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }),
    ).toBe(false);
  });
});

describe('helmet with the API options', () => {
  const headersFor = async (swaggerEnabled: boolean) => {
    const app = express();
    app.use(helmet(buildHelmetOptions(swaggerEnabled)));
    app.get('/', (_req, res) => {
      res.json({ ok: true });
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;

    try {
      return await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
        http
          .get({ host: '127.0.0.1', port }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.headers));
          })
          .on('error', reject);
      });
    } finally {
      server.close();
    }
  };

  it('sends the standard security headers', async () => {
    const headers = await headersFor(false);

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['strict-transport-security']).toMatch(/max-age=/);
    expect(headers['x-frame-options']).toBeDefined();
    expect(headers['x-powered-by']).toBeUndefined();
  });

  it('keeps /uploads images loadable from the web app origin', async () => {
    expect((await headersFor(false))['cross-origin-resource-policy']).toBe(
      'cross-origin',
    );
  });

  it('a Content-Security-Policy is sent in production (Swagger off) and dropped only for Swagger UI', async () => {
    expect((await headersFor(false))['content-security-policy']).toBeDefined();
    expect((await headersFor(true))['content-security-policy']).toBeUndefined();
  });
});

describe('graceful shutdown', () => {
  it('PrismaService closes its connections when the app shuts down', async () => {
    const service = new PrismaService();
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue();

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

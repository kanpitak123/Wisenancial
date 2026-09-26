import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  assertSafeKey,
  createStorage,
  LocalStorageDriver,
  readS3Settings,
  S3StorageDriver,
  uploadsRoot,
} from './storage.service';

const S3_ENV: NodeJS.ProcessEnv = {
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  S3_BUCKET: 'wisenancial-uploads',
  S3_ACCESS_KEY_ID: 'id',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PUBLIC_BASE_URL: 'https://cdn.example.com/',
};

describe('assertSafeKey', () => {
  it.each(['share/a.svg', 'posts/uuid.png'])('accepts %s', (key) => {
    expect(() => assertSafeKey(key)).not.toThrow();
  });

  it.each(['', '/etc/passwd', '../x', 'a/../../x', 'a//b', 'a\\b'])(
    'rejects %j',
    (key) => {
      expect(() => assertSafeKey(key)).toThrow(/Unsafe storage key/);
    },
  );
});

describe('LocalStorageDriver (the default)', () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wis-uploads-'));
    env = { UPLOADS_DIR: dir, API_PUBLIC_URL: 'https://api.example.com/' };
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes under the uploads root and returns the /uploads path', async () => {
    const stored = await new LocalStorageDriver(env).put(
      'share/12-x.svg',
      '<svg/>',
      'image/svg+xml',
    );

    expect(await readFile(join(dir, 'share', '12-x.svg'), 'utf8')).toBe(
      '<svg/>',
    );
    expect(stored).toEqual({
      key: 'share/12-x.svg',
      url: '/uploads/share/12-x.svg',
      absoluteUrl: 'https://api.example.com/uploads/share/12-x.svg',
    });
  });

  it('stores binary bodies unchanged', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);

    await new LocalStorageDriver(env).put('posts/a.png', png, 'image/png');

    expect((await readFile(join(dir, 'posts', 'a.png'))).equals(png)).toBe(
      true,
    );
  });

  it('refuses a key that would leave the uploads folder', async () => {
    await expect(
      new LocalStorageDriver(env).put('../evil.txt', 'x', 'text/plain'),
    ).rejects.toThrow(/Unsafe storage key/);
  });

  it('uploadsRoot follows UPLOADS_DIR, else ./uploads', () => {
    expect(uploadsRoot({ UPLOADS_DIR: dir })).toBe(dir);
    expect(uploadsRoot({}).endsWith('uploads')).toBe(true);
  });
});

describe('S3StorageDriver (R2 / any S3-compatible bucket)', () => {
  const make = () => {
    const send = jest.fn().mockResolvedValue({});
    const driver = new S3StorageDriver(readS3Settings(S3_ENV), { send });
    return { driver, send };
  };

  it('uploads with the content type and a long cache lifetime, and returns the public URL', async () => {
    const { driver, send } = make();

    const stored = await driver.put(
      'posts/a.png',
      Buffer.from('x'),
      'image/png',
    );

    const command = (send.mock.calls[0] as [PutObjectCommand])[0];
    expect(command.input).toMatchObject({
      Bucket: 'wisenancial-uploads',
      Key: 'posts/a.png',
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(stored).toEqual({
      key: 'posts/a.png',
      url: 'https://cdn.example.com/posts/a.png',
      absoluteUrl: 'https://cdn.example.com/posts/a.png',
    });
  });

  it('a failed upload is an error, not a silent success', async () => {
    const { driver, send } = make();
    send.mockRejectedValue(new Error('AccessDenied'));

    await expect(driver.put('a/b.png', 'x', 'image/png')).rejects.toThrow(
      'AccessDenied',
    );
  });

  it('refuses an unsafe key before talking to the bucket', async () => {
    const { driver, send } = make();

    await expect(driver.put('../x', 'x', 'text/plain')).rejects.toThrow(
      /Unsafe/,
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('createStorage', () => {
  it('local by default, and still local when only some S3_* variables are set (off until STORAGE_DRIVER=s3)', () => {
    expect(createStorage({}).name).toBe('local');
    expect(createStorage({ STORAGE_DRIVER: 'local' }).name).toBe('local');
    expect(
      createStorage({ S3_BUCKET: 'b', S3_ENDPOINT: 'https://x' }).name,
    ).toBe('local');
  });

  it('s3 when selected with a complete configuration', () => {
    expect(createStorage(S3_ENV).name).toBe('s3');
  });

  it('s3 without its settings fails at boot naming every missing variable, never a value', () => {
    const { S3_BUCKET: _b, S3_ACCESS_KEY_ID: _k, ...partial } = S3_ENV;
    void _b;
    void _k;

    expect(() => createStorage(partial)).toThrow(/S3_BUCKET, S3_ACCESS_KEY_ID/);
    expect(() => createStorage(partial)).not.toThrow(/secret/);
  });

  it('an unknown driver is an error', () => {
    expect(() => createStorage({ STORAGE_DRIVER: 'ftp' })).toThrow(
      /Unknown STORAGE_DRIVER/,
    );
  });

  it('region defaults to "auto" (R2)', () => {
    expect(readS3Settings(S3_ENV).region).toBe('auto');
    expect(readS3Settings({ ...S3_ENV, S3_REGION: 'us-east-1' }).region).toBe(
      'us-east-1',
    );
  });
});

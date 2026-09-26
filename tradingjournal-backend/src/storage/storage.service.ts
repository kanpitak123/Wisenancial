import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Where user-generated files (post images, share cards) are stored.
 *
 * Two drivers behind one interface:
 *  - local (default): files under ./uploads, served by the API at /uploads. Fine on a single
 *    machine with a persistent disk; lost on every deploy on most container hosts.
 *  - s3: any S3-compatible bucket (Cloudflare R2, AWS S3, ...). Off until STORAGE_DRIVER=s3
 *    is set together with the S3_* variables; having some S3_* variables without
 *    STORAGE_DRIVER=s3 changes nothing.
 */

export interface StoredFile {
  /** Object key inside the store, e.g. "share/12-...svg". */
  key: string;
  /**
   * What to keep in the database and hand to clients: a site-relative path for the local
   * driver ("/uploads/share/x.svg", the web app prefixes the API address) and an absolute
   * URL for the S3 driver.
   */
  url: string;
  /** Always an absolute URL, for API responses that are shared outside the app. */
  absoluteUrl: string;
}

export interface StorageDriver {
  readonly name: 'local' | 's3';
  put(
    key: string,
    body: Buffer | string,
    contentType: string,
  ): Promise<StoredFile>;
}

/** DI token: injected as `StorageService`. */
export abstract class StorageService implements StorageDriver {
  abstract readonly name: 'local' | 's3';
  abstract put(
    key: string,
    body: Buffer | string,
    contentType: string,
  ): Promise<StoredFile>;
}

/** Keys are ours ("posts/<uuid>.png") but still refuse anything that could climb out of the store. */
export function assertSafeKey(key: string): void {
  if (
    key === '' ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.split('/').some((part) => part === '..' || part === '')
  ) {
    throw new Error(`Unsafe storage key "${key}"`);
  }
}

export function uploadsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.UPLOADS_DIR?.trim() || join(process.cwd(), 'uploads'));
}

const apiBaseUrl = (env: NodeJS.ProcessEnv): string =>
  (env.API_PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, '');

// ── local ────────────────────────────────────────────────────────────────────────────────
export class LocalStorageDriver extends StorageService {
  readonly name = 'local' as const;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    super();
  }

  /** The content type is not needed on disk (the static handler infers it from the extension). */
  async put(
    key: string,
    body: Buffer | string,
    _contentType?: string,
  ): Promise<StoredFile> {
    assertSafeKey(key);

    const root = uploadsRoot(this.env);
    const path = resolve(root, key);
    if (!path.startsWith(root + sep)) {
      throw new Error(`Unsafe storage key "${key}"`);
    }

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);

    const url = `/uploads/${key}`;
    return { key, url, absoluteUrl: `${apiBaseUrl(this.env)}${url}` };
  }
}

// ── s3-compatible ────────────────────────────────────────────────────────────────────────
export interface S3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public base URL objects are served from (a public bucket domain / custom domain). */
  publicBaseUrl: string;
}

const S3_REQUIRED: Array<[keyof S3Settings, string]> = [
  ['endpoint', 'S3_ENDPOINT'],
  ['bucket', 'S3_BUCKET'],
  ['accessKeyId', 'S3_ACCESS_KEY_ID'],
  ['secretAccessKey', 'S3_SECRET_ACCESS_KEY'],
  ['publicBaseUrl', 'S3_PUBLIC_BASE_URL'],
];

export function readS3Settings(env: NodeJS.ProcessEnv): S3Settings {
  const value = (name: string) => env[name]?.trim() ?? '';
  const missing = S3_REQUIRED.filter(([, name]) => value(name) === '').map(
    ([, name]) => name,
  );

  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=s3 needs: ${missing.join(', ')} (see .env.production.example)`,
    );
  }

  return {
    endpoint: value('S3_ENDPOINT'),
    // Cloudflare R2 uses the pseudo-region "auto"
    region: value('S3_REGION') || 'auto',
    bucket: value('S3_BUCKET'),
    accessKeyId: value('S3_ACCESS_KEY_ID'),
    secretAccessKey: value('S3_SECRET_ACCESS_KEY'),
    publicBaseUrl: value('S3_PUBLIC_BASE_URL').replace(/\/$/, ''),
  };
}

/** Minimal client surface the driver needs; lets tests pass a fake. */
export interface S3Like {
  send(command: PutObjectCommand): Promise<unknown>;
}

export class S3StorageDriver extends StorageService {
  readonly name = 's3' as const;
  private readonly client: S3Like;

  constructor(
    private readonly settings: S3Settings,
    client?: S3Like,
  ) {
    super();
    this.client =
      client ??
      new S3Client({
        endpoint: settings.endpoint,
        region: settings.region,
        credentials: {
          accessKeyId: settings.accessKeyId,
          secretAccessKey: settings.secretAccessKey,
        },
      });
  }

  async put(
    key: string,
    body: Buffer | string,
    contentType: string,
  ): Promise<StoredFile> {
    assertSafeKey(key);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // keys contain a random id and are never rewritten, so they can be cached hard
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    const url = `${this.settings.publicBaseUrl}/${key}`;
    return { key, url, absoluteUrl: url };
  }
}

/** Driver from the environment: local unless STORAGE_DRIVER=s3 (and then S3_* must be complete). */
export function createStorage(
  env: NodeJS.ProcessEnv = process.env,
): StorageService {
  const driver = (env.STORAGE_DRIVER?.trim() || 'local').toLowerCase();

  if (driver === 'local') return new LocalStorageDriver(env);
  if (driver === 's3') return new S3StorageDriver(readS3Settings(env));

  throw new Error(`Unknown STORAGE_DRIVER "${driver}" (use "local" or "s3")`);
}

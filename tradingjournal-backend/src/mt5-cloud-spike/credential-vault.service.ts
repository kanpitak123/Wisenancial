import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Envelope encryption for the one new secret this spike introduces (the investor
 * password handed to CloudConnector). Nothing reusable already existed in the codebase
 * for this: BrokerApiKeyService (src/brokers/connections/broker-api-key.service.ts) only
 * ever hashes (one-way — fine for a key we never need back), and
 * broker_connections.oauth_*_encrypted columns are reserved but explicitly documented as
 * having "no encryption service" behind them yet (see schema.prisma). An investor
 * password has to be recoverable in plaintext to hand back to MetaApi, so hashing can't
 * substitute here — hence this small AES-256-GCM helper instead of reaching for a
 * one-way hash.
 *
 * Scoped to this spike module only (not promoted to a shared/ helper) — if the cloud
 * connector path is ever productionized, key management should move to a proper
 * KMS-backed envelope scheme (see docs/mt5-investor-password-spike.md "future work"),
 * not this raw-env-var key.
 */
export class Mt5CloudSpikeVaultError extends Error {}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

@Injectable()
export class CredentialVaultService {
  private loadKey(): Buffer {
    const raw = process.env.MT5_CLOUD_SPIKE_ENCRYPTION_KEY;

    if (!raw) {
      throw new Mt5CloudSpikeVaultError(
        'MT5_CLOUD_SPIKE_ENCRYPTION_KEY ยังไม่ถูกตั้งค่า — spike นี้ปฏิเสธที่จะเก็บ investor password ' +
          'แบบไม่เข้ารหัส ตั้งค่าด้วย: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      );
    }

    const key = Buffer.from(raw, 'base64');

    if (key.length !== 32) {
      throw new Mt5CloudSpikeVaultError(
        `MT5_CLOUD_SPIKE_ENCRYPTION_KEY ต้อง decode เป็น 32 ไบต์ (AES-256) พอดี ได้ ${key.length} ไบต์`,
      );
    }

    return key;
  }

  encrypt(plaintext: string): string {
    const key = this.loadKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // v1:<iv>:<authTag>:<ciphertext>, all base64 — versioned so a future key-rotation
    // or algorithm change has somewhere to branch from without a silent format mismatch
    return ['v1', iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(stored: string): string {
    const key = this.loadKey();
    const [version, ivB64, tagB64, ciphertextB64] = stored.split(':');

    if (version !== 'v1' || !ivB64 || !tagB64 || !ciphertextB64) {
      throw new Mt5CloudSpikeVaultError('รูปแบบ encrypted payload ไม่ถูกต้องหรือเสียหาย');
    }

    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }
}

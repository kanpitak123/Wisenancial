import { createHash } from 'crypto';
import { generateOneTimeToken, hashOneTimeToken } from './one-time-token.util';

describe('one-time token util', () => {
  it('produces a URL-safe 256-bit token and its SHA-256 hex hash', () => {
    const { token, tokenHash } = generateOneTimeToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(tokenHash).toHaveLength(64);
  });

  it('never returns the raw token as its own hash', () => {
    const { token, tokenHash } = generateOneTimeToken();

    expect(tokenHash).not.toContain(token);
  });

  it('is random: 1000 tokens are all distinct', () => {
    const tokens = new Set(
      Array.from({ length: 1000 }, () => generateOneTimeToken().token),
    );

    expect(tokens.size).toBe(1000);
  });

  it('hashOneTimeToken is deterministic so a presented token can be looked up', () => {
    const { token, tokenHash } = generateOneTimeToken();

    expect(hashOneTimeToken(token)).toBe(tokenHash);
    expect(hashOneTimeToken(`${token}x`)).not.toBe(tokenHash);
  });
});

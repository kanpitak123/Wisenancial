import { NotFoundException } from '@nestjs/common';
import { isBetaUser, Mt5CloudConnectorBetaGuard, parseBetaUserIds } from './mt5-cloud-connector-beta.guard';

function contextWithUser(userId: number | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => (userId === undefined ? {} : { user: { userId } }),
    }),
  } as never;
}

describe('Mt5CloudConnectorBetaGuard', () => {
  const ORIGINAL_ENABLED = process.env.MT5_CLOUD_SPIKE_ENABLED;
  const ORIGINAL_IDS = process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS;

  afterEach(() => {
    process.env.MT5_CLOUD_SPIKE_ENABLED = ORIGINAL_ENABLED;
    process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS = ORIGINAL_IDS;
  });

  describe('parseBetaUserIds', () => {
    it('parses a comma-separated list of positive integers', () => {
      process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS = '5, 12,7';
      expect(parseBetaUserIds()).toEqual(new Set([5, 12, 7]));
    });

    it('returns an empty set when unset — nobody allowed by default', () => {
      delete process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS;
      expect(parseBetaUserIds()).toEqual(new Set());
    });

    it('ignores garbage entries (non-numeric, zero, negative)', () => {
      process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS = '5,abc,-1,0,9';
      expect(parseBetaUserIds()).toEqual(new Set([5, 9]));
    });
  });

  describe('isBetaUser', () => {
    it('is false when the flag is off, even for an allowlisted id', () => {
      process.env.MT5_CLOUD_SPIKE_ENABLED = 'false';
      process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS = '5';
      expect(isBetaUser(5)).toBe(false);
    });

    it('is false when the flag is on but the id is not allowlisted', () => {
      process.env.MT5_CLOUD_SPIKE_ENABLED = 'true';
      process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS = '5';
      expect(isBetaUser(999)).toBe(false);
    });

    it('is true only when both the flag is on and the id is allowlisted', () => {
      process.env.MT5_CLOUD_SPIKE_ENABLED = 'true';
      process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS = '5';
      expect(isBetaUser(5)).toBe(true);
    });
  });

  describe('canActivate', () => {
    const guard = new Mt5CloudConnectorBetaGuard();

    it('throws NotFoundException (not Forbidden) for a non-allowlisted user', () => {
      process.env.MT5_CLOUD_SPIKE_ENABLED = 'true';
      process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS = '5';
      expect(() => guard.canActivate(contextWithUser(999))).toThrow(NotFoundException);
    });

    it('throws NotFoundException when there is no authenticated user on the request', () => {
      process.env.MT5_CLOUD_SPIKE_ENABLED = 'true';
      process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS = '5';
      expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(NotFoundException);
    });

    it('allows the request through for an allowlisted user with the flag on', () => {
      process.env.MT5_CLOUD_SPIKE_ENABLED = 'true';
      process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS = '5';
      expect(guard.canActivate(contextWithUser(5))).toBe(true);
    });
  });
});

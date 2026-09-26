import { describe, expect, it } from 'vitest';
import { assertProductionBuildEnv, checkProductionEnv } from './production-env';

describe('checkProductionEnv', () => {
  it('a public https API address is fine', () => {
    expect(checkProductionEnv({ VITE_API_URL: 'https://api.example.com' })).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it.each([undefined, '', '   '])('a missing VITE_API_URL (%j) is an error that says what to set', (value) => {
    const { errors } = checkProductionEnv(value === undefined ? {} : { VITE_API_URL: value });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/VITE_API_URL is not set/);
    expect(errors[0]).toMatch(/localhost:3000/);
  });

  it.each([
    ['http://localhost:3000', /points at localhost/],
    ['http://127.0.0.1:3000', /points at localhost/],
    ['http://api.example.com', /must be https/],
    ['api.example.com', /not a valid URL/],
    ['ftp://api.example.com', /http:\/\/ or https:\/\//],
  ])('%s is refused', (value, message) => {
    expect(checkProductionEnv({ VITE_API_URL: value }).errors.join()).toMatch(message);
  });

  it('mock mode flags are warnings, not errors', () => {
    const report = checkProductionEnv({
      VITE_API_URL: 'https://api.example.com',
      VITE_MOCK_MODE: 'true',
      VITE_ENABLE_MOCK_MODE: 'true',
    });

    expect(report.errors).toEqual([]);
    expect(report.warnings).toHaveLength(2);
  });
});

describe('assertProductionBuildEnv', () => {
  it('throws (which fails the build) without VITE_API_URL', () => {
    expect(() => assertProductionBuildEnv({})).toThrow(/Production build refused/);
  });

  it('passes with a valid address', () => {
    expect(() => assertProductionBuildEnv({ VITE_API_URL: 'https://api.example.com' })).not.toThrow();
  });
});

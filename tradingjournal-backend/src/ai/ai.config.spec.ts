import {
  DEFAULT_TIER_MODELS,
  loadEnabledAiProviders,
  resolveTierModel,
} from './ai.config';
import { AI_MODEL_REGISTRY } from './ai.models';

describe('loadEnabledAiProviders', () => {
  it('defaults to anthropic only', () => {
    expect([...loadEnabledAiProviders({})]).toEqual(['anthropic']);
  });

  it('parses a comma-separated list, ignoring case and whitespace', () => {
    const enabled = loadEnabledAiProviders({
      AI_PROVIDERS: ' Anthropic , GROQ ',
    });
    expect([...enabled].sort()).toEqual(['anthropic', 'groq']);
  });

  it('ignores unknown names', () => {
    const enabled = loadEnabledAiProviders({
      AI_PROVIDERS: 'anthropic,mistral',
    });
    expect([...enabled]).toEqual(['anthropic']);
  });

  it('falls back to the default when nothing usable is listed, never to "no provider"', () => {
    expect([...loadEnabledAiProviders({ AI_PROVIDERS: '' })]).toEqual([
      'anthropic',
    ]);
    expect([...loadEnabledAiProviders({ AI_PROVIDERS: 'mistral' })]).toEqual([
      'anthropic',
    ]);
  });
});

describe('resolveTierModel', () => {
  it('uses the env var when set', () => {
    expect(resolveTierModel('fast', { AI_MODEL_FAST: 'model-f' })).toBe(
      'model-f',
    );
    expect(resolveTierModel('smart', { AI_MODEL_SMART: ' model-s ' })).toBe(
      'model-s',
    );
  });

  it('falls back to the documented defaults when unset or blank', () => {
    expect(resolveTierModel('fast', {})).toBe(DEFAULT_TIER_MODELS.fast);
    expect(resolveTierModel('smart', { AI_MODEL_SMART: '  ' })).toBe(
      DEFAULT_TIER_MODELS.smart,
    );
  });
});

describe('registry tiers', () => {
  const saved = {
    fast: process.env.AI_MODEL_FAST,
    smart: process.env.AI_MODEL_SMART,
  };

  afterEach(() => {
    if (saved.fast === undefined) delete process.env.AI_MODEL_FAST;
    else process.env.AI_MODEL_FAST = saved.fast;
    if (saved.smart === undefined) delete process.env.AI_MODEL_SMART;
    else process.env.AI_MODEL_SMART = saved.smart;
  });

  it('claude-fast / claude-smart read their upstream model from env at call time', () => {
    process.env.AI_MODEL_FAST = 'fast-from-env';
    process.env.AI_MODEL_SMART = 'smart-from-env';

    expect(AI_MODEL_REGISTRY['claude-fast'].upstreamModel).toBe(
      'fast-from-env',
    );
    expect(AI_MODEL_REGISTRY['claude-smart'].upstreamModel).toBe(
      'smart-from-env',
    );

    process.env.AI_MODEL_FAST = 'changed';
    expect(AI_MODEL_REGISTRY['claude-fast'].upstreamModel).toBe('changed');
  });
});

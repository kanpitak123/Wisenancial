import { Logger } from '@nestjs/common';

const create = jest.fn();
const constructed: Array<Record<string, unknown>> = [];

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class {
    messages = { create };
    constructor(options: Record<string, unknown>) {
      constructed.push(options);
    }
  },
}));

import { AnthropicProvider } from './anthropic.provider';

const KEY = 'sk-ant-api03-' + 'a'.repeat(95);

const reply = {
  content: [{ type: 'text', text: '{"ok":true}' }],
  usage: { input_tokens: 5, output_tokens: 3 },
};

const temperatureRejected = () =>
  Object.assign(new Error('400 `temperature` is deprecated for this model.'), {
    status: 400,
  });

const ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  jest.clearAllMocks();
  constructed.length = 0;
  for (const name of ENV) saved[name] = process.env[name];
  process.env.ANTHROPIC_API_KEY = KEY;
  delete process.env.ANTHROPIC_WORKSPACE_ID;
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  jest.restoreAllMocks();
});

const request = (model: string) => ({
  upstreamModel: model,
  prompt: 'x',
  temperature: 0,
});

describe('AnthropicProvider', () => {
  it('sends the workspace header only when ANTHROPIC_WORKSPACE_ID is set', () => {
    new AnthropicProvider();
    expect(constructed[0]).not.toHaveProperty('defaultHeaders');

    process.env.ANTHROPIC_WORKSPACE_ID = 'wrkspc_test';
    new AnthropicProvider();
    expect(constructed[1]?.defaultHeaders).toEqual({
      'anthropic-workspace-id': 'wrkspc_test',
    });
  });

  it('sends temperature to models that accept it', async () => {
    create.mockResolvedValue(reply);

    const result = await new AnthropicProvider().generateJsonResponse(
      request('fast-model'),
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ temperature: 0 });
    expect(result.data).toEqual({ ok: true });
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 3 });
  });

  it('retries once without temperature when the model rejects it, then remembers', async () => {
    create.mockRejectedValueOnce(temperatureRejected());
    create.mockResolvedValue(reply);
    const provider = new AnthropicProvider();

    await provider.generateJsonResponse(request('smart-model'));

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]).toHaveProperty('temperature');
    expect(create.mock.calls[1]?.[0]).not.toHaveProperty('temperature');

    await provider.generateJsonResponse(request('smart-model'));

    // second call goes straight to the temperature-free request
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[2]?.[0]).not.toHaveProperty('temperature');

    // another model is not affected
    await provider.generateJsonResponse(request('fast-model'));
    expect(create.mock.calls[3]?.[0]).toHaveProperty('temperature');
  });

  it('does not retry unrelated 400s', async () => {
    create.mockRejectedValue(
      Object.assign(new Error('400 max_tokens too large'), { status: 400 }),
    );

    await expect(
      new AnthropicProvider().generateJsonResponse(request('fast-model')),
    ).rejects.toThrow(/max_tokens/);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

/**
 * specs/16-agent-performance-dashboard.md — costSource provenance.
 * Mocks the `openai` module (OpenRouterProvider drives OpenRouter through the
 * OpenAI-compatible SDK) so we can control `usage.cost` per test without a
 * real network call.
 */
const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

const { OpenRouterProvider } = await import('../src/llm/openrouter.js');

describe('OpenRouterProvider.completeStructured — costSource provenance', () => {
  beforeEach(() => mockCreate.mockReset());

  const schema = z.object({ ok: z.boolean() });
  const request = (extra: Record<string, unknown> = {}) => ({
    model: 'gpt-4.1',
    schema,
    schemaName: 'S',
    messages: [{ role: 'user' as const, content: 'hi' }],
    ...extra,
  });
  const okResponse = (usage: Record<string, unknown>) => ({
    choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    usage,
  });

  it("is 'provider' when OpenRouter's usage.cost extension fires", async () => {
    mockCreate.mockResolvedValue(okResponse({ prompt_tokens: 10, completion_tokens: 5, cost: 0.002 }));
    const provider = new OpenRouterProvider('key', { estimateCost: () => 0.5 });

    const res = await provider.completeStructured(request());

    expect(res.costUsd).toBe(0.002);
    expect(res.costSource).toBe('provider');
  });

  it("is 'estimated' when usage.cost is absent and the injected estimator prices it", async () => {
    mockCreate.mockResolvedValue(okResponse({ prompt_tokens: 10, completion_tokens: 5 }));
    const provider = new OpenRouterProvider('key', { estimateCost: () => 0.01 });

    const res = await provider.completeStructured(request());

    expect(res.costUsd).toBe(0.01);
    expect(res.costSource).toBe('estimated');
  });

  it('is null when neither the API nor the estimator produce a number', async () => {
    mockCreate.mockResolvedValue(okResponse({ prompt_tokens: 10, completion_tokens: 5 }));
    const provider = new OpenRouterProvider('key'); // no estimateCost injected

    const res = await provider.completeStructured(request());

    expect(res.costUsd).toBeNull();
    expect(res.costSource).toBeNull();
  });
});

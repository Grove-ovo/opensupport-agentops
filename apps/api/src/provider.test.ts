import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpLLMProviderAdapter, ProviderAdapterError } from './provider.js';

test('maps OpenAI-compatible requests and usage', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const adapter = new HttpLLMProviderAdapter(
    { openai: 'https://provider.example/' },
    async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return Response.json({
        choices: [{ message: { content: '{"reply":"ok"}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      });
    },
  );

  const result = await adapter.invoke(providerRequest('openai'));

  assert.deepEqual(result, {
    output: '{"reply":"ok"}',
    inputTokens: 12,
    outputTokens: 4,
  });
  assert.equal(requests[0]?.url, 'https://provider.example/v1/chat/completions');
  assert.equal(
    new Headers(requests[0]?.init.headers).get('authorization'),
    'Bearer tenant-key',
  );
  assert.equal(JSON.stringify(requests).includes('prompt text'), true);
});

test('maps Anthropic text blocks and usage', async () => {
  const adapter = new HttpLLMProviderAdapter(
    { anthropic: 'https://anthropic.example' },
    async (_input, init) => {
      assert.equal(new Headers(init?.headers).get('x-api-key'), 'tenant-key');
      return Response.json({
        content: [
          { type: 'text', text: '{"reply":' },
          { type: 'text', text: '"ok"}' },
        ],
        usage: { input_tokens: 9, output_tokens: 3 },
      });
    },
  );

  assert.deepEqual(await adapter.invoke(providerRequest('anthropic')), {
    output: '{"reply":"ok"}',
    inputTokens: 9,
    outputTokens: 3,
  });
});

test('returns stable provider adapter errors', async () => {
  const adapter = new HttpLLMProviderAdapter(
    { openai: 'https://provider.example' },
    async () =>
      new Response('<html>temporarily unavailable</html>', {
        status: 503,
        headers: { 'content-type': 'text/html' },
      }),
  );

  await assert.rejects(
    adapter.invoke(providerRequest('openai')),
    (error) =>
      error instanceof ProviderAdapterError &&
      error.code === 'provider_retryable_error',
  );
});

function providerRequest(provider: string) {
  return {
    provider,
    model: 'test-model',
    apiKey: 'tenant-key',
    prompt: 'prompt text',
    maxOutputTokens: 100,
    signal: new AbortController().signal,
  };
}

import type {
  LLMProviderAdapter,
  LLMProviderRequest,
  LLMProviderResponse,
} from '@opensupport/llm-runtime';

export class HttpLLMProviderAdapter implements LLMProviderAdapter {
  constructor(
    readonly baseUrls: Readonly<Record<string, string>> = {},
    readonly fetcher: typeof fetch = fetch,
  ) {}

  async invoke(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    return request.provider.toLowerCase() === 'anthropic'
      ? this.invokeAnthropic(request)
      : this.invokeOpenAICompatible(request);
  }

  private async invokeOpenAICompatible(
    request: LLMProviderRequest,
  ): Promise<LLMProviderResponse> {
    const baseUrl =
      this.baseUrls[request.provider] ??
      (request.provider === 'openai' ? 'https://api.openai.com' : null);
    if (baseUrl === null) {
      throw new ProviderAdapterError('provider_base_url_missing');
    }
    const response = await this.fetcher(
      `${stripTrailingSlash(baseUrl)}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: [{ role: 'user', content: request.prompt }],
          max_tokens: request.maxOutputTokens,
          response_format: { type: 'json_object' },
        }),
        signal: request.signal,
      },
    );
    if (!response.ok) {
      await response.arrayBuffer();
      throw new ProviderAdapterError(mapProviderStatus(response.status));
    }
    const body = await readJson(response);
    const content = nested(body, ['choices', 0, 'message', 'content']);
    const inputTokens = nested(body, ['usage', 'prompt_tokens']);
    const outputTokens = nested(body, ['usage', 'completion_tokens']);
    if (
      typeof content !== 'string' ||
      typeof inputTokens !== 'number' ||
      typeof outputTokens !== 'number'
    ) {
      throw new ProviderAdapterError('invalid_provider_response');
    }
    return { output: content, inputTokens, outputTokens };
  }

  private async invokeAnthropic(
    request: LLMProviderRequest,
  ): Promise<LLMProviderResponse> {
    const baseUrl = this.baseUrls.anthropic ?? 'https://api.anthropic.com';
    const response = await this.fetcher(`${stripTrailingSlash(baseUrl)}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': request.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxOutputTokens,
        messages: [{ role: 'user', content: request.prompt }],
      }),
      signal: request.signal,
    });
    if (!response.ok) {
      await response.arrayBuffer();
      throw new ProviderAdapterError(mapProviderStatus(response.status));
    }
    const body = await readJson(response);
    const blocks = nested(body, ['content']);
    const content = Array.isArray(blocks)
      ? blocks
          .filter(
            (block): block is { type: 'text'; text: string } =>
              typeof block === 'object' &&
              block !== null &&
              Reflect.get(block, 'type') === 'text' &&
              typeof Reflect.get(block, 'text') === 'string',
          )
          .map((block) => block.text)
          .join('')
      : '';
    const inputTokens = nested(body, ['usage', 'input_tokens']);
    const outputTokens = nested(body, ['usage', 'output_tokens']);
    if (
      content.length === 0 ||
      typeof inputTokens !== 'number' ||
      typeof outputTokens !== 'number'
    ) {
      throw new ProviderAdapterError('invalid_provider_response');
    }
    return { output: content, inputTokens, outputTokens };
  }
}

export class ProviderAdapterError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProviderAdapterError';
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderAdapterError('invalid_provider_response');
  }
}

function nested(value: unknown, path: readonly (string | number)[]): unknown {
  let cursor = value;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(cursor)) return undefined;
      cursor = cursor[segment];
    } else {
      if (
        typeof cursor !== 'object' ||
        cursor === null ||
        Array.isArray(cursor)
      ) {
        return undefined;
      }
      cursor = Reflect.get(cursor, segment);
    }
  }
  return cursor;
}

function mapProviderStatus(status: number): string {
  if (status === 401 || status === 403) return 'provider_auth_failed';
  if (status === 408 || status === 429 || status >= 500) {
    return 'provider_retryable_error';
  }
  return 'provider_rejected';
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatCompletion } from '../../src/services/chat-completions-client.js';
import { createSpeech } from '../../src/services/speech-client.js';

const provider = { baseUrl: 'https://api.test/v1', apiKey: 'sk-secret' };

/** @param {unknown} body @param {number} [status] */
function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createChatCompletion', () => {
  it('constructs the request with auth header and json mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }], model: 'm' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createChatCompletion({
      provider,
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      jsonMode: true,
    });

    expect(result.content).toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer sk-secret');
    expect(JSON.parse(init.body).response_format).toEqual({ type: 'json_object' });
  });

  it('normalizes 401 to auth error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(
      createChatCompletion({ provider, model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ kind: 'auth', status: 401 });
  });

  it('normalizes 429 with Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, 429, { 'retry-after': '17' })),
    );
    await expect(
      createChatCompletion({ provider, model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ kind: 'rate-limit', retryable: true, retryAfterSeconds: 17 });
  });

  it('normalizes network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(
      createChatCompletion({ provider, model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ kind: 'network', retryable: true });
  });

  it('rejects malformed success payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ choices: [] })));
    await expect(
      createChatCompletion({ provider, model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ kind: 'provider' });
  });

  it('aborts map to cancelled', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url, init) =>
          new Promise((_, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const promise = createChatCompletion({
      provider,
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ kind: 'cancelled' });
  });
});

describe('createSpeech', () => {
  it('posts to /audio/speech and returns audio bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await createSpeech({
      provider,
      model: 'tts-1',
      voice: 'alloy',
      input: 'hello',
      speed: 1.2,
    });
    expect(result.contentType).toBe('audio/mpeg');
    expect(new Uint8Array(result.audio)).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/audio/speech');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'tts-1', voice: 'alloy', input: 'hello', speed: 1.2 });
  });

  it('omits speed when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([9]).buffer));
    vi.stubGlobal('fetch', fetchMock);
    await createSpeech({ provider, model: 'tts-1', voice: 'alloy', input: 'hi' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect('speed' in body).toBe(false);
  });

  it('normalizes 404 to unsupported', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    await expect(
      createSpeech({ provider, model: 'tts-1', voice: 'alloy', input: 'hi' }),
    ).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it('rejects empty audio bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ArrayBuffer(0))));
    await expect(
      createSpeech({ provider, model: 'tts-1', voice: 'alloy', input: 'hi' }),
    ).rejects.toMatchObject({ kind: 'provider' });
  });
});

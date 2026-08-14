import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatCompletion } from '../../src/services/chat-completions-client.js';
import { createResponse } from '../../src/services/responses-client.js';
import { generateText } from '../../src/services/text-generation-client.js';
import { createSpeech, decodeSpeechAudio } from '../../src/services/speech-client.js';

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
    expect(JSON.parse(init.body).store).toBe(false);
  });

  it('falls back to prompt-constrained JSON when a provider rejects json_object', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "'response_format.type' must be 'json_schema' or 'text'" }, 400))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createChatCompletion({
      provider,
      model: 'google/gemma-4-e4b',
      messages: [{ role: 'user', content: 'Return JSON.' }],
      jsonMode: true,
    });

    expect(result.content).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toEqual({ type: 'json_object' });
    expect('response_format' in JSON.parse(fetchMock.mock.calls[1][1].body)).toBe(false);
  });

  it('does not retry unrelated bad requests in json mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'temperature is invalid' }, 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createChatCompletion({
      provider,
      model: 'm',
      messages: [{ role: 'user', content: 'Return JSON.' }],
      jsonMode: true,
    })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('omits the authorization header for an unauthenticated provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }], model: 'local-model' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createChatCompletion({
      provider: { baseUrl: 'http://192.168.1.20:1234/v1', auth: 'none', apiKey: '' },
      model: 'local-model',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'content-type': 'application/json' });
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

describe('createResponse', () => {
  it('constructs a Responses request and extracts ordered typed text output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      model: 'gpt-5.6-luna',
      status: 'completed',
      output: [
        { type: 'reasoning', content: [] },
        { type: 'message', content: [
          { type: 'output_text', text: '{"ok":' },
          { type: 'output_text', text: 'true}' },
        ] },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createResponse({
      provider,
      model: 'gpt-5.6-luna',
      messages: [{ role: 'user', content: 'hi' }],
      jsonMode: true,
    });
    expect(result).toEqual({ content: '{"ok":true}', model: 'gpt-5.6-luna' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/responses');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'gpt-5.6-luna',
      input: [{ role: 'user', content: 'hi' }],
      store: false,
      text: { format: { type: 'json_object' } },
    });
  });

  it.each([
    [{ status: 'incomplete', output: [] }, /incomplete/],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }, /refused/],
    [{ status: 'completed', output: [] }, /empty/],
    [{ status: 'completed' }, /malformed/],
  ])('rejects unsuccessful success payload %#', async (body, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));
    await expect(createResponse({ provider, model: 'm', messages: [] }))
      .rejects.toMatchObject({ kind: 'provider', retryable: false, message: expect.stringMatching(message) });
  });

  it('normalizes HTTP, network, and cancellation failures through shared transport', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(createResponse({ provider, model: 'm', messages: [] }))
      .rejects.toMatchObject({ kind: 'auth' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await expect(createResponse({ provider, model: 'm', messages: [] }))
      .rejects.toMatchObject({ kind: 'network' });

    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const promise = createResponse({ provider, model: 'm', messages: [], signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('normalizes request timeout through shared transport', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    await expect(createResponse({ provider, model: 'm', messages: [], timeoutMs: 1 }))
      .rejects.toMatchObject({ kind: 'network', retryable: true, message: expect.stringMatching(/timed out/) });
  });
});

describe('generateText', () => {
  it('dispatches using the configuration-bound API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
    })));
    await generateText({
      provider: { ...provider, textGeneration: { api: 'responses', models: ['m'] } },
      model: 'm',
      messages: [],
    });
    expect(fetch.mock.calls[0][0]).toBe('https://api.test/v1/responses');
  });

  it('rejects an unknown configured API', () => {
    expect(() => generateText({
      provider: { ...provider, textGeneration: { api: 'unknown', models: ['m'] } },
      model: 'm', messages: [],
    })).toThrowError(/not supported/);
  });
});

describe('createSpeech', () => {
  const ttsModel = { model: 'tts-1', voices: ['alloy'], responseFormat: 'mp3' };
  it('posts an MP3 speech request to /audio/speech and returns audio bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg', 'x-generation-id': 'gen-123' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await createSpeech({
      provider,
      ttsModel,
      voice: 'alloy',
      input: 'hello',
      speed: 1.2,
    });
    expect(result.contentType).toBe('audio/mpeg');
    expect(new Uint8Array(result.audio)).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.diagnostics).toMatchObject({
      operation: 'speech synthesis',
      endpoint: 'https://api.test/v1/audio/speech',
      model: 'tts-1',
      status: 200,
      requestId: 'gen-123',
      contentType: 'audio/mpeg',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/audio/speech');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      model: 'tts-1',
      voice: 'alloy',
      input: 'hello',
      response_format: 'mp3',
      speed: 1.2,
    });
  });

  it('omits speed when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([9]).buffer));
    vi.stubGlobal('fetch', fetchMock);
    await createSpeech({ provider, ttsModel, voice: 'alloy', input: 'hi' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toBe('mp3');
    expect('speed' in body).toBe(false);
  });

  it('rejects out-of-range speed before sending a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createSpeech({ provider, ttsModel, voice: 'alloy', input: 'hi', speed: 4.1 }),
    ).rejects.toMatchObject({ kind: 'validation' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes 404 to unsupported', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    await expect(
      createSpeech({ provider, ttsModel, voice: 'alloy', input: 'hi' }),
    ).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it('rejects empty audio bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ArrayBuffer(0))));
    await expect(
      createSpeech({ provider, ttsModel, voice: 'alloy', input: 'hi' }),
    ).rejects.toMatchObject({ kind: 'provider' });
  });

  it('rejects a successful non-audio response with diagnostics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'not audio' }, 200, {
      'x-request-id': 'req-json',
    })));
    await expect(
      createSpeech({ provider, ttsModel, voice: 'alloy', input: 'hi' }),
    ).rejects.toMatchObject({
      kind: 'provider',
      status: 200,
      diagnostics: {
        operation: 'speech synthesis',
        model: 'tts-1',
        requestId: 'req-json',
        contentType: 'application/json',
      },
    });
  });

  it('preserves provider context when browser audio decoding fails', async () => {
    const result = {
      audio: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'audio/mpeg',
      diagnostics: {
        operation: 'speech synthesis',
        endpoint: 'https://api.test/v1/audio/speech',
        model: 'tts-1',
        status: 200,
        requestId: 'gen-decode',
      },
      ttsModel,
    };
    await expect(
      decodeSpeechAudio(result, () => Promise.reject(new DOMException('invalid bytes', 'EncodingError')), 44_100),
    ).rejects.toMatchObject({
      kind: 'encoding',
      message: expect.stringMatching(/could not decode/),
      diagnostics: {
        operation: 'speech synthesis',
        model: 'tts-1',
        requestId: 'gen-decode',
        contentType: 'audio/mpeg',
      },
    });
  });
});

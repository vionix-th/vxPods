import { appError, httpStatusToAppError, parseRetryAfter, toAppError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * @typedef {Object} ChatMessage
 * @property {'system'|'user'|'assistant'} role
 * @property {string} content
 */

/**
 * Call an OpenAI-compatible Chat Completions endpoint.
 *
 * @param {Object} args
 * @param {{ baseUrl: string, apiKey: string }} args.provider
 * @param {string} args.model
 * @param {ChatMessage[]} args.messages
 * @param {AbortSignal} [args.signal]
 * @param {number} [args.temperature]
 * @param {boolean} [args.jsonMode] request response_format json_object
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{ content: string, model: string | undefined }>}
 */
export async function createChatCompletion(args) {
  const { provider, model, messages } = args;
  const body = {
    model,
    messages,
    temperature: args.temperature ?? 0.7,
  };
  if (args.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  const response = await sendRequest({
    url: `${provider.baseUrl}/chat/completions`,
    provider,
    body,
    signal: args.signal,
    timeoutMs: args.timeoutMs,
  });
  const json = await parseJsonResponse(response);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw appError({
      kind: 'provider',
      message: 'Provider returned an empty or malformed chat response.',
      retryable: true,
      status: 200,
    });
  }
  return { content, model: json?.model };
}

/**
 * Lightweight connectivity/capability probe used by "Test Chat".
 * @param {{ baseUrl: string, apiKey: string }} provider
 * @param {string} model
 * @param {AbortSignal} [signal]
 */
export async function testChatConnection(provider, model, signal) {
  return createChatCompletion({
    provider,
    model,
    messages: [
      { role: 'system', content: 'Reply with the word ok.' },
      { role: 'user', content: 'ok' },
    ],
    temperature: 0,
    timeoutMs: 30_000,
    signal,
  });
}

/**
 * Shared POST helper with timeout, auth header, and error normalization.
 * @param {Object} args
 * @param {string} args.url
 * @param {{ apiKey: string }} args.provider
 * @param {unknown} args.body
 * @param {AbortSignal} [args.signal]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<Response>}
 */
async function sendRequest({ url, provider, body, signal, timeoutMs }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw appError({
      kind: 'offline',
      message: 'Browser is offline. Connect to the internet to generate.',
      retryable: false,
      status: undefined,
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw appError({
        kind: 'cancelled',
        message: 'Request cancelled.',
        retryable: false,
        status: undefined,
      });
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted && controller.signal.reason === 'timeout') {
      throw appError({
        kind: 'network',
        message: 'Request timed out. Check the provider URL and network.',
        retryable: true,
        status: undefined,
        cause: err,
      });
    }
    if (signal?.aborted) {
      throw appError({
        kind: 'cancelled',
        message: 'Request cancelled.',
        retryable: false,
        status: undefined,
        cause: err,
      });
    }
    throw appError({
      kind: 'network',
      message:
        'Network or CORS failure. Check the provider URL, endpoint CORS support, and connection.',
      retryable: true,
      status: undefined,
      cause: err,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
  if (!response.ok) {
    const bodyText = await safeReadText(response);
    throw httpStatusToAppError(response.status, bodyText, {
      retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
    });
  }
  return response;
}

/**
 * @param {Response} response
 */
async function parseJsonResponse(response) {
  const text = await safeReadText(response);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw appError({
      kind: 'provider',
      message: 'Provider returned invalid JSON.',
      retryable: false,
      status: 200,
      cause: err,
    });
  }
}

/**
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export { toAppError };

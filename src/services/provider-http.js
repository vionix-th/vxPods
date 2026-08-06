import { appError, httpStatusToAppError, parseRetryAfter } from './errors.js';

/**
 * Send one authenticated provider request with consistent offline, timeout,
 * cancellation, network, and HTTP error handling.
 *
 * @param {Object} args
 * @param {string} args.url
 * @param {{ apiKey: string }} args.provider
 * @param {unknown} args.body
 * @param {AbortSignal} [args.signal]
 * @param {number} args.timeoutMs
 * @param {string} args.timeoutMessage
 * @returns {Promise<Response>}
 */
export async function sendProviderRequest(args) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw appError({
      kind: 'offline',
      message: 'Browser is offline. Connect to the internet to generate.',
      retryable: false,
      status: undefined,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), args.timeoutMs);
  const onAbort = () => controller.abort(args.signal?.reason);
  if (args.signal) {
    if (args.signal.aborted) {
      clearTimeout(timeout);
      throw cancelledError();
    }
    args.signal.addEventListener('abort', onAbort, { once: true });
  }

  let response;
  try {
    response = await fetch(args.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${args.provider.apiKey}`,
      },
      body: JSON.stringify(args.body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted && controller.signal.reason === 'timeout') {
      throw appError({
        kind: 'network',
        message: args.timeoutMessage,
        retryable: true,
        status: undefined,
        cause: err,
      });
    }
    if (args.signal?.aborted) throw cancelledError(err);
    throw appError({
      kind: 'network',
      message: 'Network or CORS failure. Check the provider URL, endpoint CORS support, and connection.',
      retryable: true,
      status: undefined,
      cause: err,
    });
  } finally {
    clearTimeout(timeout);
    args.signal?.removeEventListener('abort', onAbort);
  }

  if (!response.ok) {
    const bodyText = await safeReadText(response);
    throw httpStatusToAppError(response.status, bodyText, {
      retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
    });
  }
  return response;
}

/** @param {Response} response */
export async function parseProviderJson(response) {
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

/** @param {Response} response */
export async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/** @param {unknown} [cause] */
function cancelledError(cause) {
  return appError({
    kind: 'cancelled',
    message: 'Request cancelled.',
    retryable: false,
    status: undefined,
    cause,
  });
}

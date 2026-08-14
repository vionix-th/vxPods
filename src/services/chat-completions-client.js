import { appError } from './errors.js';
import { parseProviderJson, sendProviderRequest } from './provider-http.js';

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
 * @param {boolean} [args.jsonMode] request structured JSON output
 * @param {{ name?: string, schema: object }} [args.jsonSchema] JSON Schema for structured output fallback
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{ content: string, model: string | undefined }>}
 */
export async function createChatCompletion(args) {
  const { model, messages } = args;
  const body = {
    model,
    messages,
    temperature: args.temperature ?? 0.7,
    store: false,
  };
  if (args.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  let response;
  try {
    response = await sendChatRequest(args, body);
  } catch (error) {
    // Some OpenAI-compatible servers only accept `json_schema` and reject
    // OpenAI's `json_object`. Retry with the provider's structured-output form.
    if (!shouldRetryWithoutResponseFormat(error, args, body)) throw error;
    const fallbackBody = { ...body };
    fallbackBody.response_format = {
      type: 'json_schema',
      json_schema: {
        name: args.jsonSchema?.name || 'vxpods_response',
        strict: true,
        schema: args.jsonSchema?.schema || { type: 'object' },
      },
    };
    response = await sendChatRequest(args, fallbackBody);
  }
  const json = await parseProviderJson(response);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw appError({
      kind: 'provider',
      message: 'Provider returned an empty or malformed chat response.',
      retryable: false,
      status: 200,
    });
  }
  return { content, model: json?.model };
}

function sendChatRequest(args, body) {
  return sendProviderRequest({
    url: `${args.provider.baseUrl}/chat/completions`,
    provider: args.provider,
    body,
    signal: args.signal,
    timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    timeoutMessage: 'Request timed out. Check the provider URL and network.',
  });
}

function shouldRetryWithoutResponseFormat(error, args, body) {
  return Boolean(
    args.jsonMode
      && body.response_format
      && error?.status === 400
      && /response[_ ]format/i.test(error.message || ''),
  );
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

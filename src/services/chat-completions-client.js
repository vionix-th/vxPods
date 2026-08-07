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
    store: false,
  };
  if (args.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  const response = await sendProviderRequest({
    url: `${provider.baseUrl}/chat/completions`,
    provider,
    body,
    signal: args.signal,
    timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    timeoutMessage: 'Request timed out. Check the provider URL and network.',
  });
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

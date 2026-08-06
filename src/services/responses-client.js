import { appError } from './errors.js';
import { parseProviderJson, sendProviderRequest } from './provider-http.js';

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Call an OpenAI-compatible Responses endpoint.
 * @param {Object} args
 * @param {{ baseUrl: string, apiKey: string }} args.provider
 * @param {string} args.model
 * @param {{ role: 'system'|'user'|'assistant', content: string }[]} args.messages
 * @param {AbortSignal} [args.signal]
 * @param {boolean} [args.jsonMode]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{ content: string, model: string | undefined }>}
 */
export async function createResponse(args) {
  const body = {
    model: args.model,
    input: args.messages,
    store: false,
  };
  if (args.jsonMode) body.text = { format: { type: 'json_object' } };

  const response = await sendProviderRequest({
    url: `${args.provider.baseUrl}/responses`,
    provider: args.provider,
    body,
    signal: args.signal,
    timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    timeoutMessage: 'Request timed out. Check the provider URL and network.',
  });
  const json = await parseProviderJson(response);
  if (json?.status === 'incomplete') throw malformedResponse('Provider returned an incomplete response.');

  const textParts = [];
  let refused = false;
  if (!Array.isArray(json?.output)) throw malformedResponse('Provider returned a malformed Responses payload.');
  for (const item of json.output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') textParts.push(part.text);
      if (part?.type === 'refusal') refused = true;
    }
  }
  if (refused) throw malformedResponse('Provider refused the text generation request.');
  const content = textParts.join('');
  if (!content.trim()) throw malformedResponse('Provider returned an empty Responses output.');
  return { content, model: typeof json.model === 'string' ? json.model : undefined };
}

/** @param {string} message */
function malformedResponse(message) {
  return appError({ kind: 'provider', message, retryable: false, status: 200 });
}

/** Lightweight capability probe used by provider settings. */
export async function testResponsesConnection(provider, model, signal) {
  return createResponse({
    provider,
    model,
    messages: [
      { role: 'system', content: 'Reply with the word ok.' },
      { role: 'user', content: 'ok' },
    ],
    timeoutMs: 30_000,
    signal,
  });
}

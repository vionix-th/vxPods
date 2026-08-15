import { appError } from './errors.js';
import { parseProviderJson, sendProviderRequest } from './provider-http.js';
import { JSON_RESPONSE_FORMATS } from '../domain/provider-config.js';

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Call an OpenAI-compatible Responses endpoint.
 * @param {Object} args
 * @param {{ baseUrl: string, apiKey: string }} args.provider
 * @param {string} args.model
 * @param {{ role: 'system'|'user'|'assistant', content: string }[]} args.messages
 * @param {AbortSignal} [args.signal]
 * @param {boolean} [args.jsonMode]
 * @param {{ name?: string, schema: object }} [args.jsonSchema]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{ content: string, model: string | undefined }>}
 */
export async function createResponse(args) {
  const body = {
    model: args.model,
    input: args.messages,
  };
  if (args.provider.requestOptions?.storeMode !== 'omit') body.store = false;
  const maxOutputTokens = args.provider.requestOptions?.maxOutputTokens;
  if (Number.isInteger(maxOutputTokens)) body.max_output_tokens = maxOutputTokens;
  if (Number.isFinite(args.provider.requestOptions?.temperature)) body.temperature = args.provider.requestOptions.temperature;
  if (args.jsonMode) body.text = { format: structuredResponseFormat(args) };

  const response = await sendProviderRequest({
    url: `${args.provider.baseUrl}/responses`,
    provider: args.provider,
    body,
    signal: args.signal,
    timeoutMs: args.timeoutMs ?? args.provider.requestOptions?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
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

function structuredResponseFormat(args) {
  if (args.provider.textGeneration?.jsonResponseFormat !== JSON_RESPONSE_FORMATS.jsonSchema) {
    return { type: JSON_RESPONSE_FORMATS.jsonObject };
  }
  if (args.provider.textGeneration?.jsonSchemaWireFormat === 'json_object_schema') {
    return { type: JSON_RESPONSE_FORMATS.jsonObject, schema: args.jsonSchema?.schema || { type: 'object' } };
  }
  return {
    type: JSON_RESPONSE_FORMATS.jsonSchema,
    name: args.jsonSchema?.name || 'vxpods_response',
    strict: true,
    schema: args.jsonSchema?.schema || { type: 'object' },
  };
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
      { role: 'system', content: 'Return exactly one JSON object with a status field.' },
      { role: 'user', content: 'Return a status of ok.' },
    ],
    jsonMode: true,
    jsonSchema: CONNECTION_TEST_JSON_SCHEMA,
    timeoutMs: 30_000,
    signal,
  });
}

const CONNECTION_TEST_JSON_SCHEMA = {
  name: 'connection_test',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { status: { type: 'string' } },
    required: ['status'],
  },
};

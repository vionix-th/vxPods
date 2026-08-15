import { appError } from './errors.js';
import { parseProviderJson, sendProviderRequest } from './provider-http.js';
import { JSON_RESPONSE_FORMATS } from '../domain/provider-config.js';

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
 * @param {{ name?: string, schema: object }} [args.jsonSchema] JSON Schema used when configured
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{ content: string, model: string | undefined }>}
 */
export async function createChatCompletion(args) {
  const { model, messages } = args;
  const body = {
    model,
    messages,
  };
  const temperature = args.temperature ?? args.provider.requestOptions?.temperature;
  if (Number.isFinite(temperature)) body.temperature = temperature;
  if (args.provider.requestOptions?.storeMode !== 'omit') body.store = false;
  const maxOutputTokens = args.provider.requestOptions?.maxOutputTokens;
  if (Number.isInteger(maxOutputTokens)) body.max_tokens = maxOutputTokens;
  if (args.jsonMode) {
    body.response_format = structuredResponseFormat(args);
  }
  const response = await sendChatRequest(args, body);
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

function structuredResponseFormat(args) {
  if (args.provider.textGeneration?.jsonResponseFormat !== JSON_RESPONSE_FORMATS.jsonSchema) {
    return { type: JSON_RESPONSE_FORMATS.jsonObject };
  }
  if (args.provider.textGeneration?.jsonSchemaWireFormat === 'json_object_schema') {
    return { type: JSON_RESPONSE_FORMATS.jsonObject, schema: args.jsonSchema?.schema || { type: 'object' } };
  }
  return {
    type: JSON_RESPONSE_FORMATS.jsonSchema,
    json_schema: {
      name: args.jsonSchema?.name || 'vxpods_response',
      strict: true,
      schema: args.jsonSchema?.schema || { type: 'object' },
    },
  };
}

function sendChatRequest(args, body) {
  return sendProviderRequest({
    url: `${args.provider.baseUrl}/chat/completions`,
    provider: args.provider,
    body,
    signal: args.signal,
    timeoutMs: args.timeoutMs ?? args.provider.requestOptions?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    timeoutMessage: 'Request timed out. Check the provider URL and network.',
  });
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

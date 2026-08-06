import { AppError } from './errors.js';
import { createChatCompletion, testChatConnection } from './chat-completions-client.js';
import { createResponse, testResponsesConnection } from './responses-client.js';

/** Route a normalized text-generation request through the configured API. */
export function generateText(args) {
  switch (args.provider.textGeneration?.api) {
    case 'chat-completions':
      return createChatCompletion(args);
    case 'responses':
      return createResponse(args);
    default:
      throw unsupportedApiError();
  }
}

/** Test the selected configuration's text-generation route. */
export function testTextGenerationConnection(provider, model, signal) {
  switch (provider.textGeneration?.api) {
    case 'chat-completions':
      return testChatConnection(provider, model, signal);
    case 'responses':
      return testResponsesConnection(provider, model, signal);
    default:
      throw unsupportedApiError();
  }
}

function unsupportedApiError() {
  return new AppError({
    kind: 'unsupported',
    message: 'The selected text generation API is not supported.',
    retryable: false,
    status: undefined,
  });
}

/**
 * Normalized application error. Every boundary (HTTP, storage, codec, schema)
 * converts failures into this shape so UI can present a stable category.
 *
 * @typedef {Object} AppErrorShape
 * @property {'validation'|'auth'|'unsupported'|'rate-limit'|'network'|'offline'|'storage'|'schema'|'encoding'|'cancelled'|'provider'} kind
 * @property {string} message
 * @property {boolean} retryable
 * @property {number | undefined} status
 * @property {unknown | undefined} cause
 * @property {number | undefined} [retryAfterSeconds]
 * @property {ProviderDiagnostics | undefined} [diagnostics] redacted request context safe for user reports
 */

/**
 * @typedef {Object} ProviderDiagnostics
 * @property {string | undefined} [operation]
 * @property {string | undefined} [endpoint]
 * @property {string | undefined} [model]
 * @property {number | undefined} [status]
 * @property {string | undefined} [requestId]
 * @property {string | undefined} [contentType]
 */

export class AppError extends Error {
  /**
   * @param {AppErrorShape} shape
   */
  constructor(shape) {
    super(shape.message);
    this.name = 'AppError';
    this.kind = shape.kind;
    this.retryable = Boolean(shape.retryable);
    this.status = shape.status;
    this.cause = shape.cause;
    /** @type {number | undefined} seconds hint supplied via Retry-After */
    this.retryAfterSeconds = shape.retryAfterSeconds;
    /** @type {ProviderDiagnostics | undefined} redacted context; never contains credentials or request input */
    this.diagnostics = normalizeDiagnostics(shape.diagnostics);
  }
}

/**
 * @param {AppErrorShape} shape
 * @returns {AppError}
 */
export function appError(shape) {
  return new AppError(shape);
}

/**
 * Convert any thrown value into an AppError, preserving AppErrors unchanged.
 * @param {unknown} err
 * @param {Partial<AppErrorShape> & { message?: string }} [fallback]
 * @returns {AppError}
 */
export function toAppError(err, fallback = {}) {
  if (err instanceof AppError) return err;
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new AppError({
      kind: 'cancelled',
      message: fallback.message || 'Request cancelled.',
      retryable: false,
      status: undefined,
      cause: err,
      diagnostics: fallback.diagnostics,
    });
  }
  const message =
    fallback.message ||
    (err instanceof Error && err.message ? err.message : 'Unexpected error.');
  return new AppError({
    kind: fallback.kind || 'provider',
    message,
    retryable: fallback.retryable ?? false,
    status: fallback.status,
    cause: err,
    diagnostics: fallback.diagnostics,
  });
}

/**
 * Map an HTTP error response to an AppError category.
 * @param {number} status
 * @param {string} [bodyText] raw provider body, already read as text
 * @param {{ retryAfterSeconds?: number, diagnostics?: ProviderDiagnostics }} [opts]
 * @returns {AppError}
 */
export function httpStatusToAppError(status, bodyText = '', opts = {}) {
  const detail = summarizeProviderBody(bodyText);
  if (status === 401 || status === 403) {
    return new AppError({
      kind: 'auth',
      message: `Authentication failed (${status}). Check the API key for this configuration.${detail}`,
      retryable: false,
      status,
      diagnostics: opts.diagnostics,
    });
  }
  if (status === 404) {
    return new AppError({
      kind: 'unsupported',
      message: `Endpoint or model not found (404). This provider may not support this route.${detail}`,
      retryable: false,
      status,
      diagnostics: opts.diagnostics,
    });
  }
  if (status === 402) {
    return new AppError({
      kind: 'provider',
      message: `Provider account has insufficient credits or requires payment (402).${detail}`,
      retryable: false,
      status,
      diagnostics: opts.diagnostics,
    });
  }
  if (status === 429) {
    const wait = opts.retryAfterSeconds;
    const err = new AppError({
      kind: 'rate-limit',
      message: wait
        ? `Rate limit reached. Retry available in ${wait} seconds.`
        : 'Rate limit reached. Retry shortly.',
      retryable: true,
      status,
      diagnostics: opts.diagnostics,
    });
    err.retryAfterSeconds = wait;
    return err;
  }
  if (status === 400 || status === 422) {
    return new AppError({
      kind: 'provider',
      message: `Provider rejected the request (${status}).${detail}`,
      retryable: false,
      status,
      diagnostics: opts.diagnostics,
    });
  }
  if (status >= 500) {
    return new AppError({
      kind: 'provider',
      message: `Provider error (${status}). Retry may succeed.${detail}`,
      retryable: true,
      status,
      diagnostics: opts.diagnostics,
    });
  }
  return new AppError({
    kind: 'provider',
    message: `Unexpected provider response (${status}).${detail}`,
    retryable: false,
    status,
    diagnostics: opts.diagnostics,
  });
}

/** Keep diagnostic metadata small, printable, and credential-free. */
function normalizeDiagnostics(value) {
  if (!value || typeof value !== 'object') return undefined;
  const diagnostics = {};
  for (const key of ['operation', 'endpoint', 'model', 'requestId', 'contentType']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      diagnostics[key] = truncate(candidate.trim(), 300);
    }
  }
  if (Number.isInteger(value.status)) diagnostics.status = value.status;
  return Object.keys(diagnostics).length ? diagnostics : undefined;
}

/**
 * Extract a short, credential-free summary from a provider error body.
 * @param {string} bodyText
 * @returns {string} '' or ' detail'
 */
function summarizeProviderBody(bodyText) {
  if (!bodyText) return '';
  try {
    const parsed = JSON.parse(bodyText);
    const msg = parsed?.error?.message || parsed?.message;
    if (typeof msg === 'string' && msg.trim()) {
      return ` ${truncate(msg.trim(), 200)}`;
    }
  } catch {
    /* non-JSON body: ignore */
  }
  return '';
}

/**
 * @param {string} text
 * @param {number} max
 */
function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Parse Retry-After header value into whole seconds.
 * @param {string | null} value
 * @returns {number | undefined}
 */
export function parseRetryAfter(value) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  return undefined;
}

import { describe, it, expect } from 'vitest';
import {
  AppError,
  httpStatusToAppError,
  parseRetryAfter,
  toAppError,
} from '../../src/services/errors.js';
import { sanitizeFilename } from '../../src/utils/download.js';

describe('httpStatusToAppError', () => {
  it('maps 401/403 to auth', () => {
    expect(httpStatusToAppError(401).kind).toBe('auth');
    expect(httpStatusToAppError(403).kind).toBe('auth');
  });

  it('maps 404 to unsupported', () => {
    expect(httpStatusToAppError(404).kind).toBe('unsupported');
  });

  it('maps 429 to retryable rate-limit with wait hint', () => {
    const err = httpStatusToAppError(429, '', { retryAfterSeconds: 24 });
    expect(err.kind).toBe('rate-limit');
    expect(err.retryable).toBe(true);
    expect(err.message).toContain('24 seconds');
    expect(err.retryAfterSeconds).toBe(24);
  });

  it('maps 5xx to retryable provider error', () => {
    const err = httpStatusToAppError(503);
    expect(err.kind).toBe('provider');
    expect(err.retryable).toBe(true);
  });

  it('includes provider body detail without credentials', () => {
    const err = httpStatusToAppError(400, JSON.stringify({ error: { message: 'bad model' } }));
    expect(err.message).toContain('bad model');
  });
});

describe('parseRetryAfter', () => {
  it('parses seconds', () => {
    expect(parseRetryAfter('30')).toBe(30);
  });
  it('returns undefined for garbage', () => {
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe('toAppError', () => {
  it('passes AppError through unchanged', () => {
    const original = new AppError({
      kind: 'auth',
      message: 'x',
      retryable: false,
      status: 401,
    });
    expect(toAppError(original)).toBe(original);
  });

  it('maps AbortError to cancelled', () => {
    const err = toAppError(new DOMException('aborted', 'AbortError'));
    expect(err.kind).toBe('cancelled');
  });

  it('wraps generic errors with fallback kind', () => {
    const err = toAppError(new Error('boom'), { kind: 'network' });
    expect(err.kind).toBe('network');
    expect(err.message).toBe('boom');
  });
});

describe('sanitizeFilename', () => {
  it('keeps safe characters and lowercases', () => {
    expect(sanitizeFilename('My Podcast_v2', 'wav')).toBe('my-podcast_v2.wav');
  });

  it('replaces unsafe characters', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j', 'mp3')).toBe('a-b-c-d-e-f-g-h-i-j.mp3');
  });

  it('falls back for empty names', () => {
    expect(sanitizeFilename('   ', 'wav')).toBe('vxpods-audio.wav');
  });

  it('strips leading/trailing dots and dashes', () => {
    expect(sanitizeFilename('..--name--..', 'wav')).toBe('name.wav');
  });

  it('collapses repeated dashes', () => {
    expect(sanitizeFilename('a   b', 'wav')).toBe('a-b.wav');
  });

  it('includes the format extension', () => {
    expect(sanitizeFilename('x', 'MP3')).toBe('x.mp3');
  });
});

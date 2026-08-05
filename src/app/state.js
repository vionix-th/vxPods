/**
 * Central in-memory state tree with explicit updates and subscriptions.
 * Feature status transitions are validated against a finite state map:
 * illegal transitions throw in development and are ignored with a stable
 * error in production.
 */

import { AppError } from '../services/errors.js';

/**
 * @typedef {'idle'|'validating'|'generating'|'ready'|'failed'|'cancelling'|'cancelled'|'exporting'} FeatureStatus
 */

const TRANSITIONS = {
  idle: ['validating', 'generating'],
  validating: ['generating', 'failed', 'idle', 'cancelling', 'cancelled'],
  generating: ['ready', 'failed', 'cancelling', 'cancelled'],
  ready: ['exporting', 'validating', 'generating', 'idle'],
  exporting: ['ready', 'failed'],
  failed: ['validating', 'generating', 'idle'], // retry
  cancelling: ['cancelled', 'failed'],
  cancelled: ['idle', 'validating', 'generating'],
};

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

/**
 * @param {FeatureStatus} from
 * @param {FeatureStatus} to
 * @returns {boolean}
 */
export function isAllowedTransition(from, to) {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * @param {FeatureStatus} from
 * @param {FeatureStatus} to
 * @throws {AppError} when transition is illegal (development only)
 * @returns {boolean} false when ignored (production)
 */
export function assertTransition(from, to) {
  if (isAllowedTransition(from, to)) return true;
  const message = `Illegal status transition: ${from} -> ${to}`;
  if (isDev) {
    throw new AppError({
      kind: 'validation',
      message,
      retryable: false,
      status: undefined,
    });
  }
  // eslint-disable-next-line no-console
  console.error(message);
  return false;
}

/**
 * Create a tiny observable store.
 * @template {object} T
 * @param {T} initial
 */
export function createStore(initial) {
  /** @type {T} */
  let state = initial;
  /** @type {Set<(state: T) => void>} */
  const listeners = new Set();
  return {
    /** @returns {T} */
    get() {
      return state;
    },
    /**
     * @param {Partial<T> | ((state: T) => Partial<T>)} patch
     */
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = /** @type {T} */ ({ ...state, ...next });
      for (const listener of listeners) listener(state);
    },
    /**
     * @param {(state: T) => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

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
  idle: ['validating', 'generating', 'ready'], // ready supports validated imports/recovery
  validating: ['generating', 'failed', 'idle', 'cancelling', 'cancelled'],
  generating: ['ready', 'failed', 'cancelling', 'cancelled'],
  ready: ['exporting', 'validating', 'generating', 'idle'],
  exporting: ['ready'],
  failed: ['validating', 'generating', 'ready', 'idle'], // retry or validated import
  cancelling: ['cancelled', 'failed'],
  cancelled: ['idle', 'validating', 'generating', 'ready'],
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
  console.error(message);
  return false;
}

/**
 * Validate and commit one feature-status transition atomically.
 * Production callers receive `false` and leave state unchanged when transition
 * is illegal; development callers receive the AppError from assertTransition.
 *
 * @template {{ status: FeatureStatus }} T
 * @param {ReturnType<typeof createStore<T>>} store
 * @param {FeatureStatus} to
 * @param {Partial<T>} [patch]
 * @returns {boolean}
 */
export function setFeatureStatus(store, to, patch = {}) {
  const from = store.get().status;
  if (from !== to && !assertTransition(from, to)) return false;
  store.set({ ...patch, status: to });
  return true;
}

/**
 * Commit a transition for a named secondary state machine.
 * Invalid transitions throw in development and leave state unchanged in
 * production, matching feature-status behavior.
 *
 * @template {object} T
 * @param {ReturnType<typeof createStore<T>>} store
 * @param {keyof T & string} key
 * @param {string} to
 * @param {Record<string, string[]>} transitions
 * @param {Partial<T>} [patch]
 * @returns {boolean}
 */
export function setGuardedStatus(store, key, to, transitions, patch = {}) {
  const from = String(store.get()[key]);
  if (from !== to && !transitions[from]?.includes(to)) {
    const message = `Illegal ${key} transition: ${from} -> ${to}`;
    if (isDev) {
      throw new AppError({
        kind: 'validation',
        message,
        retryable: false,
        status: undefined,
      });
    }
    console.error(message);
    return false;
  }
  store.set({ ...patch, [key]: to });
  return true;
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

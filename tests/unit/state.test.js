import { describe, it, expect } from 'vitest';
import { isAllowedTransition, assertTransition, createStore } from '../../src/app/state.js';

describe('status transitions', () => {
  it('allows the happy path', () => {
    expect(isAllowedTransition('idle', 'validating')).toBe(true);
    expect(isAllowedTransition('validating', 'generating')).toBe(true);
    expect(isAllowedTransition('generating', 'ready')).toBe(true);
    expect(isAllowedTransition('ready', 'exporting')).toBe(true);
    expect(isAllowedTransition('exporting', 'ready')).toBe(true);
  });

  it('allows failure and retry', () => {
    expect(isAllowedTransition('generating', 'failed')).toBe(true);
    expect(isAllowedTransition('failed', 'generating')).toBe(true);
  });

  it('allows cancellation from active states', () => {
    expect(isAllowedTransition('generating', 'cancelling')).toBe(true);
    expect(isAllowedTransition('cancelling', 'cancelled')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(isAllowedTransition('idle', 'ready')).toBe(false);
    expect(isAllowedTransition('idle', 'exporting')).toBe(false);
    expect(isAllowedTransition('cancelled', 'exporting')).toBe(false);
  });

  it('assertTransition throws on illegal transitions in dev', () => {
    // vitest sets import.meta.env.DEV true
    expect(() => assertTransition('idle', 'ready')).toThrowError(/Illegal status transition/);
    expect(assertTransition('idle', 'validating')).toBe(true);
  });
});

describe('createStore', () => {
  it('notifies subscribers with merged state', () => {
    const store = createStore({ a: 1, b: 2 });
    const seen = [];
    store.subscribe((s) => seen.push({ ...s }));
    store.set({ a: 10 });
    expect(store.get()).toEqual({ a: 10, b: 2 });
    expect(seen).toEqual([{ a: 10, b: 2 }]);
  });

  it('supports functional updates and unsubscribe', () => {
    const store = createStore({ n: 0 });
    let calls = 0;
    const unsub = store.subscribe(() => {
      calls += 1;
    });
    store.set((s) => ({ n: s.n + 1 }));
    unsub();
    store.set({ n: 99 });
    expect(store.get().n).toBe(99);
    expect(calls).toBe(1);
  });
});

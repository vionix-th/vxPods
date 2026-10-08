import { describe, expect, it } from 'vitest';
import {
  createSupportReminderStore,
  FIRST_REMINDER_DELAY,
  REMINDER_COOLDOWN,
} from '../../src/app/support-reminder-policy.js';
function fixture(threshold = 5) {
  let time = new Date(2026, 0, 1, 12).getTime();
  const initial = time;
  const values = new Map();
  let tail = Promise.resolve();
  const locks = {
    request: (_name, callback) => {
      const result = tail.then(callback);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const deps = {
    key: 'test-reminders',
    threshold,
    storage: () => storage,
    locks: () => locks,
    now: () => time,
  };
  const store = createSupportReminderStore(deps);
  return {
    store,
    values,
    deps,
    initial,
    setTime: (next) => {
      time = next;
    },
    async eligible() {
      for (let i = 0; i < threshold; i++) await store.recordUsage();
      time = initial + 24 * 60 * 60 * 1000;
      await store.recordUsage();
      time = initial + 48 * 60 * 60 * 1000;
      await store.recordUsage();
      time = initial + FIRST_REMINDER_DELAY;
    },
  };
}
describe('usage-based support reminders', () => {
  it('requires all three first-reminder gates', async () => {
    const f = fixture();
    await f.store.recordUsage();
    f.setTime(f.initial + FIRST_REMINDER_DELAY);
    expect(await f.store.claim(() => true)).toBe(false);
    await f.eligible();
    f.setTime(f.initial + FIRST_REMINDER_DELAY - 1);
    expect(await f.store.claim(() => true)).toBe(false);
    f.setTime(f.initial + FIRST_REMINDER_DELAY);
    expect(await f.store.claim(() => false)).toBe(false);
    expect(await f.store.claim(() => true)).toBe(true);
    expect(await f.store.claim(() => true)).toBe(false);
  });
  it('counts activity during cooldown and honors the exact 28-day boundary', async () => {
    const f = fixture();
    await f.eligible();
    expect(await f.store.claim(() => true)).toBe(true);
    for (let i = 0; i < 5; i++) await f.store.recordUsage();
    const due = f.initial + FIRST_REMINDER_DELAY + REMINDER_COOLDOWN;
    f.setTime(due - 1);
    expect(await f.store.claim(() => true)).toBe(false);
    f.setTime(due);
    expect(await f.store.claim(() => true)).toBe(true);
  });
  it('resets usage for manual support and retains permanent opt-out', async () => {
    const f = fixture();
    await f.eligible();
    await f.store.postpone();
    f.setTime(f.initial + FIRST_REMINDER_DELAY + REMINDER_COOLDOWN);
    expect(await f.store.claim(() => true)).toBe(false);
    await f.store.disable();
    await f.store.postpone();
    for (let i = 0; i < 30; i++) await f.store.recordUsage();
    f.setTime(f.initial + 100 * REMINDER_COOLDOWN);
    expect(await f.store.claim(() => true)).toBe(false);
    expect(JSON.parse(f.values.get('test-reminders')).disabled).toBe(true);
  });
  it('serializes simultaneous tab claims and persists cooldown across reload', async () => {
    const f = fixture();
    await f.eligible();
    const other = createSupportReminderStore(f.deps);
    expect(
      await Promise.all([f.store.claim(() => true), other.claim(() => true)]),
    ).toEqual([true, false]);
    expect(await createSupportReminderStore(f.deps).claim(() => true)).toBe(
      false,
    );
  });
  it('does not invent usage after clock rollback', async () => {
    const f = fixture();
    await f.eligible();
    f.setTime(f.initial - 1);
    expect(await f.store.claim(() => true)).toBe(false);
  });
  it.each([
    '{',
    JSON.stringify({ version: 99 }),
    JSON.stringify({ version: 1, activeDays: ['bad'] }),
  ])('fails closed without replacing corrupt metadata: %s', async (raw) => {
    const f = fixture();
    f.values.set('test-reminders', raw);
    expect(await f.store.recordUsage()).toBe(false);
    expect(await f.store.claim(() => true)).toBe(false);
    expect(f.values.get('test-reminders')).toBe(raw);
  });
  it('fails closed on unavailable storage or coordination', async () => {
    const f = fixture();
    const noLocks = createSupportReminderStore({
      ...f.deps,
      locks: () => undefined,
    });
    expect(await noLocks.recordUsage()).toBe(false);
    const noStorage = createSupportReminderStore({
      ...f.deps,
      storage: () => {
        throw new Error('blocked');
      },
    });
    expect(await noStorage.recordUsage()).toBe(false);
    expect(f.values.size).toBe(0);
  });
});

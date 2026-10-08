export const FIRST_REMINDER_DELAY = 72 * 60 * 60 * 1000;
export const REMINDER_COOLDOWN = 28 * 24 * 60 * 60 * 1000;
export const SUPPORT_REMINDER_KEY = 'vxPods.support-reminders';
export function localUsageDate(now) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function reminderEligible(state, now, threshold) {
  return (
    !state.disabled &&
    state.firstUsedAt !== null &&
    now - state.firstUsedAt >= FIRST_REMINDER_DELAY &&
    state.activeDays.length === 3 &&
    state.count >= threshold &&
    now >= state.cooldownUntil
  );
}
export function createSupportReminderStore({
  key,
  threshold,
  now = Date.now,
  storage = () => localStorage,
  locks = () => navigator.locks,
  changed = () => {},
}) {
  let unavailable = false;
  function read() {
    const raw = storage().getItem(key);
    if (raw === null)
      return {
        version: 1,
        firstUsedAt: null,
        activeDays: [],
        count: 0,
        cooldownUntil: 0,
        disabled: false,
      };
    const state = JSON.parse(raw);
    const timestamp = (value) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0;
    if (
      !state ||
      state.version !== 1 ||
      !(state.firstUsedAt === null || timestamp(state.firstUsedAt)) ||
      !timestamp(state.cooldownUntil) ||
      typeof state.disabled !== 'boolean' ||
      !Number.isInteger(state.count) ||
      state.count < 0 ||
      state.count > threshold ||
      !Array.isArray(state.activeDays) ||
      state.activeDays.length > 3 ||
      new Set(state.activeDays).size !== state.activeDays.length ||
      state.activeDays.some(
        (day) =>
          typeof day !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
          !Number.isFinite(Date.parse(day)) ||
          new Date(day).toISOString().slice(0, 10) !== day,
      )
    ) {
      throw new Error('Invalid support reminder preferences');
    }
    return state;
  }
  async function update(change) {
    if (unavailable) return false;
    try {
      const coordinator = locks();
      if (!coordinator) {
        unavailable = true;
        return false;
      }
      return await coordinator.request(key, () => {
        const state = read();
        const time = now();
        if (!Number.isFinite(time) || time < 0)
          throw new Error('Invalid reminder clock');
        if (!change(state, time)) return false;
        storage().setItem(key, JSON.stringify(state));
        changed();
        return true;
      });
    } catch {
      // Optional reminders fail closed; primary/payment operations stay independent.
      unavailable = true;
      return false;
    }
  }
  function resetCycle(state, time) {
    state.count = 0;
    state.cooldownUntil = time + REMINDER_COOLDOWN;
  }
  return {
    recordUsage: () =>
      update((state, time) => {
        if (state.disabled) return false;
        state.firstUsedAt ??= time;
        const day = localUsageDate(time);
        if (state.activeDays.length < 3 && !state.activeDays.includes(day))
          state.activeDays.push(day);
        state.count = Math.min(threshold, state.count + 1);
        return true;
      }),
    claim: (canPresent) =>
      update((state, time) => {
        if (!canPresent() || !reminderEligible(state, time, threshold))
          return false;
        resetCycle(state, time);
        return true;
      }),
    postpone: () =>
      update((state, time) => {
        resetCycle(state, time);
        return true;
      }),
    disable: () =>
      update((state) => {
        state.disabled = true;
        return true;
      }),
  };
}
export const supportReminders = createSupportReminderStore({
  key: SUPPORT_REMINDER_KEY,
  threshold: 5,
  changed: () => window.dispatchEvent(new Event('support-reminder-change')),
});

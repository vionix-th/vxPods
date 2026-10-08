/** Page-session presentation; persisted cycle claims belong to the local policy store. */
export function createSupportReminderController({
  store,
  safe,
  show,
  getSupport,
  openSupport,
}) {
  let claimed = false;
  let checking = false;
  let disposed = false;
  let notice = null;
  function clear() {
    claimed = false;
    notice?.destroy();
    notice = null;
  }
  function finish(disable) {
    clear();
    void (disable ? store.disable() : store.postpone());
    getSupport()?.focus();
  }
  async function evaluate() {
    if (disposed || checking) return;
    try {
      if (!safe()) {
        if (notice && !notice.element.contains(document.activeElement))
          notice.element.hidden = true;
        return;
      }
      if (!claimed) {
        checking = true;
        claimed = await store.claim(safe);
        checking = false;
      }
      if (disposed || !claimed) return;
      if (!notice)
        notice = show({
          support: () => {
            clear();
            openSupport(getSupport());
          },
          postpone: () => finish(false),
          disable: () => finish(true),
        });
      notice.element.hidden =
        !safe() && !notice.element.contains(document.activeElement);
    } catch {
      checking = false;
      clear(); // Optional presentation must not break the primary workflow.
    }
  }
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !record.target.closest?.('.support-reminder')))
      queueMicrotask(evaluate);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });
  const events = [
    'focus',
    'blur',
    'focusin',
    'focusout',
    'visibilitychange',
    'storage',
    'support-reminder-change',
    'notifications-change',
    'playing',
    'pause',
    'ended',
  ];
  for (const name of events) window.addEventListener(name, evaluate, true);
  window.addEventListener('support-dialog-open', clear);
  const timer = setInterval(evaluate, 60_000);
  void evaluate();
  return {
    evaluate,
    destroy() {
      disposed = true;
      observer.disconnect();
      clearInterval(timer);
      for (const name of events)
        window.removeEventListener(name, evaluate, true);
      window.removeEventListener('support-dialog-open', clear);
      clear();
    },
  };
}

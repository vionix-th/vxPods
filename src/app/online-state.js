/** One application-owned source for browser connectivity state. */

export function createOnlineState(browserWindow = window, browserNavigator = navigator) {
  let online = browserNavigator.onLine;
  const listeners = new Set();

  const update = () => {
    const next = browserNavigator.onLine;
    if (next === online) return;
    online = next;
    for (const listener of listeners) listener(online);
  };
  browserWindow.addEventListener('online', update);
  browserWindow.addEventListener('offline', update);

  return {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      browserWindow.removeEventListener('online', update);
      browserWindow.removeEventListener('offline', update);
      listeners.clear();
    },
  };
}

/** Ownership for a mounted view. Background tasks may outlive it; their UI callbacks may not. */
export function beginViewSession(root) {
  root.viewSession?.dispose();
  const controller = new AbortController(), cleanup = new Set();
  const session = {
    root, signal: controller.signal,
    alive: () => !controller.signal.aborted && root.viewSession === session && root.isConnected,
    onDispose(fn) { if (controller.signal.aborted) fn(); else cleanup.add(fn); return () => cleanup.delete(fn); },
    dispose() {
      if (controller.signal.aborted) return;
      controller.abort();
      for (const fn of cleanup) fn();
      cleanup.clear();
    },
  };
  root.viewSession = session;
  return session;
}

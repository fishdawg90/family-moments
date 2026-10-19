// Coalesce foreground/reconnect/save requests without losing a save made while
// an earlier pass is still reading cloud data. Every caller awaits the drain.
export function createSyncRunner(work: () => Promise<void>, enabled: () => boolean) {
  let requested = false;
  let running: Promise<void> | null = null;
  return (): Promise<void> => {
    if (!enabled()) return Promise.resolve();
    requested = true;
    if (running) return running;
    running = Promise.resolve()
      .then(async () => {
        do {
          requested = false;
          if (!enabled()) return;
          await work();
        } while (requested && enabled());
      })
      .finally(() => {
        running = null;
      });
    return running;
  };
}

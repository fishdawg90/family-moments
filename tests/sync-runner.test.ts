import { describe, expect, it, vi } from 'vitest';
import { createSyncRunner } from '../src/sync-runner';

describe('foreground sync scheduling', () => {
  it('drains a save requested during an existing pass without waiting for the periodic timer', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue: string[] = [],
      sent: string[] = [];
    let passes = 0;
    const run = createSyncRunner(
      async () => {
        const batch = queue.splice(0);
        if (++passes === 1) await held;
        sent.push(...batch);
      },
      () => true,
    );
    const first = run();
    await Promise.resolve();
    queue.push('new local memory');
    const second = run();
    expect(second).toBe(first);
    release();
    await second;
    expect(sent).toEqual(['new local memory']);
    expect(passes).toBe(2);
  });

  it('coalesces repeated requests and stops the next pass after account change', async () => {
    let active = true,
      release!: () => void;
    const work = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const run = createSyncRunner(work, () => active);
    const first = run();
    await Promise.resolve();
    void run();
    void run();
    active = false;
    release();
    await first;
    expect(work).toHaveBeenCalledOnce();
    await run();
    expect(work).toHaveBeenCalledOnce();
  });

  it('permits a fresh retry after a failed pass', async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce(new Error('Disconnected'))
      .mockResolvedValueOnce(undefined);
    const run = createSyncRunner(work, () => true);
    await expect(run()).rejects.toThrow('Disconnected');
    await run();
    expect(work).toHaveBeenCalledTimes(2);
  });
});

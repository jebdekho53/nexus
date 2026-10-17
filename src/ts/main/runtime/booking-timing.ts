// Login scheduling: General (GN) bookings log in immediately; 8AM is a separate scheduled opening mode.
// Checked before the recovered loginTargetCache so changing a panel to GN cannot reuse a previously calculated
// scheduled login target.
import { AsyncLocalStorage } from 'node:async_hooks';

const loginIntent = new AsyncLocalStorage<boolean>();

export function withImmediateLogin<T>(action: () => T): T { return loginIntent.run(true, action); }

export function bookingTiming(): { f2281(original: (...args: unknown[]) => unknown, args: [{ quota?: unknown }?, ...unknown[]]): unknown } {
  return {
    f2281(original, args) { return loginIntent.getStore() === true || args[0]?.quota === 'GN' ? null : original(...args); },
  };
}

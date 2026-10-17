// Developer-only candidate: a General (GN) booking requested as a candidate reuses the existing API enquiry branch.
import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<boolean>();

export function withCandidate<T>(action: () => T, request: { matrixGeneralApiCandidate?: unknown; form?: { quota?: unknown } } | null | undefined, enabled: boolean = false): T {
  const active = enabled === true && request?.matrixGeneralApiCandidate === true && request?.form?.quota === 'GN';
  return scope.run(active, action);
}

export function interceptors(): { f3406: (original: (...args: unknown[]) => unknown, args: unknown[]) => unknown } {
  return { f3406: (original, args) => scope.getStore() === true ? true : original(...args) };
}

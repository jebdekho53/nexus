// Lazy local vault creation (f3499/f3500, f3575/f3578/f3582/f3583).
// The injected constructors and key loader retain their existing encryption.
export interface VaultAccessDeps {
  cached(): unknown;
  cache(value: unknown): void;
  userData(): string;
  constructor(): new (directory: string, key: unknown) => object;
  key(directory: string): unknown;
}
export function recordVault(deps: VaultAccessDeps): unknown {
  if (!deps.cached()) {
    const directory = deps.userData();
    const Constructor = deps.constructor();
    deps.cache(new Constructor(directory, deps.key(directory)));
  }
  return deps.cached();
}
interface FormsVault {migrateLabels(): unknown}
export interface FormsVaultAccessDeps extends Omit<VaultAccessDeps, 'constructor'> {
  constructor(): new (directory: string, key: unknown, identity: () => unknown) => FormsVault;
  identity(): unknown;
  log(category: string, message: string): unknown;
}
export function formsVault(deps: FormsVaultAccessDeps): unknown {
  if (!deps.cached()) {
    const directory = deps.userData();
    const Constructor = deps.constructor();
    deps.cache(new Constructor(directory, deps.key(directory), () => deps.identity()));
    const migrated = (deps.cached() as FormsVault).migrateLabels();
    if (migrated) deps.log('forms', 'migrated ' + migrated + ' saved form label(s) (username append + drop copy/pair)');
  }
  return deps.cached();
}

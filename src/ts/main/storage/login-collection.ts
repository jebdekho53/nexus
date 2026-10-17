// Collect saved logins followed by form accounts (f3576/f3577).
// Operates locally; it does not sign in or transmit records.
export interface LoginRecord {username: string; password: string; mobileNumber: string}
interface Account {username?: unknown; password?: unknown; mobileNumber?: unknown}
export interface LoginCollectionState {
  seen(): Set<string>;
  records(): LoginRecord[];
}
export function addLogin(username: unknown, password: unknown, mobile: unknown, state: LoginCollectionState): void {
  const name = String(username ?? '').trim();
  if (!name) return;
  const secret = String(password ?? '');
  const key = name.toLowerCase() + ' ' + secret;
  if (state.seen().has(key)) return;
  state.seen().add(key);
  state.records().push({username: name, password: secret, mobileNumber: String(mobile ?? '').trim()});
}
export function collectLogins(deps: {
  logins(): {list(): Iterable<Account>};
  forms(): {all(): Iterable<{account?: Account | null}>};
}): LoginRecord[] {
  const seen = new Set<string>(), records: LoginRecord[] = [];
  const state = {seen: () => seen, records: () => records};
  try {
    for (const login of deps.logins().list()) addLogin(login.username, login.password, login.mobileNumber, state);
  } catch { /* Keep accumulated rows and continue with the independent form source. */ }
  try {
    for (const form of deps.forms().all())
      addLogin(form.account?.username, form.account?.password, form.account?.mobileNumber, state);
  } catch { /* Keep the valid prefix if a source fails part way through. */ }
  return records;
}

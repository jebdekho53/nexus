// Local AI key persistence, recovered f3570/f3571. No provider requests.
export interface AiKeySettings {
  aiKey?: unknown;
  aiKeyEnc?: unknown;
  [field: string]: unknown;
}
export interface AiKeyStoreDeps {
  readSettings(): AiKeySettings;
  writeSettings(settings: AiKeySettings): unknown;
  environmentKey(): unknown;
  safeStorage(): {
    isEncryptionAvailable(): boolean;
    encryptString(value: string): {toString(encoding: 'base64'): string};
    decryptString(value: Uint8Array): string;
  };
  decodeBase64(value: unknown): Uint8Array;
  saveKey(value: unknown): unknown;
}
export function saveAiKey(value: unknown, deps: Pick<AiKeyStoreDeps, 'readSettings' | 'writeSettings' | 'safeStorage'>): void {
  const settings = deps.readSettings();
  // Preserve JS's trim contract, including a TypeError for truthy non-strings.
  const key = ((value || '') as string).trim();
  delete settings.aiKey;
  if (!key) delete settings.aiKeyEnc;
  else if (!deps.safeStorage().isEncryptionAvailable()) {
    settings.aiKey = key;
    delete settings.aiKeyEnc;
  } else settings.aiKeyEnc = deps.safeStorage().encryptString(key).toString('base64');
  deps.writeSettings(settings);
}
export function readAiKey(deps: AiKeyStoreDeps): unknown {
  const environmentKey = deps.environmentKey();
  if (environmentKey) return environmentKey;
  const settings = deps.readSettings();
  if (settings.aiKeyEnc && deps.safeStorage().isEncryptionAvailable()) {
    try { return deps.safeStorage().decryptString(deps.decodeBase64(settings.aiKeyEnc)); }
    catch { return ''; }
  }
  if (settings.aiKey) {
    deps.saveKey(settings.aiKey);
    return settings.aiKey;
  }
  return '';
}
export async function setAiKey(value: unknown, save: (value: unknown) => unknown): Promise<{ok: boolean; error?: unknown}> {
  try { save(value || ''); return {ok: true}; }
  catch (error) { return {ok: false, error: (error as {message?: unknown}).message}; }
}

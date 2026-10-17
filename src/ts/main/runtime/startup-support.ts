// Startup helpers for the Electron entry point (src/main/index.cjs): the diagnostics log with secret redaction, error
// detail formatting, the guard that refuses native bytecode, and the ESM import bridge for the recovered code.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export type Logger = (event: string, details?: Record<string, unknown>) => void;

/** The activity log as the startup log uses it (installed after the logger exists, hence read lazily). */
export interface ActivitySink {
  redact(text: string): string;
  record(event: string, details: Record<string, unknown>): void;
}

/** Passwords from diagnostics/test-account.json (a local test fixture); empty when the file is absent or unreadable. */
export function loadTestSecrets(diagnostics: string): string[] {
  try {
    const account = JSON.parse(fs.readFileSync(path.join(diagnostics, 'test-account.json'), 'utf8')) as { password?: string };
    return [account.password].filter(Boolean) as string[];
  } catch { return []; }
}

export function createStartupLog(options: { diagnostics: string; secrets: () => readonly string[]; activity: () => ActivitySink | null }): Logger {
  const { diagnostics } = options;
  return (event, details = {}) => {
    let text = JSON.stringify({ time: new Date().toISOString(), pid: process.pid, event, ...details });
    for (const secret of options.secrets()) text = text.replaceAll(secret, '[redacted]');
    const activity = options.activity();
    if (activity) text = activity.redact(text);
    fs.appendFileSync(path.join(diagnostics, 'startup.jsonl'), text + '\n');
    activity?.record(event, details);
  };
}

export function errorDetails(error: unknown): { message: string; stack: unknown; frames: unknown } {
  const fields = error as { message?: unknown; stack?: unknown; recoveredFrames?: unknown } | null | undefined;
  return { message: String(fields?.message || error), stack: fields?.stack, frames: fields?.recoveredFrames };
}

interface LoadableModule {
  _load: (request: unknown, parent: unknown, isMain: unknown) => unknown;
}

/** Makes `require` of a `.jsc` file fail: this project executes JavaScript only. */
export function installNativeBytecodeGuard(Module: LoadableModule, log: Logger): void {
  const nativeLoad = Module._load;
  Module._load = function (this: unknown, request: unknown, parent: unknown, isMain: unknown) {
    if (typeof request === 'string' && /\.jsc$/i.test(request)) {
      log('native-bytecode-load-rejected', { file: path.basename(request) });
      throw new Error('This source project executes JavaScript definitions and does not load .jsc code');
    }
    return Reflect.apply(nativeLoad, this, [request, parent, isMain]);
  };
}

/**
 * The dynamic-import bridge exposed to recovered code as `globalThis.__esmImport`. `importModule` performs the real
 * ECMAScript `import()` and is supplied by index.cjs (TypeScript's CommonJS output would turn an `import()` written
 * here into `require()`).
 */
export function createEsmImport(vendorRequire: { resolve(specifier: string): string }, importModule: (specifier: string) => unknown): (specifier: string) => unknown {
  return specifier => {
    if (/^(node:|data:|file:|https?:)/.test(specifier)) return importModule(specifier);
    return importModule(pathToFileURL(vendorRequire.resolve(specifier)).href);
  };
}

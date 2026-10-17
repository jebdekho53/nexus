// Standalone runtime for the compiled bundle (src/main/compiled). It exposes the same API as the instruction engine but
// never loads the recovered instruction definitions: function metadata and constant pools come from compiled/meta.cjs
// and every body is ordinary generated JavaScript.
import { createSupport, HOLE, META, CONTEXT, numeric, receiver, own, type Context } from './runtime-support';

/** Metadata of a recovered function (src/main/compiled/meta.cjs). */
export interface FunctionMeta {
  kind: string;
  language?: string;
  name?: string;
  length?: number;
  constants?: unknown;
}

/** Runtime helpers handed to every compiled body (see tools/compiler). */
export interface RuntimeHelpers {
  HOLE: typeof HOLE;
  globals: Record<string, unknown>;
  constant: (value: unknown) => unknown;
  literal: (value: unknown) => unknown;
  context: (length: number, parent: unknown) => Context;
  own: typeof own;
  receiver: typeof receiver;
  numeric: typeof numeric;
  makeFunction: (id: string, captured?: Context, lexical?: Lexical) => RecoveredFunction;
  outer(ctx: Context, depth: number): Context;
  call(fn: Function, thisValue: unknown, args: unknown[]): unknown; // eslint-disable-line @typescript-eslint/no-unsafe-function-type -- recovered callees have no fixed signature
  global(name: string): unknown;
  runtime(name: string, args: unknown[], frame: { state?: unknown }): unknown;
  tick(): void;
}

export type CompiledBody = (rt: RuntimeHelpers, fn: RecoveredFunction, self: unknown, args: unknown[], newTarget: unknown, captured: Context, constants: unknown) => unknown;

export interface Lexical {
  thisValue?: unknown;
  newTarget?: unknown;
}

export type RecoveredFunction = ((...args: unknown[]) => unknown) & { [META]?: { id: string; captured: Context; kind: string } };

type Invocable = (this: unknown, ...args: unknown[]) => unknown;

export interface BindingReader {
  readBinding(slot: number, name?: string, depth?: number): unknown;
  /** Stores into a lexical slot (no hole check: the recovered code checks on its own reads). */
  writeBinding(slot: number, value: unknown, depth?: number): void;
}

export interface CompiledRuntimeOptions {
  globals?: Record<string, unknown>;
  compiledBodies?: Record<string, CompiledBody>;
  meta?: Record<string, FunctionMeta>;
  tick?: () => void;
  functionFactories?: Record<string, ((reader: BindingReader) => unknown) | undefined>;
  onInvoke?: (id: string, args: unknown[], captured: Context) => void;
  functionOverrides?: Record<string, Invocable>;
  functionInterceptors?: Record<string, (original: (...args: unknown[]) => unknown, args: unknown[]) => unknown>;
  /** Real ECMAScript `import()` used when the globals supply no `__esmImport` (supplied by compiled-runtime.cjs). */
  fallbackImport?: (specifier: unknown) => unknown;
}

export interface CompiledRuntime {
  makeFunction: RuntimeHelpers['makeFunction'];
  context: RuntimeHelpers['context'];
  HOLE: typeof HOLE;
  META: typeof META;
  constant: RuntimeHelpers['constant'];
  literal: RuntimeHelpers['literal'];
}

export function createCompiledRuntime(options: CompiledRuntimeOptions = {}): CompiledRuntime {
  const globals = (options.globals || globalThis) as Record<string, unknown>;
  const bodies = options.compiledBodies || require('../../../../src/main/compiled/index.cjs') as Record<string, CompiledBody>;
  const meta = options.meta || require('../../../../src/main/compiled/meta.cjs') as Record<string, FunctionMeta>;
  const { context, constant, literal, runtime } = createSupport(globals, options.fallbackImport);
  const rt: RuntimeHelpers = {
    HOLE, globals, constant, literal, context, own, receiver, numeric,
    makeFunction: (id, captured, lexical) => makeFunction(id, captured, lexical),
    outer(ctx, depth) {
      let current: Context | undefined = ctx;
      while (depth-- > 0) current = (current as Context)[CONTEXT] as Context || (current as Context)[1] as Context;
      if (!current) throw new Error('Missing lexical context');
      return current;
    },
    call: (fn, thisValue, args) => Reflect.apply(fn, thisValue, args),
    global(name) { if (!(name in globals)) throw new ReferenceError(name + ' is not defined'); return globals[name]; },
    runtime: (name, args, frame) => runtime(name, args, frame),
    tick: () => { if (options.tick) options.tick(); },
  };

  function makeFunction(id: string, captured: Context = context(2, null), lexical: Lexical = {}): RecoveredFunction {
    const definition = meta[id];
    const body = bodies[id];
    if (!definition || !body) throw new Error('Missing compiled function ' + id);
    const nativeImplementation = options.functionFactories?.[id]?.({
      readBinding(slot, name, depth = 0) {
        let scope = captured;
        for (let index = 0; index < depth; index++) scope = scope[CONTEXT] as Context;
        const value = scope[slot];
        if (value === HOLE) throw new ReferenceError('Cannot access ' + name + ' before initialization');
        return value;
      },
      writeBinding(slot, value, depth = 0) {
        // A plain store into a lexical slot, as the recovered code does after it has checked the binding itself.
        let scope = captured;
        for (let index = 0; index < depth; index++) scope = scope[CONTEXT] as Context;
        scope[slot] = value;
      },
    });
    if (nativeImplementation !== undefined && typeof nativeImplementation !== 'function') throw new TypeError('Invalid native implementation for ' + id);
    const derived = definition.kind.includes('Derived');
    let fn: RecoveredFunction;
    const invokeOriginal = (that: unknown, args: unknown[], newTarget: unknown): unknown => {
      if (nativeImplementation) return Reflect.apply(nativeImplementation as Invocable, that, args);
      let self = that;
      if (derived) self = HOLE;
      else if (definition.language === 'sloppy') self = that == null ? globals : Object(that);
      return body(rt, fn, self, args, newTarget, captured, definition.constants);
    };
    const invoke = (that: unknown, args: unknown[], newTarget: unknown): unknown => {
      if (options.onInvoke) options.onInvoke(id, args, captured);
      if (options.functionOverrides && Object.hasOwn(options.functionOverrides, id)) return Reflect.apply(options.functionOverrides[id] as Invocable, that, args);
      if (options.functionInterceptors && Object.hasOwn(options.functionInterceptors, id)) {
        return (options.functionInterceptors[id] as NonNullable<CompiledRuntimeOptions['functionInterceptors']>[string])((...nextArgs: unknown[]) => invokeOriginal(that, nextArgs, newTarget), args);
      }
      return invokeOriginal(that, args, newTarget);
    };
    if (definition.kind.includes('Async') && definition.kind.includes('Arrow')) fn = async (...args: unknown[]) => invoke(lexical.thisValue, args, lexical.newTarget);
    else if (definition.kind.includes('Async')) fn = async function (this: unknown, ...args: unknown[]) { return invoke(this, args, undefined); };
    else if (definition.kind.includes('Arrow')) fn = (...args: unknown[]) => invoke(lexical.thisValue, args, lexical.newTarget);
    else if (/Method|Getter|Setter/.test(definition.kind)) fn = { method(this: unknown, ...args: unknown[]) { return invoke(this, args, undefined); } }.method;
    else fn = function (this: unknown, ...args: unknown[]) { return invoke(this, args, new.target); };
    Object.defineProperty(fn, 'name', { value: definition.name || id, configurable: true });
    Object.defineProperty(fn, 'length', { value: definition.length || 0, configurable: true });
    Object.defineProperty(fn, META, { value: { id, captured, kind: definition.kind } });
    return fn;
  }

  return { makeFunction, context, HOLE, META, constant, literal };
}

export { HOLE, META };

// Value helpers shared by the recovered-instruction engine and the compiled runtime: lexical contexts, constant pool
// decoding, literals, class definition and the small set of runtime intrinsics.
//
// The recovered "constant" and "recipe" shapes are produced by the recovery tooling (src/main/generated). They are
// described structurally below; unknown shapes fall through to the same behaviour as the original JavaScript.

export const HOLE: unique symbol = Symbol('uninitialized lexical binding');
export const SUSPEND: unique symbol = Symbol('async suspension');
export const META: unique symbol = Symbol('recovered function');
export const CONTEXT: unique symbol = Symbol('context parent');

export const numeric = (value: unknown): number | bigint => typeof value === 'bigint' ? value : Number(value);
export const receiver = (value: unknown): boolean => value !== null && (typeof value === 'object' || typeof value === 'function');
export const own = (target: object, key: PropertyKey, value: unknown): object => Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });

/** A lexical context: an array of slots whose slot 1 and `[CONTEXT]` hold the parent context. */
export type Context = unknown[] & { [CONTEXT]?: unknown };

interface ConstantShape {
  type?: string;
  value?: unknown;
  digits?: number[];
  negative?: boolean;
  id?: unknown;
  description?: unknown;
  private?: unknown;
  values?: unknown;
  entries?: Array<[unknown, unknown, number?]>;
  [field: string]: unknown;
}

interface AsyncState {
  pending: unknown;
  input: unknown;
  mode: number;
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

type ClassGroup = { entries?: Array<[unknown, unknown, number, number]> } | null | undefined;

interface ClassRecipe {
  staticProperties?: ClassGroup;
  staticElements?: ClassGroup;
  staticComputed?: number[];
  instanceProperties?: ClassGroup;
  instanceElements?: ClassGroup;
  instanceComputed?: number[];
}

export interface Support {
  context(length: number, parent: unknown): Context;
  constant(value: unknown): unknown;
  literal(value: unknown): unknown;
  runtime(name: string, args: unknown[], frame: { state?: unknown }): unknown;
  defineClass(args: unknown[]): object;
}

/**
 * `fallbackImport` performs the ECMAScript `import()` used when the globals supply no `__esmImport`. It is passed in by
 * runtime-support.cjs so that the call is a real dynamic import resolved from that file (TypeScript's CommonJS output
 * would turn an `import()` written here into `require()`).
 */
export function createSupport(
  globals: { __esmImport?: (specifier: unknown, options: unknown) => unknown },
  fallbackImport: (specifier: unknown) => unknown = () => { throw new Error('Dynamic import is not available'); },
): Support {
  const symbols = new Map<unknown, symbol>();
  const context = (length: number, parent: unknown): Context => {
    const slots = new Array(Math.max(length, 2)).fill(undefined) as Context;
    slots[CONTEXT] = parent;
    slots[1] = parent;
    return slots;
  };
  function constant(input: unknown): unknown {
    if (!input || typeof input !== 'object') return input;
    const value = input as ConstantShape;
    switch (value.type) {
      case 'undefined': case 'uninitialized': return undefined;
      case 'hole': return HOLE;
      case 'number': return Number(value.value);
      case 'bigint': {
        let n = 0n;
        const digits = value.digits as number[];
        for (let i = digits.length - 1; i >= 0; i--) n = (n << 32n) + BigInt(digits[i] as number);
        return value.negative ? -n : n;
      }
      case 'symbol': {
        if (!symbols.has(value.id)) {
          const description = constant(value.description);
          const known = typeof description === 'string' && description.startsWith('Symbol.') ? (Symbol as unknown as Record<string, symbol>)[description.slice(7)] : undefined;
          symbols.set(value.id, known || Symbol(description as string | undefined));
        }
        return symbols.get(value.id);
      }
      case 'unsupported': case 'depth-limit': throw new Error('Unrecovered constant: ' + JSON.stringify(value));
      default: return value;
    }
  }
  function literal(input: unknown): unknown {
    if (!input || typeof input !== 'object') return input;
    if (Array.isArray(input)) {
      const result = new Array(input.length);
      input.forEach((item, index) => { const resolved = literal(item); if (resolved !== HOLE) result[index] = resolved; });
      return result;
    }
    const value = input as ConstantShape;
    if (value.type === 'array') return literal(value.values);
    if (value.type === 'object') {
      const result = {};
      for (const [key, item] of value.entries as Array<[unknown, unknown]>) own(result, constant(key) as PropertyKey, literal(item));
      return result;
    }
    if (value.type === 'tuple') return literal(value.values);
    return constant(value);
  }
  function defineClass(args: unknown[]): object {
    const [recipe, ctor, parent] = args as [ClassRecipe, Function, unknown]; // eslint-disable-line @typescript-eslint/no-unsafe-function-type -- recovered constructors have no fixed signature
    const hasParent = parent !== HOLE;
    if (hasParent && parent !== null && typeof parent !== 'function') throw new TypeError('Class extends value is not a constructor or null');
    const parentFunction = parent as (Function & { prototype: object }) | null; // eslint-disable-line @typescript-eslint/no-unsafe-function-type
    const prototype = Object.create(hasParent ? (parent === null ? null : (parentFunction as { prototype: object }).prototype) : Object.prototype) as object;
    Object.defineProperty(prototype, 'constructor', { value: ctor, writable: true, configurable: true });
    Object.defineProperty(ctor, 'prototype', { value: prototype, writable: false });
    if (hasParent && parent !== null) Object.setPrototypeOf(ctor, parentFunction);
    const resolvedArgs = [...args]; resolvedArgs[2] = prototype;
    function add(target: object, rawKey: unknown, item: unknown, attributes = 2, kind = 0): void {
      if (rawKey && typeof rawKey === 'object' && (rawKey as ConstantShape).type === 'symbol' && (rawKey as ConstantShape).private) return;
      const key = constant(rawKey) as PropertyKey;
      if (item && typeof item === 'object' && ['builtinAccessor', 'classPositions'].includes((item as ConstantShape).type as string)) return;
      const descriptor: PropertyDescriptor = { configurable: !(attributes & 4), enumerable: !(attributes & 2) };
      const shape = item as { type?: string; get?: unknown; set?: unknown } | null | undefined;
      if (shape && shape.type === 'accessor') {
        const get = typeof shape.get === 'number' ? resolvedArgs[shape.get] : constant(shape.get);
        const set = typeof shape.set === 'number' ? resolvedArgs[shape.set] : constant(shape.set);
        if (typeof get === 'function') descriptor.get = get as () => unknown;
        if (typeof set === 'function') descriptor.set = set as (value: unknown) => void;
      } else if (kind === 1 || kind === 2) {
        const existing = Object.getOwnPropertyDescriptor(target, key);
        if (existing && !('value' in existing)) Object.assign(descriptor, existing);
        descriptor[kind === 1 ? 'get' : 'set'] = item as never;
      } else {
        descriptor.value = typeof item === 'number' ? resolvedArgs[item] : constant(item);
        descriptor.writable = !(attributes & 1);
      }
      Object.defineProperty(target, key, descriptor);
    }
    function properties(target: object, props: ClassGroup, elements: ClassGroup, computed: number[] | undefined): void {
      for (const group of [props, elements]) {
        if (!group || !group.entries) continue;
        for (const [key, value, attrs] of [...group.entries].sort((a, b) => a[3] - b[3])) add(target, key, value, attrs);
      }
      for (const flags of computed || []) {
        const index = flags >>> 2, kind = flags & 3;
        if (kind === 3) throw new Error('Auto-accessor class recipe requires recovery');
        add(target, resolvedArgs[index], resolvedArgs[index + 1], 2, kind);
      }
    }
    properties(ctor, recipe.staticProperties, recipe.staticElements, recipe.staticComputed);
    properties(prototype, recipe.instanceProperties, recipe.instanceElements, recipe.instanceComputed);
    return prototype;
  }
  function runtime(name: string, args: unknown[], frame: { state?: unknown }): unknown {
    switch (name) {
      case 'DefineClass': return defineClass(args);
      case '_AsyncFunctionEnter': {
        const state = { pending: undefined, input: undefined, mode: 0 } as AsyncState;
        state.promise = new Promise((resolve, reject) => { state.resolve = resolve; state.reject = reject; });
        frame.state = state; return state;
      }
      case '_AsyncFunctionAwait': (args[0] as AsyncState).pending = args[1]; return undefined;
      case '_AsyncFunctionResolve': (args[0] as AsyncState).resolve(args[1]); return (args[0] as AsyncState).promise;
      case '_AsyncFunctionReject': (args[0] as AsyncState).reject(args[1]); return (args[0] as AsyncState).promise;
      case '_GeneratorGetResumeMode': return (args[0] as AsyncState).mode;
      case '_CopyDataProperties': {
        if (args[1] != null) for (const key of Reflect.ownKeys(Object(args[1]))) {
          if (Object.prototype.propertyIsEnumerable.call(args[1], key)) own(args[0] as object, key, (args[1] as Record<PropertyKey, unknown>)[key]);
        }
        return undefined;
      }
      case '_CopyDataPropertiesWithExcludedPropertiesOnStack': {
        const [source, ...excluded] = args, result = {};
        if (source == null) throw new TypeError('Cannot destructure null or undefined');
        for (const key of Reflect.ownKeys(Object(source))) if (!excluded.includes(key) && Object.prototype.propertyIsEnumerable.call(source, key)) own(result, key, (source as Record<PropertyKey, unknown>)[key]);
        return result;
      }
      case 'ThrowIteratorResultNotAnObject': throw new TypeError('Iterator result is not an object');
      case 'ThrowStaticPrototypeError': throw new TypeError('Classes may not have a static property named prototype');
      case 'LoadKeyedFromSuper': return Reflect.get(Object.getPrototypeOf(args[1]), args[2] as PropertyKey, args[0]);
      case 'DefineAccessorPropertyUnchecked': Object.defineProperty(args[0] as object, args[1] as PropertyKey, { get: (args[2] as () => unknown) || undefined, set: (args[3] as (value: unknown) => void) || undefined, enumerable: !((args[4] as number) & 2), configurable: !((args[4] as number) & 4) }); return undefined;
      case 'DynamicImportCall': return (globals.__esmImport || fallbackImport)(args[1], args[3]);
      default: throw new Error('Unsupported recovered runtime helper ' + name);
    }
  }
  return { context, constant, literal, runtime, defineClass };
}

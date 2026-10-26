'use strict';

// Standalone runtime for the compiled bundle (src/main/compiled). It exposes the same API as the instruction engine
// but never loads the recovered instruction definitions: function metadata and constant pools come from
// compiled/meta.cjs and every body is ordinary generated JavaScript.
const {createSupport, HOLE, META, CONTEXT, numeric, receiver, own} = require('./runtime-support.cjs');

function createCompiledRuntime(options = {}) {
  const globals = options.globals || globalThis;
  const bodies = options.compiledBodies || require('../compiled/index.cjs');
  const meta = options.meta || require('../compiled/meta.cjs');
  const {context, constant, literal, runtime} = createSupport(globals);
  const rt = {
    HOLE, globals, constant, literal, context, own, receiver, numeric,
    makeFunction: (...args) => makeFunction(...args),
    outer(ctx, depth) { while (depth-- > 0) ctx = ctx[CONTEXT] || ctx[1]; if (!ctx) throw new Error('Missing lexical context'); return ctx; },
    call: (fn, thisValue, args) => Reflect.apply(fn, thisValue, args),
    global(name) { if (!(name in globals)) throw new ReferenceError(name + ' is not defined'); return globals[name]; },
    runtime: (name, args, frame) => runtime(name, args, frame),
    tick: () => { if (options.tick) options.tick(); },
  };

  function makeFunction(id, captured = context(2, null), lexical = {}) {
    const definition = meta[id];
    const body = bodies[id];
    if (!definition || !body) throw new Error('Missing compiled function ' + id);
    const nativeImplementation = options.functionFactories?.[id]?.({readBinding(slot, name, depth = 0) {
      let scope = captured;
      for (let index = 0; index < depth; index++) scope = scope[CONTEXT];
      const value = scope[slot];
      if (value === HOLE) throw new ReferenceError('Cannot access ' + name + ' before initialization');
      return value;
    }});
    if (nativeImplementation !== undefined && typeof nativeImplementation !== 'function') throw new TypeError('Invalid native implementation for ' + id);
    const derived = definition.kind.includes('Derived');
    let fn;
    const invokeOriginal = (that, args, newTarget) => {
      if (nativeImplementation) return Reflect.apply(nativeImplementation, that, args);
      let self = that;
      if (derived) self = HOLE;
      else if (definition.language === 'sloppy') self = that == null ? globals : Object(that);
      return body(rt, fn, self, args, newTarget, captured, definition.constants);
    };
    const invoke = (that, args, newTarget) => {
      if (options.onInvoke) options.onInvoke(id, args, captured);
      if (options.functionOverrides && Object.hasOwn(options.functionOverrides, id)) return Reflect.apply(options.functionOverrides[id], that, args);
      if (options.functionInterceptors && Object.hasOwn(options.functionInterceptors, id)) {
        return options.functionInterceptors[id]((...nextArgs) => invokeOriginal(that, nextArgs, newTarget), args, that);
      }
      return invokeOriginal(that, args, newTarget);
    };
    if (definition.kind.includes('Async') && definition.kind.includes('Arrow')) fn = async (...args) => invoke(lexical.thisValue, args, lexical.newTarget);
    else if (definition.kind.includes('Async')) fn = async function(...args) { return invoke(this, args, undefined); };
    else if (definition.kind.includes('Arrow')) fn = (...args) => invoke(lexical.thisValue, args, lexical.newTarget);
    else if (/Method|Getter|Setter/.test(definition.kind)) fn = {method(...args) { return invoke(this, args, undefined); }}.method;
    else fn = function(...args) { return invoke(this, args, new.target); };
    Object.defineProperty(fn, 'name', {value: definition.name || id, configurable: true});
    Object.defineProperty(fn, 'length', {value: definition.length || 0, configurable: true});
    Object.defineProperty(fn, META, {value: {id, captured, kind: definition.kind}});
    return fn;
  }

  return {makeFunction, context, HOLE, META, constant, literal};
}

module.exports = {createCompiledRuntime, HOLE, META};

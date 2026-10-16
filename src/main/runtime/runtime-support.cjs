'use strict';

// Value helpers shared by the recovered-instruction engine and the compiled runtime: lexical contexts, constant
// pool decoding, literals, class definition and the small set of runtime intrinsics.
const HOLE = Symbol('uninitialized lexical binding');
const SUSPEND = Symbol('async suspension');
const META = Symbol('recovered function');
const CONTEXT = Symbol('context parent');
const numeric = value => typeof value === 'bigint' ? value : Number(value);
const receiver = value => value !== null && (typeof value === 'object' || typeof value === 'function');
const own = (target, key, value) => Object.defineProperty(target, key, {value, writable:true, enumerable:true, configurable:true});

function createSupport(globals) {
  const symbols = new Map();
  const context = (length, parent) => {
    const slots = new Array(Math.max(length, 2)).fill(undefined);
    slots[CONTEXT] = parent;
    slots[1] = parent;
    return slots;
  };
  function constant(value) {
    if (!value || typeof value !== 'object') return value;
    switch (value.type) {
      case 'undefined': case 'uninitialized': return undefined;
      case 'hole': return HOLE;
      case 'number': return Number(value.value);
      case 'bigint': {
        let n = 0n;
        for (let i = value.digits.length - 1; i >= 0; i--) n = (n << 32n) + BigInt(value.digits[i]);
        return value.negative ? -n : n;
      }
      case 'symbol': {
        if (!symbols.has(value.id)) {
          const description = constant(value.description);
          const known = typeof description === 'string' && description.startsWith('Symbol.') ? Symbol[description.slice(7)] : undefined;
          symbols.set(value.id, known || Symbol(description));
        }
        return symbols.get(value.id);
      }
      case 'unsupported': case 'depth-limit': throw new Error('Unrecovered constant: ' + JSON.stringify(value));
      default: return value;
    }
  }
  function literal(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      const result = new Array(value.length);
      value.forEach((item, index) => { const resolved = literal(item); if (resolved !== HOLE) result[index] = resolved; });
      return result;
    }
    if (value.type === 'array') return literal(value.values);
    if (value.type === 'object') {
      const result = {};
      for (const [key, item] of value.entries) own(result, constant(key), literal(item));
      return result;
    }
    if (value.type === 'tuple') return literal(value.values);
    return constant(value);
  }
  function defineClass(args) {
    const [recipe, ctor, parent] = args;
    const hasParent = parent !== HOLE;
    if (hasParent && parent !== null && typeof parent !== 'function') throw new TypeError('Class extends value is not a constructor or null');
    const prototype = Object.create(hasParent ? (parent === null ? null : parent.prototype) : Object.prototype);
    Object.defineProperty(prototype, 'constructor', {value:ctor, writable:true, configurable:true});
    Object.defineProperty(ctor, 'prototype', {value:prototype, writable:false});
    if (hasParent && parent !== null) Object.setPrototypeOf(ctor, parent);
    const resolvedArgs = [...args]; resolvedArgs[2] = prototype;
    function add(target, key, item, attributes = 2, kind = 0) {
      if (key && typeof key === 'object' && key.type === 'symbol' && key.private) return;
      key = constant(key);
      if (item && typeof item === 'object' && ['builtinAccessor','classPositions'].includes(item.type)) return;
      const descriptor = {configurable:!(attributes & 4), enumerable:!(attributes & 2)};
      if (item && item.type === 'accessor') {
        const get = typeof item.get === 'number' ? resolvedArgs[item.get] : constant(item.get);
        const set = typeof item.set === 'number' ? resolvedArgs[item.set] : constant(item.set);
        if (typeof get === 'function') descriptor.get = get;
        if (typeof set === 'function') descriptor.set = set;
      } else if (kind === 1 || kind === 2) {
        const existing = Object.getOwnPropertyDescriptor(target, key);
        if (existing && !('value' in existing)) Object.assign(descriptor, existing);
        descriptor[kind === 1 ? 'get' : 'set'] = item;
      } else {
        descriptor.value = typeof item === 'number' ? resolvedArgs[item] : constant(item);
        descriptor.writable = !(attributes & 1);
      }
      Object.defineProperty(target, key, descriptor);
    }
    function properties(target, properties, elements, computed) {
      for (const group of [properties, elements]) {
        if (!group || !group.entries) continue;
        for (const [key,value,attrs] of [...group.entries].sort((a,b)=>a[3]-b[3])) add(target,key,value,attrs);
      }
      for (const flags of computed || []) {
        const index = flags >>> 2, kind = flags & 3;
        if (kind === 3) throw new Error('Auto-accessor class recipe requires recovery');
        add(target,resolvedArgs[index],resolvedArgs[index+1],2,kind);
      }
    }
    properties(ctor,recipe.staticProperties,recipe.staticElements,recipe.staticComputed);
    properties(prototype,recipe.instanceProperties,recipe.instanceElements,recipe.instanceComputed);
    return prototype;
  }
  function runtime(name, args, frame) {
    switch (name) {
      case 'DefineClass': return defineClass(args);
      case '_AsyncFunctionEnter': {
        const state = {pending:undefined,input:undefined,mode:0};
        state.promise = new Promise((resolve,reject)=>{state.resolve=resolve;state.reject=reject;});
        frame.state = state; return state;
      }
      case '_AsyncFunctionAwait': args[0].pending = args[1]; return undefined;
      case '_AsyncFunctionResolve': args[0].resolve(args[1]); return args[0].promise;
      case '_AsyncFunctionReject': args[0].reject(args[1]); return args[0].promise;
      case '_GeneratorGetResumeMode': return args[0].mode;
      case '_CopyDataProperties': {
        if (args[1] != null) for (const key of Reflect.ownKeys(Object(args[1]))) {
          if (Object.prototype.propertyIsEnumerable.call(args[1],key)) own(args[0],key,args[1][key]);
        }
        return undefined;
      }
      case '_CopyDataPropertiesWithExcludedPropertiesOnStack': {
        const [source,...excluded] = args, result = {};
        if (source == null) throw new TypeError('Cannot destructure null or undefined');
        for (const key of Reflect.ownKeys(Object(source))) if (!excluded.includes(key) && Object.prototype.propertyIsEnumerable.call(source,key)) own(result,key,source[key]);
        return result;
      }
      case 'ThrowIteratorResultNotAnObject': throw new TypeError('Iterator result is not an object');
      case 'ThrowStaticPrototypeError': throw new TypeError('Classes may not have a static property named prototype');
      case 'LoadKeyedFromSuper': return Reflect.get(Object.getPrototypeOf(args[1]),args[2],args[0]);
      case 'DefineAccessorPropertyUnchecked': Object.defineProperty(args[0],args[1],{get:args[2] || undefined,set:args[3] || undefined,enumerable:!(args[4]&2),configurable:!(args[4]&4)}); return undefined;
      case 'DynamicImportCall': return (globals.__esmImport || (specifier=>import(specifier)))(args[1],args[3]);
      default: throw new Error('Unsupported recovered runtime helper ' + name);
    }
  }
  return {context, constant, literal, runtime, defineClass};
}

module.exports = {createSupport, HOLE, SUSPEND, META, CONTEXT, numeric, receiver, own};

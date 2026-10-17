'use strict';

// JavaScript execution engine for recovered instruction definitions.
// Generated modules are ordinary editable JavaScript; no .jsc file is loaded.
const {createSupport, HOLE, SUSPEND, META, CONTEXT, numeric, receiver, own} = require('./runtime-support.legacy.cjs');

function createEngine(definitions, options = {}) {
  const globals = options.globals || globalThis;
  // Compiled bodies (tools/compiler) replace the instruction interpreter per function. MATRIX_COMPILED=1 enables them
  // for every engine, which is how the full test suite is also run against the compiled code.
  const compiledBodies = options.compiledBodies ?? (process.env.MATRIX_COMPILED === '1' ? require('../../../src/main/compiled/index.cjs') : undefined);
  const maps = new WeakMap();
  const {context, constant, literal, runtime} = createSupport(globals);
  // Helpers used by compiled function bodies (see tools/compiler). They mirror the interpreter's semantics.
  const rt={
    HOLE, globals, constant, literal, context, own, receiver,
    numeric,
    makeFunction: (...args) => makeFunction(...args),
    outer(ctx, depth) { while (depth-- > 0) ctx = ctx[CONTEXT] || ctx[1]; if (!ctx) throw new Error('Missing lexical context'); return ctx; },
    call: (fn, thisValue, args) => Reflect.apply(fn, thisValue, args),
    global(name) { if (!(name in globals)) throw new ReferenceError(name + ' is not defined'); return globals[name]; },
    runtime: (name, args, frame) => runtime(name, args, frame),
    tick: () => { if (options.tick) options.tick(); },
  };
  function makeFunction(id, captured = context(2, null), lexical = {}) {
    const definition = definitions[id];
    if (!definition) throw new Error('Missing recovered function ' + id);
    // A migration adapter can replace a complete function with ordinary source
    // while callers still live in recovered lexical scopes. Resolve bindings
    // at call time, preserving late initialization and separate closures.
    const nativeImplementation=options.functionFactories?.[id]?.({readBinding(slot,name,depth=0){
      let scope=captured;
      for(let index=0;index<depth;index++)scope=scope[CONTEXT];
      const value=scope[slot];
      if(value===HOLE)throw new ReferenceError('Cannot access '+name+' before initialization');
      return value;
    }});
    if(nativeImplementation!==undefined&&typeof nativeImplementation!=='function')throw new TypeError('Invalid native implementation for '+id);
    let fn;
    const invoke = (that, args, newTarget) => {
      if(options.onInvoke)options.onInvoke(definition.id,args,captured);
      if (Object.hasOwn(options.functionOverrides || {}, id)) {
        return Reflect.apply(options.functionOverrides[id], that, args);
      }
      if (Object.hasOwn(options.functionInterceptors || {}, id)) {
        return options.functionInterceptors[id]((...nextArgs)=>invokeOriginal(that,nextArgs,newTarget),args);
      }
      return invokeOriginal(that,args,newTarget);
    };
    const invokeOriginal = (that,args,newTarget) => {
      if(nativeImplementation)return Reflect.apply(nativeImplementation,that,args);
      const compiled = compiledBodies?.[id];
      if (compiled) {
        let self = that;
        if (definition.kind.includes('Derived')) self = HOLE;
        else if (definition.language === 'sloppy') self = that == null ? globals : Object(that);
        return compiled(rt, fn, self, args, newTarget, captured, definition.constants);
      }
      const frame = {
        definition, fn, args, regs: new Array(definition.registerCount), ctx: captured,
        thisValue: definition.kind.includes('Derived') ? HOLE : that,
        newTarget, accu: undefined, pc: 0, pendingMessage: HOLE,
        steps: 0, trace: [],
      };
      if (definition.language === 'sloppy' && !definition.kind.includes('Derived')) {
        frame.thisValue = that == null ? globals : Object(that);
      }
      if (Number.isInteger(definition.incoming) && definition.incoming >= 0 && definition.incoming < frame.regs.length) frame.regs[definition.incoming] = newTarget;
      return definition.kind.includes('Async') ? driveAsync(frame) : execute(frame);
    };
    if (definition.kind.includes('Async') && definition.kind.includes('Arrow')) fn=async (...args)=>invoke(lexical.thisValue,args,lexical.newTarget);
    else if (definition.kind.includes('Async')) fn=async function(...args){return invoke(this,args,undefined);};
    else if (definition.kind.includes('Arrow')) fn=(...args)=>invoke(lexical.thisValue,args,lexical.newTarget);
    else if (/Method|Getter|Setter/.test(definition.kind)) fn={method(...args){return invoke(this,args,undefined);}}.method;
    else fn=function(...args){return invoke(this,args,new.target);};
    Object.defineProperty(fn, 'name', {value: definition.name || id, configurable: true});
    Object.defineProperty(fn, 'length', {value: definition.length || 0, configurable: true});
    Object.defineProperty(fn, META, {value: {id, captured, kind:definition.kind}});
    return fn;
  }
  async function driveAsync(frame) {
    for (;;) {
      const result = execute(frame);
      if (!result || result[SUSPEND] !== true) return result;
      try { frame.state.input = await frame.state.pending; frame.state.mode = 0; }
      catch (error) { frame.state.input = error; frame.state.mode = 1; }
    }
  }
  function execute(frame) {
    const definition = frame.definition, code = definition.code;
    let offsetMap = maps.get(definition);
    if (!offsetMap) { offsetMap = new Map(code.map((row,index)=>[row[0],index])); maps.set(definition,offsetMap); }
    const get = operand => {
      if (!operand || typeof operand !== 'object') return operand;
      if ('r' in operand) return frame.regs[operand.r];
      if ('a' in operand) return frame.args[operand.a];
      if ('c' in operand) return constant(definition.constants[operand.c]);
      switch (operand.special) {
        case 'context': return frame.ctx;
        case 'closure': return frame.fn;
        case 'this': return frame.thisValue;
        case 'new.target': case 'new_target': return frame.newTarget;
        default: throw new Error('Invalid operand ' + JSON.stringify(operand));
      }
    };
    const set = (operand, value) => {
      if ('r' in operand) frame.regs[operand.r] = value;
      else if ('a' in operand) frame.args[operand.a] = value;
      else if (operand.special === 'context') frame.ctx = value;
      else if (operand.special === 'this') frame.thisValue = value;
      else throw new Error('Invalid destination ' + JSON.stringify(operand));
    };
    const range = operand => {
      const count=definition.registerCounts?.[code[frame.pc-1][0]];
      if (count===0) return [];
      if (operand.range) return frame.regs.slice(operand.range[0],operand.range[0]+(count ?? operand.range[1]-operand.range[0]+1));
      if (operand.argRange) return frame.args.slice(operand.argRange[0],operand.argRange[0]+(count ?? operand.argRange[1]-operand.argRange[0]+1));
      return [get(operand)];
    };
    const outer = (ctx, depth) => { while (depth-- > 0) ctx = ctx[CONTEXT] || ctx[1]; if (!ctx) throw new Error('Missing lexical context'); return ctx; };
    const jump = offset => { const index=offsetMap.get(offset); if(index===undefined) throw new Error('Missing jump target '+offset); frame.pc=index; };
    const call = (fn, thisValue, args) => Reflect.apply(fn,thisValue,args);
    while (frame.pc < code.length) {
      const row = code[frame.pc++], [pc,op,args,target] = row;
      const value = get;
      const a = args[0], b = args[1], c = args[2];
      frame.trace.push([pc,op]); if (frame.trace.length > 20) frame.trace.shift();
      if (++frame.steps > (options.maxSteps || 100000000)) throw new Error('Recovered function exceeded instruction limit: '+definition.id);
      try {
        if (/^Star\d+$/.test(op)) { frame.regs[Number(op.slice(4))]=frame.accu; continue; }
        switch(op) {
          case 'LdaZero': frame.accu=0; break;
          case 'LdaSmi': frame.accu=a; break;
          case 'LdaUndefined': frame.accu=undefined; break;
          case 'LdaNull': frame.accu=null; break;
          case 'LdaTheHole': frame.accu=HOLE; break;
          case 'LdaTrue': frame.accu=true; break;
          case 'LdaFalse': frame.accu=false; break;
          case 'LdaConstant': case 'Ldar': frame.accu=value(a); break;
          case 'Star': set(a,frame.accu); break;
          case 'Mov': set(b,value(a)); break;
          case 'LdaGlobal': if(!(value(a) in globals)) throw new ReferenceError(value(a)+' is not defined'); frame.accu=globals[value(a)]; break;
          case 'LdaGlobalInsideTypeof': frame.accu=globals[value(a)]; break;
          case 'CreateClosure': frame.accu=makeFunction(value(a).id,frame.ctx,{thisValue:frame.thisValue,newTarget:frame.newTarget}); break;
          case 'CreateFunctionContext': case 'CreateFunctionContextWithCells': frame.accu=context(b+2,frame.ctx); break;
          case 'CreateBlockContext': frame.accu=context(value(a).length,frame.ctx); break;
          case 'CreateCatchContext': { const ctx=context(value(b).length,frame.ctx);ctx[2]=value(a);frame.accu=ctx;break; }
          case 'PushContext': set(a,frame.ctx); frame.ctx=frame.accu; break;
          case 'PopContext': frame.ctx=value(a); break;
          case 'LdaImmutableCurrentContextSlot': case 'LdaCurrentContextSlotNoCell': case 'LdaCurrentContextSlot': frame.accu=frame.ctx[a]; break;
          case 'LdaImmutableContextSlot': case 'LdaContextSlotNoCell': case 'LdaContextSlot': frame.accu=outer(value(a),c)[b]; break;
          case 'StaCurrentContextSlotNoCell': case 'StaCurrentContextSlot': frame.ctx[a]=frame.accu; break;
          case 'StaContextSlotNoCell': case 'StaContextSlot': outer(value(a),c)[b]=frame.accu; break;
          case 'GetNamedProperty': frame.accu=value(a)[value(b)]; break;
          case 'GetKeyedProperty': frame.accu=value(a)[frame.accu]; break;
          case 'SetNamedProperty': value(a)[value(b)]=frame.accu; break;
          case 'SetKeyedProperty': value(a)[value(b)]=frame.accu; break;
          case 'DefineNamedOwnProperty': own(value(a),value(b),frame.accu); break;
          case 'DefineKeyedOwnProperty': case 'DefineKeyedOwnPropertyInLiteral': own(value(a),value(b),frame.accu); break;
          case 'StaInArrayLiteral': value(a)[value(b)]=frame.accu; break;
          case 'CreateObjectLiteral': case 'CreateArrayLiteral': frame.accu=literal(value(a)); break;
          case 'CreateEmptyObjectLiteral': frame.accu={}; break;
          case 'CreateEmptyArrayLiteral': frame.accu=[]; break;
          case 'CreateArrayFromIterable': frame.accu=[...frame.accu]; break;
          case 'CloneObject': frame.accu={...value(a)}; break;
          case 'CreateRegExpLiteral': { const flags=c, names=['g','i','m','y','u','s','l','d','v'];frame.accu=new RegExp(value(a),names.filter((_,n)=>(flags&(1<<n))!==0).join(''));break; }
          case 'CallUndefinedReceiver0': frame.accu=call(value(a),undefined,[]);break;
          case 'CallUndefinedReceiver1': frame.accu=call(value(a),undefined,[value(b)]);break;
          case 'CallUndefinedReceiver2': frame.accu=call(value(a),undefined,[value(b),value(c)]);break;
          case 'CallUndefinedReceiver': frame.accu=call(value(a),undefined,range(b));break;
          case 'CallProperty0': frame.accu=call(value(a),value(b),[]);break;
          case 'CallProperty1': frame.accu=call(value(a),value(b),[value(c)]);break;
          case 'CallProperty2': frame.accu=call(value(a),value(b),[value(c),value(args[3])]);break;
          case 'CallProperty': case 'CallAnyReceiver': { const list=range(b);frame.accu=call(value(a),list.shift(),list);break; }
          case 'CallWithSpread': {const list=range(b), spread=list.pop(),that=list.shift();frame.accu=call(value(a),that,[...list,...spread]);break;}
          case 'Construct': frame.accu=Reflect.construct(value(a),range(b),frame.accu || value(a));break;
          case 'CallRuntime': case 'InvokeIntrinsic': frame.accu=runtime(a,b===undefined?[]:range(b),frame);break;
          case 'Return': return frame.accu;
          case 'Throw': case 'ReThrow': throw frame.accu;
          case 'ThrowReferenceErrorIfHole': if(frame.accu===HOLE) throw new ReferenceError('Cannot access '+value(a)+' before initialization');break;
          case 'ThrowSuperNotCalledIfHole': if(frame.accu===HOLE) throw new ReferenceError('Must call super constructor');break;
          case 'ThrowSuperAlreadyCalledIfNotHole': if(frame.accu!==HOLE) throw new ReferenceError('Super constructor already called');break;
          case 'ThrowIfNotSuperConstructor': if(typeof value(a)!=='function') throw new TypeError('Super value is not a constructor');break;
          case 'FindNonDefaultConstructorOrConstruct': { const start=c.range[0];frame.regs[start]=false;frame.regs[start+1]=Object.getPrototypeOf(value(a));break; }
          case 'GetIterator': frame.accu=value(a)[Symbol.iterator]();break;
          case 'ToName': frame.accu=typeof frame.accu==='symbol'?frame.accu:String(frame.accu);break;
          case 'ToObject': frame.accu=Object(frame.accu);if(a) set(a,frame.accu);break;
          case 'ToNumeric': frame.accu=numeric(frame.accu);break;
          case 'ToNumber': frame.accu=Number(frame.accu);break;
          case 'ToBoolean': frame.accu=Boolean(frame.accu);break;
          case 'LogicalNot': case 'ToBooleanLogicalNot': frame.accu=!frame.accu;break;
          case 'TypeOf': frame.accu=typeof frame.accu;break;
          case 'TestTypeOf': frame.accu=typeof frame.accu === ['number','string','symbol','boolean','bigint','undefined','function','object'][a];break;
          case 'TestUndefined': frame.accu=frame.accu===undefined;break;
          case 'TestNull': frame.accu=frame.accu===null;break;
          case 'TestUndetectable': frame.accu=frame.accu==null;break;
          case 'TestEqual': frame.accu=value(a)==frame.accu;break;
          case 'TestEqualStrict': case 'TestReferenceEqual': frame.accu=value(a)===frame.accu;break;
          case 'TestLessThan': frame.accu=value(a)<frame.accu;break;
          case 'TestLessThanOrEqual': frame.accu=value(a)<=frame.accu;break;
          case 'TestGreaterThan': frame.accu=value(a)>frame.accu;break;
          case 'TestGreaterThanOrEqual': frame.accu=value(a)>=frame.accu;break;
          case 'TestInstanceOf': frame.accu=value(a) instanceof frame.accu;break;
          case 'TestIn': frame.accu=value(a) in frame.accu;break;
          case 'Add': frame.accu=value(a)+frame.accu;break;
          case 'Sub': frame.accu=value(a)-frame.accu;break;
          case 'Mul': frame.accu=value(a)*frame.accu;break;
          case 'Div': frame.accu=value(a)/frame.accu;break;
          case 'Mod': frame.accu=value(a)%frame.accu;break;
          case 'Exp': frame.accu=value(a)**frame.accu;break;
          case 'BitwiseOr': frame.accu=value(a)|frame.accu;break;
          case 'BitwiseAnd': frame.accu=value(a)&frame.accu;break;
          case 'BitwiseXor': frame.accu=value(a)^frame.accu;break;
          case 'ShiftLeft': frame.accu=value(a)<<frame.accu;break;
          case 'ShiftRight': frame.accu=value(a)>>frame.accu;break;
          case 'ShiftRightLogical': frame.accu=value(a)>>>frame.accu;break;
          case 'AddSmi': frame.accu=frame.accu+a;break;
          case 'SubSmi': frame.accu=frame.accu-a;break;
          case 'MulSmi': frame.accu=frame.accu*a;break;
          case 'DivSmi': frame.accu=frame.accu/a;break;
          case 'ModSmi': frame.accu=frame.accu%a;break;
          case 'BitwiseAndSmi': frame.accu=frame.accu&a;break;
          case 'BitwiseOrSmi': frame.accu=frame.accu|a;break;
          case 'BitwiseXorSmi': frame.accu=frame.accu^a;break;
          case 'ShiftLeftSmi': frame.accu=frame.accu<<a;break;
          case 'ShiftRightSmi': frame.accu=frame.accu>>a;break;
          case 'ShiftRightLogicalSmi': frame.accu=frame.accu>>>a;break;
          case 'Inc': frame.accu=numeric(frame.accu)+(typeof frame.accu==='bigint'?1n:1);break;
          case 'Dec': frame.accu=numeric(frame.accu)-(typeof frame.accu==='bigint'?1n:1);break;
          case 'Negate': frame.accu=-numeric(frame.accu);break;
          case 'BitwiseNot': frame.accu=~numeric(frame.accu);break;
          case 'DeletePropertyStrict': frame.accu=delete value(a)[frame.accu];break;
          case 'CreateRestParameter': frame.accu=frame.args.slice(definition.parameterCount-1);break;
          case 'SetPendingMessage': {const previous=frame.pendingMessage;frame.pendingMessage=frame.accu;frame.accu=previous;break;}
          case 'SwitchOnGeneratorState': break;
          case 'SuspendGenerator': return {[SUSPEND]:true};
          case 'ResumeGenerator': frame.accu=value(a).input;break;
          case 'SwitchOnSmiNoFeedback': {const table=args.find(x=>x&&x.table)?.table; if(table&&Object.hasOwn(table,frame.accu))jump(table[frame.accu]);break;}
          case 'Jump': case 'JumpConstant': case 'JumpLoop': jump(target);break;
          case 'JumpIfTrue': case 'JumpIfTrueConstant': if(frame.accu===true)jump(target);break;
          case 'JumpIfFalse': case 'JumpIfFalseConstant': if(frame.accu===false)jump(target);break;
          case 'JumpIfToBooleanTrue': case 'JumpIfToBooleanTrueConstant': if(frame.accu)jump(target);break;
          case 'JumpIfToBooleanFalse': case 'JumpIfToBooleanFalseConstant': if(!frame.accu)jump(target);break;
          case 'JumpIfUndefined': if(frame.accu===undefined)jump(target);break;
          case 'JumpIfNotUndefined': if(frame.accu!==undefined)jump(target);break;
          case 'JumpIfNull': if(frame.accu===null)jump(target);break;
          case 'JumpIfNotNull': if(frame.accu!==null)jump(target);break;
          case 'JumpIfUndefinedOrNull': case 'JumpIfUndefinedOrNullConstant': if(frame.accu==null)jump(target);break;
          case 'JumpIfJSReceiver': if(receiver(frame.accu))jump(target);break;
          case 'ForInEnumerate': {const keys=[];for(const key in value(a))keys.push(key);frame.accu=keys;break;}
          case 'ForInPrepare': {const start=a.range[0];frame.regs[start]=frame.accu;frame.regs[start+1]=frame.accu;frame.regs[start+2]=frame.accu.length;break;}
          case 'ForInNext': {const key=frame.regs[c.range[0]][value(b)];frame.accu=key!==undefined&&key in value(a)?key:undefined;break;}
          case 'ForInStep': set(a,value(a)+1);break;
          case 'JumpIfForInDone': if(value(b)===value(c))jump(target);break;
          default: throw new Error('Unsupported recovered opcode '+op);
        }
      } catch(error) {
        const handlers=definition.handlers.filter(h=>pc>=h[0]&&pc<h[1]).sort((a,b)=>(a[1]-a[0])-(b[1]-b[0]));
        if(handlers.length) { const h=handlers[0];frame.accu=error;frame.ctx=frame.regs[h[4]];jump(h[2]); }
        else {
          if(error&&typeof error==='object'&&!error.recoveredFrames) error.recoveredFrames=[];
          if(error&&typeof error==='object') error.recoveredFrames.push({function:definition.id,pc,opcode:op,trace:frame.trace.slice()});
          throw error;
        }
      }
    }
    return undefined;
  }
  return {makeFunction,context,HOLE,META,definitions,constant,literal};
}

module.exports = {createEngine,HOLE,META};

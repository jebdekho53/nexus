'use strict';
// Shared pieces of the offline equivalence checks (bootstrap-check.cjs, boundary-check.cjs): a recording stub
// environment standing in for Electron/Node modules, deterministic randomness, a virtual clock and the three runtimes.
const{createEngine}=require('../../src/main/runtime/engine.cjs');
const{createCompiledRuntime}=require('../../src/main/runtime/compiled-runtime.cjs');
const{META}=require('../../src/main/runtime/runtime-support.cjs');

const ROOT_CONTEXT_SLOTS=2133; // length of the bootstrap's own context array (f1)

// deterministic Math.random so code that draws random numbers can be compared
function seedRandom(seed=12345) {
  let state=seed>>>0;
  Math.random=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}

function summarise(value,depth=0) {
  try {return summariseValue(value,depth);} catch(error) {return 'unreadable:'+(error&&error.name);}
}
function summariseValue(value,depth) {
  if(typeof value==='function')return value[META]?'closure:'+value[META].id+':'+value.name+'/'+value.length:'fn';
  if(value&&typeof value==='object'&&value.__stub)return 'stub#'+value.__stub;
  if(typeof value==='string')return 's:'+value.slice(0,80);
  if(Array.isArray(value))return depth<2?'['+Array.prototype.map.call(value,item=>summarise(item,depth+1)).join(',')+']':'array';
  if(value&&typeof value==='object')return depth<2?'{'+Reflect.ownKeys(value).filter(key=>key!==META).map(key=>String(key)+':'+summarise(value[key],depth+1)).join(',')+'}':'object';
  return String(value);
}

// A recording stand-in: every property read, call, construction and assignment is logged; results are further stubs.
// Callbacks handed to a stub are collected in `callbacks` so a harness can invoke them later.
function createStubs(log,callbacks=[],settings={}) {
  let counter=0;
  const record=(label,args)=>{
    args.forEach((value,index)=>{if(typeof value==='function')callbacks.push({label,index,fn:value,first:typeof args[0]==='string'?args[0]:''});});
    return args.map(value=>summarise(value)).join(',');
  };
  function stub(label,options={}) {
    const id=++counter;
    const children=new Map();
    const target=function(){};
    return new Proxy(target,{
      get(_t,key) {
        if(key==='__stub')return id;
        if(key===Symbol.toPrimitive)return()=>'stub#'+id;
        if(typeof key==='symbol')return key===Symbol.iterator?function*(){}:undefined;
        if(key==='then'&&(options.plain||settings.thenable)) {
          if(options.plain)return undefined;
          return resolve=>{log.push('then '+label);if(typeof resolve==='function')resolve(stub(label+'~',{plain:true}));};
        }
        log.push('get '+label+'.'+key);
        if(!children.has(key))children.set(key,stub(label+'.'+key));
        return children.get(key);
      },
      set(_t,key,value){log.push('set '+label+'.'+String(key)+'='+record(label+'.'+String(key),[value]));return true;},
      has(){return true;},
      apply(_t,that,args){log.push('call '+label+'('+record(label,args)+')');return stub(label+'()');},
      construct(_t,args){log.push('new '+label+'('+record(label,args)+')');return stub('new '+label);},
    });
  }
  return{stub,describe:summarise,callbacks};
}

// Virtual clock: timers fire in order when flushed; Date.now/performance.now follow it. Real time never passes,
// so provider waits (2500 ms, 3000 ms ...) are kept as written but cost nothing. The clock is handed to the recovered
// code through its globals object; the harness process's own timers are untouched.
function createClock() {
  const realImmediate=globalThis.setImmediate;
  const timers=new Map();
  const origin=1_700_000_000_000;
  let now=origin,next=1;
  const add=(callback,delay,repeat,args)=>{
    const id=next++;
    timers.set(id,{id,at:now+Math.max(1,Number(delay)||0),callback,repeat:repeat?Math.max(1,Number(delay)||0):0,args});
    return id;
  };
  class VirtualDate extends Date {
    constructor(...args){if(args.length===0)super(now);else super(...args);}
    static now(){return now;}
  }
  const globals={
    setTimeout:(callback,delay,...args)=>add(callback,delay,false,args),
    setInterval:(callback,delay,...args)=>add(callback,delay,true,args),
    setImmediate:(callback,...args)=>add(callback,0,false,args),
    clearTimeout:id=>{timers.delete(id);},
    clearInterval:id=>{timers.delete(id);},
    Date:VirtualDate,
    performance:{now:()=>now-origin,timeOrigin:origin,mark(){},measure(){}},
  };
  const settle=()=>new Promise(resolve=>realImmediate(resolve));
  return{
    globals,
    // advance virtual time until no timer is left or `limit` ms have passed; returns the number of timers fired
    async flush(limit=300_000,maxTimers=2000) {
      let fired=0;
      const end=now+limit;
      for(let turns=0;turns<50;turns++)await settle();
      while(timers.size&&fired<maxTimers) {
        const due=[...timers.values()].sort((a,b)=>a.at-b.at||a.id-b.id)[0];
        if(due.at>end)break;
        now=Math.max(now,due.at);
        if(due.repeat)due.at=now+due.repeat;else timers.delete(due.id);
        try {due.callback(...due.args);} catch(error) {}
        fired++;
        for(let turns=0;turns<50;turns++)await settle();
      }
      return fired;
    },
    settle,
    pending:()=>timers.size,
    reset(){timers.clear();},
  };
}

// Globals seen by the recovered code during boundary checks: the real builtins, but no network, no process exit and the
// virtual clock. Everything it tries to reach outside is recorded in `log` instead of happening.
function createSandbox(log,stub,clock) {
  const guarded=name=>stub('global.'+name);
  const processProxy=new Proxy(process,{
    get(target,key){
      if(key==='pid')return 4242;
      if(key==='ppid')return 4241;
      if(['exit','kill','abort','reallyExit','dlopen','chdir','umask'].includes(key))return(...args)=>{log.push('process.'+key+'('+args.map(summarise).join(',')+')');};
      const value=Reflect.get(target,key,target);
      return typeof value==='function'?value.bind(target):value;
    },
  });
  return Object.create(globalThis,Object.fromEntries(Object.entries({
    ...clock.globals,
    fetch:guarded('fetch'),WebSocket:guarded('WebSocket'),XMLHttpRequest:guarded('XMLHttpRequest'),EventSource:guarded('EventSource'),
    process:processProxy,
    __esmImport:(specifier)=>{log.push('import '+specifier);return Promise.resolve(stub('import('+specifier+')',{plain:true}));},
  }).map(([key,value])=>[key,{value,writable:true,configurable:true,enumerable:true}])));
}

// The three runtimes under comparison. Each factory receives a state object and stores the bootstrap's root context.
function runtimeFactories() {
  const definitions=require('../../src/main/generated/index.cjs');
  const{compileDefinition}=require('./compile.cjs');
  const names=require('./names.cjs').loadNames();
  const capture=state=>(id,args,captured)=>{if(captured?.length===ROOT_CONTEXT_SLOTS&&!state.root)state.root=captured;};
  return{
    interpreter:(state,globals)=>createEngine(definitions,{onInvoke:capture(state),globals}),
    compiled:(state,globals)=>createCompiledRuntime({onInvoke:capture(state),globals}),
    unsplit:(state,globals)=>{
      const bundle=require('../../src/main/compiled/index.cjs');
      const exportsObject={};
      new Function('exports','"use strict";'+compileDefinition(definitions.f1,{names}))(exportsObject);
      return createCompiledRuntime({compiledBodies:{...bundle,f1:exportsObject.f1},onInvoke:capture(state),globals});
    },
  };
}

// Runs the application bootstrap (f0 -> CommonJS wrapper -> f1) against the stub environment. With
// options.sandbox the recovered code sees sandboxed globals (virtual clock, no network) and stubs resolve when awaited,
// so asynchronous continuations and callbacks can run; otherwise only the synchronous initialisation executes.
function runBootstrap(makeRuntime,options={}) {
  seedRandom();
  const log=[];
  const callbacks=[];
  const{stub,describe}=createStubs(log,callbacks,{thenable:!!options.sandbox});
  const clock=createClock();
  const globals=options.sandbox?createSandbox(log,stub,clock):undefined;
  const state={root:null};
  const runtime=makeRuntime(state,globals);
  let error=null;
  const moduleObject={exports:{},filename:'main.js',id:'main.js',paths:[]};
  try {
    const wrapper=runtime.makeFunction('f0')();
    const required=new Map();
    const require=request=>{
      log.push('require '+request);
      if(!required.has(request))required.set(request,options.modules?.[request]??stub('module('+request+')'));
      return required.get(request);
    };
    wrapper.call(moduleObject.exports,moduleObject.exports,require,moduleObject,'main.js','.');
    log.push('exports '+Object.keys(moduleObject.exports).join(','));
  } catch(caught) {
    error=caught instanceof Error?caught.name+': '+String(caught.message).replace(/\s+/g,' ').slice(0,100):String(caught);
  }
  return{log,error,root:state.root,describe,stub,callbacks,clock,exports:moduleObject.exports,runtime};
}

// Calling a non-function is worded differently by the interpreter (Reflect.apply: "Function.prototype.apply was called
// on ...") and by compiled code (direct call: "x.y(...) is not a function", the V8 style of the original program). The
// text can surface in {ok:false,error} IPC replies, but only for such failing calls; everything else must match exactly.
const normaliseText=text=>String(text)
  .replace(/Function\.prototype\.apply was called on [^}|]*?(?= effects=|[}|]|$)/g,'NOT_A_FUNCTION')
  .replace(/[A-Za-z_$][\w$]*(?:\[[^\]]*\]|\.[\w$]+|\(\.\.\.\))* is not a function/g,'NOT_A_FUNCTION')
  .replace(/(TypeError:)[^|]*(is not a constructor|Reflect\.apply is not a function)[^|]*/g,'$1call');

module.exports={seedRandom,summarise,createStubs,createClock,createSandbox,runtimeFactories,runBootstrap,normaliseText,ROOT_CONTEXT_SLOTS,META};

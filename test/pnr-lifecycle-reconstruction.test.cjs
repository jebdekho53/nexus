'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
function fixture(native,options={}){
  const trace=[],tasks=new Map();let id=0;
  const timers={setTimeout(fn,ms){const handle=++id;trace.push(['timeout',handle,ms]);tasks.set(handle,fn);return handle;},clearTimeout(handle){trace.push(['clear',handle]);}};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{timers}}):{},globals:{...globalThis,Promise,...timers}}),root=engine.context(1842,null);
  const table=Object.assign({},...Object.values(strings));root[5]=root[1841]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  const context=engine.context(2,root),actor={stopped:!!options.stopped,terminal:options.terminal??false,securityQuarantined:!!options.quarantined,
    session:{page:options.noPage?undefined:{isClosed(){trace.push(['closed']);return !!options.closed;}}},
    isSettlingPayment(){trace.push(['settling']);return options.settling??false;},
  };
  actor.canRequestPnr=engine.makeFunction('f2220',context);actor.waitForPnrRetry=engine.makeFunction('f2221',context);
  return{actor,trace,tasks};
}
for(const[name,options]of Object.entries({open:{},stopped:{stopped:true},terminal:{terminal:'synthetic'},quarantined:{quarantined:true},closed:{closed:true},settling:{closed:true,settling:true},noPage:{noPage:true}}))
test('PNR request guard matches recovered function: '+name,()=>{
  const before=fixture(false,options),after=fixture(true,options);
  assert.equal(after.actor.canRequestPnr(),before.actor.canRequestPnr());assert.deepEqual(after.trace,before.trace);
});
async function scenario(native,mode){
  const f=fixture(native,mode==='blocked'?{stopped:true}:{}),promise=f.actor.waitForPnrRetry(1234);let second;
  if(mode==='cancel')f.actor.cancelPnrWait();
  else if(mode==='overlap'){
    second=f.actor.waitForPnrRetry(5678);f.tasks.get(1)();
    assert.equal(typeof f.actor.cancelPnrWait,'function');f.actor.cancelPnrWait();
  }else if(mode!=='blocked'){
    if(mode==='stopWhileWaiting')f.actor.stopped=true;
    if(mode==='quarantineWhileWaiting')f.actor.securityQuarantined=true;
    f.tasks.get(1)();
  }
  return{trace:f.trace,result:await promise,second:second?await second:undefined,cancelCleared:f.actor.cancelPnrWait===undefined};
}
for(const mode of ['timer','cancel','blocked','stopWhileWaiting','quarantineWhileWaiting','overlap'])
test('PNR retry wait preserves recovered cancellation/ownership: '+mode,async()=>{
  assert.deepEqual(await scenario(true,mode),await scenario(false,mode));
});

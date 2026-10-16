'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
function fixture(native,id,{library,filter,timers}={}){
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{timers}}):{},globals:{Promise,setTimeout:timers?.setTimeout}}),root=engine.context(248,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};root[15]=library;root[247]=filter;
  return engine.makeFunction(id,engine.context(2,root));
}
async function run(native,id,options={}){
  const trace=[],cookies=options.cookies===undefined?[{name:'fixture-keep',value:'fixture-value'},{name:'fixture-exclude',value:'fixture-value'}]:options.cookies;
  const created={synthetic:'new-context'},existing={synthetic:'existing-context'};
  const actor={stripF5:!!options.filter,survivorProxy:options.proxy,
    async clientHints(){trace.push(['hints']);if(options.hintsThrow)throw Error('synthetic hints');return options.hints===undefined?{ua:'fixture-ua'}:options.hints;},
    page:{context(){trace.push(['browser-context']);if(options.contextThrow)throw Error('synthetic browser context');return{cookies(){trace.push(['cookies']);if(options.cookiesThrow)throw Error('synthetic cookies');if(options.cookiesReject)return Promise.reject(Error('synthetic cookies'));return Promise.resolve(cookies);}};}},
    log(...args){trace.push(['log',...args]);if(options.logThrow)throw Error('synthetic log');},
  };
  const field=id==='f1619'?'survivorReq':'directCtx';if(options.existing)actor[field]=existing;
  if(options.proxyGetter){const proxy=actor.survivorProxy;Object.defineProperty(actor,'survivorProxy',{get(){trace.push(['proxy-read']);return proxy;}});}
  const request={newContext(settings){assert.equal(this,request);trace.push(['new-context',settings]);if(!options.filter&&!options.cookiesReject)assert.equal(settings.storageState.cookies,cookies);
    if(options.newContextThrow)throw Error('synthetic new context');if(options.newContextReject)return Promise.reject(Error('synthetic new context'));return Promise.resolve(created);
  }};
  const library={get request(){trace.push(['request-library']);if(options.libraryThrow)throw Error('synthetic request library');return request;}};
  const filter=name=>{trace.push(['filter',name]);if(options.filterThrow)throw Error('synthetic filter');return name==='fixture-exclude';};
  try{
    const value=await fixture(native,id,{library,filter}).call(actor);
    if(id==='f1625')assert.equal(value,options.existing?existing:created);
    return{value:id==='f1625'?value.synthetic:value,context:actor[field]?.synthetic,trace};
  }catch(error){return{error:error.name,context:actor[field]?.synthetic,trace};}
}
const cases={success:{},existing:{existing:true},filter:{filter:true},noUa:{hints:{ua:''}},nullHints:{hints:null},
  proxy:{proxy:{server:'http://fixture.invalid:8080',username:'fixture-user',password:'fixture-password'}},emptyProxyFields:{proxy:{server:'http://fixture.invalid',username:'',password:''}},emptyProxy:{proxy:{}},
  proxyReads:{proxy:{server:'http://fixture.invalid'},proxyGetter:true},cookiesRejected:{cookiesReject:true},cookiesThrow:{cookiesThrow:true},contextThrow:{contextThrow:true},
  hintsThrow:{hintsThrow:true},newContextThrow:{newContextThrow:true},newContextReject:{newContextReject:true},libraryThrow:{libraryThrow:true},
  filterThrow:{filter:true,filterThrow:true},nullCookies:{cookies:null},nullFilteredCookie:{cookies:[null],filter:true},logThrow:{logThrow:true}};
for(const id of ['f1619','f1625'])for(const[name,options]of Object.entries(cases))test('gateway context arming matches recovered '+id+': '+name,async()=>assert.deepEqual(await run(true,id,options),await run(false,id,options)));
test('direct context recovers rejected cookie read while survivor reports failure',async()=>{
  const direct=await run(true,'f1625',{cookiesReject:true});assert.equal(direct.value,'new-context');assert.deepEqual(direct.trace.find(row=>row[0]==='new-context')[1],{storageState:{cookies:[],origins:[]}});
  const survivor=await run(true,'f1619',{cookiesReject:true});assert.equal(survivor.value,false);assert.equal(survivor.trace.some(row=>row[0]==='new-context'),false);
});
test('gateway proxy/request setters retain references and do not coerce values',()=>{
  for(const id of ['f1617','f1618','f1624'])for(const value of [null,false,'fixture',{},()=>{}]){
    const before={},after={},callback=()=>{};assert.equal(fixture(true,id).call(after,value,callback),fixture(false,id).call(before,value,callback));assert.deepEqual(after,before);
    assert.equal(after[id==='f1617'?'proxiedReq':id==='f1618'?'survivorProxy':'proxyActive'],value);
  }
});
test('gateway sleep passes the exact duration and preserves timer failure semantics',async()=>{
  for(const duration of [undefined,null,0,-1,1234,'fixture-duration'])for(const throws of [false,true]){
    async function runTimer(native){const calls=[],timers={setTimeout(fn,ms){assert.equal(this,undefined);calls.push(ms);if(throws)throw Error('synthetic timer');queueMicrotask(fn);}};
      try{return{value:await fixture(native,'f1628',{timers}).call({},duration),calls};}catch(error){return{error:error.name,calls};}}
    assert.deepEqual(await runTimer(true),await runTimer(false));
  }
});
test('parallel survivor arming keeps each actor cookie snapshot and context separate',async()=>{
  const [first,second]=await Promise.all([run(true,'f1619',{cookies:[{name:'fixture-first',value:'first'}]}),run(true,'f1619',{cookies:[{name:'fixture-second',value:'second'}]})]);
  assert.equal(first.value,true);assert.equal(second.value,true);
  assert.deepEqual(first.trace.find(row=>row[0]==='new-context')[1].storageState.cookies,[{name:'fixture-first',value:'first'}]);
  assert.deepEqual(second.trace.find(row=>row[0]==='new-context')[1].storageState.cookies,[{name:'fixture-second',value:'second'}]);
});

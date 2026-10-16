'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
async function run(native,options={}){
  const trace=[],failure=new Error(options.closed?'Target closed':'synthetic network failure');
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{URL,String,Error}}),root=engine.context(791,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[139]=engine.makeFunction('f152',root);
  root[790]=function(host){assert.equal(this,undefined);trace.push(['tls-eligible',host]);return options.tlsEligible!==false;};
  root[136]=function(error){assert.equal(this,undefined);assert.equal(error,failure);trace.push(['network-eligible']);return options.networkEligible!==false;};
  root[135]=function(host){assert.equal(this,undefined);trace.push(['fallback-eligible',host]);return options.fallbackEligible!==false;};
  const context={synthetic:'browser-context'};
  root[468]=function(value){assert.equal(this,undefined);assert.equal(value,context);trace.push(['prepare']);if(options.prepareThrow)throw Error('synthetic prepare');if(options.prepareReject)return Promise.reject(Error('synthetic prepare'));return Promise.resolve();};
  const captured=engine.context(19,root);
  captured[18]=options.configHole?engine.HOLE:{get FALLBACK_AFTER(){trace.push(['threshold']);return options.threshold??3;}};
  const responses=Object.fromEntries(['base','replacement','proxied','direct','survivor','tls'].map(route=>[route,{route}]));
  function transport(route){
    const target={};
    for(const method of ['get','post'])target[method]=function(url,settings){
      assert.equal(this,target);trace.push(['request',route,method,url,settings]);
      if((route==='base'||route==='proxied')&&options.fail){if(options.syncFailure)throw failure;return Promise.reject(failure);}
      if(options.directFailure&&route==='direct')return Promise.reject(Error('synthetic direct'));
      if(options.survivorFailure&&route==='survivor')return Promise.reject(Error('synthetic survivor'));
      return Promise.resolve(responses[route]);
    };
    return target;
  }
  const base=transport('base'),direct=transport('direct');
  const actor={stripF5:!!options.strip,browserGone:!!options.browserGone,webTlsGateway:!!options.tls,proxyActive:!!options.proxy,
    directHosts:new Set(options.direct?['example.invalid']:[]),failStreak:new Map(options.initialFailures?[['example.invalid',options.initialFailures]]:[]),
    page:{get request(){trace.push(['snapshot']);return base;},context(){trace.push(['context']);if(options.contextThrow)throw Error('synthetic context');return context;}},
    async directContext(){trace.push(['direct-context']);if(options.directContextThrow)throw Error('synthetic direct context');return direct;},
    async sendViaWebTlsGateway(...args){trace.push(['tls',...args]);if(options.tlsFailure)throw Error('synthetic tls');return responses.tls;},
    logSetCookies(host,url,response){trace.push(['cookies',host,url,response.route]);if(options.cookieLogThrow)throw Error('synthetic cookie log');},
    async record(method,url,settings,response,error){trace.push(['record',method,url,settings,response?.route??null,error?.message]);if(options.recordFailure==='all'||(options.recordFailure==='tls'&&method.endsWith('*+tls')))throw Error('synthetic record');},
    onFallback(host){assert.equal(this,actor);trace.push(['fallback',host]);if(options.fallbackThrow)throw Error('synthetic fallback');},
    log(...args){trace.push(['log',...args]);if(options.logThrow)throw Error('synthetic log');},
  };
  if(options.proxied)actor.proxiedReq=transport('proxied');
  if(options.survivor)actor.survivorReq=transport('survivor');
  if(options.noFallback)delete actor.onFallback;
  let input=options.input===undefined?{headers:{fixture:'value'}}:options.input;
  if(options.timeoutGetter){let reads=0;input={get timeout(){reads++;trace.push(['timeout-read',reads]);return reads===1?10:20;}};}
  const result=[];
  try{
    const request=engine.makeFunction('f1652',captured).call(actor);assert.deepEqual(Object.keys(request),['get','post']);
    if(options.replaceAfterSnapshot)actor.proxiedReq=transport('replacement');
    const method=options.method??'get',url=options.url??'https://EXAMPLE.invalid/path';
    for(let i=0;i<(options.calls??1);i++){
      try{const value=await request[method].call({synthetic:'unrelated-this'},url,input);assert.equal(value,responses[value.route]);result.push({route:value.route});}
      catch(error){result.push({error:error.name,sameFailure:error===failure});}
    }
    return{result,trace,directHosts:[...actor.directHosts],failStreak:[...actor.failStreak],browserGone:actor.browserGone};
  }catch(error){return{error:error.name,trace};}
}
const cases={normal:{},post:{method:'post'},strip:{strip:true},stripRejected:{strip:true,prepareReject:true},stripThrows:{strip:true,prepareThrow:true},
  contextThrows:{strip:true,contextThrow:true},proxied:{proxied:true,strip:true},snapshot:{replaceAfterSnapshot:true},direct:{direct:true},directPost:{direct:true,method:'post'},
  survivor:{browserGone:true,survivor:true},browserGoneNoSurvivor:{browserGone:true},closedMidCall:{closed:true,fail:true,survivor:true,calls:2},closedNoSurvivor:{closed:true,fail:true},
  tls:{tls:true},tlsIneligible:{tls:true,tlsEligible:false},tlsFailure:{tls:true,tlsFailure:true},tlsRecordFailure:{tls:true,recordFailure:'tls'},tlsBrowserGone:{tls:true,browserGone:true},
  normalFailure:{fail:true},syncFailure:{fail:true,syncFailure:true},proxyUnderThreshold:{fail:true,proxy:true},proxyThreshold:{fail:true,proxy:true,calls:4},
  proxyInitialThreshold:{fail:true,proxy:true,initialFailures:2},proxyNotNetwork:{fail:true,proxy:true,networkEligible:false},proxyWrongHost:{fail:true,proxy:true,fallbackEligible:false},
  callbackMissing:{fail:true,proxy:true,threshold:1,noFallback:true},callbackThrows:{fail:true,proxy:true,threshold:1,fallbackThrow:true},configHole:{fail:true,proxy:true,configHole:true},
  directContextFailure:{direct:true,directContextThrow:true},directFailure:{direct:true,directFailure:true},survivorFailure:{browserGone:true,survivor:true,survivorFailure:true},
  recordFailure:{recordFailure:'all'},cookieLogFailure:{cookieLogThrow:true},logFailure:{tls:true,tlsFailure:true,logThrow:true},
  resetFailures:{initialFailures:2},zeroTimeout:{input:{timeout:0}},nullTimeout:{input:{timeout:null}},falseTimeout:{input:{timeout:false}},
  nullInput:{input:null},stringInput:{input:'xy'},timeoutGetter:{timeoutGetter:true},invalidUrl:{url:'invalid relative URL'},
};
for(const[name,options]of Object.entries(cases))test('gateway request routing matches recovered policy/order: '+name,async()=>assert.deepEqual(await run(true,options),await run(false,options)));
test('gateway routing retains captured raw request and requires configured fallback threshold',async()=>{
  const snapshot=await run(true,{replaceAfterSnapshot:true});assert.equal(snapshot.result[0].route,'base');
  const fallback=await run(true,{fail:true,proxy:true,calls:4});assert.deepEqual(fallback.result.map(value=>value.route??value.error),['Error','Error','direct','direct']);
  assert.equal(fallback.trace.filter(row=>row[0]==='fallback').length,1);assert.deepEqual(fallback.directHosts,['example.invalid']);
  const blocked=await run(true,{fail:true,proxy:true,fallbackEligible:false,calls:4});assert.equal(blocked.directHosts.length,0);assert.equal(blocked.trace.some(row=>row[0]==='direct-context'),false);
});
test('browser-close continuation uses survivor without triggering direct-host fallback',async()=>{
  const result=await run(true,{closed:true,fail:true,survivor:true,proxy:true,calls:2});assert.equal(result.browserGone,true);
  assert.deepEqual(result.result.map(value=>value.route),['survivor','survivor']);assert.deepEqual(result.directHosts,[]);
});

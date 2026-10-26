'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const {createCompiledRuntime}=require('../src/main/runtime/compiled-runtime.cjs');
const definitions=require('../src/main/generated/index.cjs');
const {webBookingUpgrades}=require('../src/main/runtime/web-booking-upgrades.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));

function fixture(compiled,options={}) {
  const trace=[],failure=Error('offline proxy connection refused');
  const functionFactories=webBookingUpgrades();
  const engine=compiled?createCompiledRuntime({functionFactories}):createEngine(definitions,{functionFactories});
  const root=engine.context(1842,null);
  root[5]=root[1841]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined);return table[n+'|'+key];};
  root[247]=()=>false;root[561]=s=>s;root[133]='';
  root[468]=async()=>{};root[790]=()=>false;root[139]=e=>/closed/i.test(e.message);root[136]=e=>e===failure;
  root[394]=()=>['paytm'];root[393]=()=>10;root[387]=()=>({bankId:10});root[362]=()=>'/bookingInitPayment';
  root[395]=()=>false;root[396]=()=>'';root[940]=()=>({success:false,stopped:true});
  const proxied={async get(){trace.push('proxy-request');if(options.proxyNetworkFailure)throw failure;return{route:'proxy'};}};
  let disposed=false;
  proxied.dispose=async()=>{disposed=true;};
  root[15]={request:{async newContext(config){trace.push(['new-context',config.proxy]);if(options.setupFailure)throw failure;return proxied;}}};
  const captured=engine.context(19,root);captured[18]={REPORT_AFTER:1};
  const gateway={
    page:{request:{async get(){trace.push('base-request');return{route:'base'};}},context:()=>({})},
    proxyActive:true,failStreak:new Map(),directHosts:new Set(['gateway.invalid']),
    log(){},logSetCookies(){},async record(){},
    async directContext(){trace.push('DIRECT-FORBIDDEN');throw Error('direct connection forbidden');},
    onProxyFailure(){trace.push('proxy-health');},onFallback(){trace.push('legacy-health');},
  };
  // Exercise the unchanged compiled/interpreted setter as well as upgraded request getter.
  gateway.useProxiedRequest=engine.makeFunction('f1617',captured);
  const page={context:()=>({cookies:async()=>[{name:'session',value:'offline'}]}),evaluate:async()=>'offline-agent',waitForTimeout:async()=>{}};
  const actor={gateway,opts:{hideBrowser:false,onQrPrepare:()=>trace.push('qr-ready')},session:{provider:'gologin',page,
      proxy:options.noFormProxy?undefined:{server:'http://offline.invalid:8080'},vendorProxyMayBeActive:options.verifiedDirect?false:undefined},
    stopped:false,terminal:null,bankDetail:[{bankId:10}],log(){},onProgress(stage){trace.push(stage);},
    async safeCall(method,verb,url){assert.equal(url,'/bookingInitPayment');trace.push('booking-init');return{ok:true,status:200,body:{transationId:'offline-txn'}};},
    stopWith(message,settings){trace.push('stop');return{success:false,message,settings};},
    async dispatchGateway(){trace.push('dispatch');const request=engine.makeFunction('f1652',captured).call(gateway);
      if(options.proxyNetworkFailure){await assert.rejects(request.get('https://gateway.invalid/qr'),e=>e===failure);await assert.rejects(request.get('https://gateway.invalid/qr'),e=>e===failure);return{success:false,proxyFailed:true};}
      return{success:true,reply:await request.get('https://gateway.invalid/qr')};},
  };
  actor.routeGatewayThroughFormProxy=engine.makeFunction('f2052',captured);
  return{engine,captured,actor,gateway,trace,disposed:()=>disposed,run:()=>engine.makeFunction('f2172',captured).call(actor,{paymentMethod:'paytm'},'offline-txn',100,new Set())};
}

for(const compiled of [false,true]) {
  const mode=compiled?'compiled':'instruction';
  test(`${mode}: default adapters route payment through form proxy and never stale direct-host state`,async()=>{
    const f=fixture(compiled);const result=await f.run();assert.equal(result.success,true);assert.equal(result.reply.route,'proxy');
    assert.ok(f.trace.indexOf('qr-ready')<f.trace.indexOf('dispatch'));
    assert.equal(f.trace.includes('base-request'),false);assert.equal(f.trace.includes('DIRECT-FORBIDDEN'),false);
    assert.deepEqual(f.trace.find(Array.isArray)[1],{server:'http://offline.invalid:8080',username:undefined,password:undefined,bypass:''});
  });
  test(`${mode}: proxy setup failure stops before QR or gateway dispatch`,async()=>{
    const f=fixture(compiled,{setupFailure:true});const result=await f.run();assert.equal(result.success,false);assert.equal(result.settings.noRelaunch,true);
    for(const forbidden of ['qr-ready','dispatch','booking:pay-ready','proxy-request','base-request'])assert.equal(f.trace.includes(forbidden),false);
  });
  test(`${mode}: unverified attached profile needs an explicit form proxy`,async()=>{
    const f=fixture(compiled,{noFormProxy:true});const result=await f.run();assert.equal(result.success,false);assert.match(result.message,/profile may use its own proxy/);
    assert.equal(f.trace.includes('dispatch'),false);assert.equal(f.trace.some(Array.isArray),false);
  });
  test(`${mode}: explicit verified-direct profile remains supported`,async()=>{
    const f=fixture(compiled,{noFormProxy:true,verifiedDirect:true});const result=await f.run();assert.equal(result.success,true);assert.equal(result.reply.route,'base');
  });
  test(`${mode}: repeated proxy failure reports once without direct-IP fallback`,async()=>{
    const f=fixture(compiled,{proxyNetworkFailure:true});const result=await f.run();assert.equal(result.proxyFailed,true);
    assert.equal(f.trace.filter(x=>x==='proxy-request').length,2);assert.equal(f.trace.filter(x=>x==='proxy-health').length,1);
    assert.equal(f.trace.includes('legacy-health'),false);assert.equal(f.trace.includes('DIRECT-FORBIDDEN'),false);
  });
  test(`${mode}: browser-close settlement uses survivor after upgraded routing`,async()=>{
    const f=fixture(compiled);f.gateway.browserGone=true;f.gateway.survivorReq={async get(){return{route:'survivor'};}};
    const result=await f.run();assert.equal(result.reply.route,'survivor');assert.equal(f.trace.includes('DIRECT-FORBIDDEN'),false);
  });
}

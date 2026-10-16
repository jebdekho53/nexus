'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
function fixture(native,id,dependencies={}){
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies}):{},globals:{Error,String,Promise,setTimeout:dependencies.timers?.setTimeout}}),root=engine.context(140,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[139]=engine.makeFunction('f152',root);
  return engine.makeFunction(id,id==='f152'?root:engine.context(2,root));
}
test('closed-browser classifier matches recovered types, case and bounded patterns',()=>{
  const before=fixture(false,'f152'),after=fixture(true,'f152');
  for(const text of ['Request context disposed','request context disposed','Target page has been closed','Target context '+'.'.repeat(39)+'has been closed','Target closed','browser has been closed','Execution context was destroyed','Protocol error '+'.'.repeat(31)+'Session closed','Session closed','synthetic timeout',''])
    for(const value of [text,new Error(text),{message:text},null,undefined,42])assert.equal(after(value),before(value));
});
async function retry(native,options={}){
  const trace=[],failure=options.failure==='string'?'synthetic failure':options.failure==='null'?null:options.failure==='object'?{message:'synthetic failure'}:new Error(options.failure==='closed'?'Target closed':'synthetic failure');
  const timers={setTimeout(fn,ms){trace.push(['wait',ms]);queueMicrotask(fn);return 0;}};
  const fn=fixture(native,'f1756',{timers}),value={synthetic:true};let attempts=0,checks=0;
  const actor={log(...args){trace.push(['log',...args]);if(options.logThrows)throw Error('synthetic log');}};
  const stop=options.stop?()=>{checks++;trace.push(['stop',checks]);if(options.stop==='throw')throw Error('synthetic stop');return options.stop==='before'||(options.stop==='after'&&checks===2);}:undefined;
  const operation=()=>{attempts++;trace.push(['attempt',attempts]);if(attempts<=(options.failures??2)){if(options.syncThrow)throw failure;return Promise.reject(failure);}return Promise.resolve(value);};
  try{const result=await fn.call(actor,'synthetic-op',operation,options.limit,stop);assert.equal(result,value);return{ok:true,trace};}
  catch(error){return{error:error.name,message:error.message,sameFailure:error===failure,trace};}
}
const retryCases={eventualSuccess:{},immediateSuccess:{failures:0},syncFailure:{syncThrow:true},exhausted:{failures:10},
  closed:{failure:'closed'},stringError:{failure:'string',failures:10},nullError:{failure:'null',failures:10},objectError:{failure:'object',failures:10},
  stopBefore:{stop:'before'},stopAfter:{stop:'after'},stopThrows:{stop:'throw'},logThrows:{logThrows:true},stopDoesNotBlockSuccess:{stop:'before',failures:0}};
for(const[name,limit]of Object.entries({one:1,two:2,four:4,zero:0,negative:-1,null:null,nan:NaN,string:'3',fraction:2.5}))retryCases['limit-'+name]={limit,failures:10};
for(const[name,options]of Object.entries(retryCases))test('gateway retry matches actual recovered behavior: '+name,async()=>assert.deepEqual(await retry(true,options),await retry(false,options)));
test('gateway retry stops for closed browser and retains the 800/1600ms backoff',async()=>{
  const success=await retry(true);assert.deepEqual(success.trace.filter(row=>row[0]==='wait'),[['wait',800],['wait',1600]]);
  const closed=await retry(true,{failure:'closed'});assert.equal(closed.trace.filter(row=>row[0]==='attempt').length,1);assert.equal(closed.trace.filter(row=>row[0]==='wait').length,0);
  assert.equal(closed.sameFailure,true);assert.equal((await retry(true,{failures:10})).sameFailure,true);
});
async function headers(native,options={}){
  const trace=[],hints={lang:'en-IN',ua:'fixture-browser-ua',secChUa:'fixture-client-hints',mobile:'?0',platform:'fixture-platform',...options.hints};
  const actor={
    async clientHints(){trace.push(['client-hints']);if(options.clientThrows)throw Error('synthetic hints');return hints;},
    originFor(host){trace.push(['origin',host]);if(options.originThrows)throw Error('synthetic origin');if(options.missingOrigin)return undefined;return{origin:'https://example.invalid',referer:'https://example.invalid/',sameSite:options.sameSite??true};},
    async gatewayHints(){trace.push(['gateway-hints']);if(options.gatewayThrows)throw Error('synthetic gateway hints');return options.gateway===null?null:{ua:'fixture-gateway-ua',mobile:'?1',platform:'fixture-gateway-platform',...options.gateway};},
  };
  try{return{value:await fixture(native,'f1666').call(actor,options.host??'wps',options.settings),trace};}
  catch(error){return{error:error.name,trace};}
}
const headerCases={default:{},crossSite:{sameSite:false},gateway:{host:'qr'},noGatewayHints:{host:'qr',gateway:null},
  navigate:{settings:{navigate:true}},navigateNoHtml:{settings:{navigate:true,htmlAccept:false}},nullOptions:{settings:null},
  emptyReferer:{settings:{referer:''}},nullReferer:{settings:{referer:null}},noOrigin:{settings:{omitOrigin:true}},emptyOrigin:{settings:{origin:''}},
  emptySite:{settings:{secFetchSite:''}},noHints:{settings:{noHints:true}},emptyClientUa:{hints:{ua:'',secChUa:''}},
  explicitUa:{host:'qr',settings:{ua:'fixture-explicit-ua'}},emptyExplicitUa:{host:'qr',settings:{ua:''}},
  gatewayNullValues:{host:'qr',gateway:{ua:'',mobile:null,platform:null}},gatewayFalseValues:{host:'qr',gateway:{mobile:false,platform:''}},
  extraOverrides:{settings:{extra:{Referer:'fixture-overridden','sec-fetch-mode':'fixture-mode',Origin:undefined}}},stringExtra:{settings:{extra:'xy'}},
  clientFailure:{clientThrows:true},originFailure:{originThrows:true},gatewayFailure:{host:'qr',gatewayThrows:true},unknownOrigin:{missingOrigin:true},
};
for(const[name,options]of Object.entries(headerCases))test('gateway headers match recovered merge and precedence: '+name,async()=>assert.deepEqual(await headers(true,options),await headers(false,options)));
test('gateway headers retain captured browser hints and omit origin only when requested',async()=>{
  const result=await headers(true,{host:'qr',settings:{omitOrigin:true,extra:{Authorization:'fixture-token'}}});
  assert.equal(result.value.Origin,undefined);assert.equal(result.value['User-Agent'],'fixture-gateway-ua');assert.equal(result.value['sec-ch-ua'],'fixture-client-hints');
  assert.deepEqual(result.trace,[['client-hints'],['origin','qr'],['gateway-hints']]);
});

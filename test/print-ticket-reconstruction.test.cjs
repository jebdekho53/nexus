'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
async function run(native,options={}){
  const trace=[],booking=options.booking===undefined?{pnr:'synthetic-pnr'}:options.booking;
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{}}),root=engine.context(6,null);
  const table=Object.assign({},...Object.values(strings));root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  let returnedDetail;
  const actor={
    opts:{gatewayHosts:{wps:'https://example.invalid'}},api:{currentCsrf:'fixture-current-csrf'},
    tok(){trace.push(['tokens']);if(options.tokens==='throw')throw Error('synthetic tokens');return{accessToken:'fixture-access',greq:'fixture-greq',bmiyek:'fixture-bmiyek'};},
    spaCsrf(){trace.push(['csrf-fallback']);return 'fixture-fallback-csrf';},
    gateway:{printTicket(value){trace.push(['request',value]);
      if(options.result==='throw')throw Error('synthetic print');
      if(options.result==='reject')return Promise.reject(Error('synthetic print'));
      if(options.result==='rejectNull')return Promise.reject(null);
      if(options.result==='nonPromise')return {synthetic:true};
      returnedDetail=options.result==='array'?[]:options.result==='null'?null:options.result==='string'?'synthetic text':options.result==='number'?42:{synthetic:true};
      return Promise.resolve(returnedDetail);
    }},
    log(...args){trace.push(['log',...args]);if(options.log==='throw')throw Error('synthetic log');},
  };
  if(options.noGateway)delete actor.gateway;
  if(options.noHosts)delete actor.opts.gatewayHosts;
  if(options.noWps)delete actor.opts.gatewayHosts.wps;
  if(options.noApi)delete actor.api;
  if(options.emptyCsrf)actor.api.currentCsrf='';
  try{
    const value=await engine.makeFunction('f2247',engine.context(2,root)).call(actor,booking);
    if(returnedDetail&&typeof returnedDetail==='object')assert.equal(booking.printDetail,returnedDetail,'Print detail retains provider object reference');
    return {value,booking,trace};
  }catch(error){return{error:error.name,booking,trace};}
}
for(const[name,options]of Object.entries({object:{},array:{result:'array'},null:{result:'null'},string:{result:'string'},number:{result:'number'},
  reject:{result:'reject'},throw:{result:'throw'},nullRejection:{result:'rejectNull'},nonPromise:{result:'nonPromise'},
  noGateway:{noGateway:true},noHosts:{noHosts:true},noWps:{noWps:true},noPnr:{booking:{}},nullBooking:{booking:null},
  noApi:{noApi:true},emptyCsrf:{emptyCsrf:true},tokenFailure:{tokens:'throw'},logFailure:{log:'throw'},
}))test('print-ticket attachment matches recovered behavior: '+name,async()=>{
  assert.deepEqual(await run(true,structuredClone(options)),await run(false,structuredClone(options)));
});
test('print-ticket transport is gated before session access and uses one token snapshot',async()=>{
  assert.deepEqual((await run(true,{noWps:true})).trace,[]);
  const result=await run(true,{noApi:true});
  assert.deepEqual(result.trace.slice(0,2),[['tokens'],['csrf-fallback']]);
  assert.equal(result.trace.filter(row=>row[0]==='request').length,1);
  assert.equal(result.trace[2][1].spaCsrf,'fixture-fallback-csrf');
});

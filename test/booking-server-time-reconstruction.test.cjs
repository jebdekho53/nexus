'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');

function actorFor(options={}) {
  const trace=[];let clock=options.clock??1760000000000;
  const actor={
    timeOffset:options.timeOffset??0,opts:{serverTimeSync:options.sync!==false},
    session:{tokens:options.noTokens?undefined:{serverTimeOffsetMs:options.captured}},
    now(){trace.push(['now']);clock+=options.tick??0;return clock;},
    log(...args){trace.push(['log',...args]);},
    api:options.noApi?undefined:{call(method,path){trace.push(['call',method,path]);if(options.callThrows)throw Error('synthetic call');return options.callRejects?Promise.reject(Error('synthetic rejection')):Promise.resolve(options.response);}},
  };
  return{actor,trace};
}
const slots={936:'f2377',937:'f2379',345:'/base/path'};
const wrap=(options,run)=>compare(async native=>{
  const{method}=harness({native,slots}),{actor,trace}=actorFor(options);
  const value=await outcome(async()=>run(method,actor));
  return{value,trace,offset:actor.timeOffset,token:actor.session.tokens?.serverTimeOffsetMs};
});

for(const[name,options]of Object.entries({tokenOffset:{captured:5000,timeOffset:100},fallbackOffset:{timeOffset:250},nonNumeric:{captured:'5',timeOffset:7},nan:{captured:NaN,timeOffset:9},infinity:{captured:Infinity,timeOffset:9},negative:{captured:-1500},noTokens:{noTokens:true,timeOffset:42}}))
  test('serverNow matches recovered offset selection: '+name,()=>wrap(options,(method,actor)=>method('f2272').call(actor)));

const stamps=['2026-10-16 10:00:00','2026-10-16T10:00:00+05:30',undefined,null,'garbage','2026-10-16 10:00:00.5','2026-10-17 10:00:00'];
for(const stamp of stamps)
  for(const[name,options]of Object.entries({plain:{timeOffset:10,tick:0},tokens:{timeOffset:-500,captured:3},noTokens:{noTokens:true},rtt:{tick:40}}))
    test('applyServerTimeStamp matches recovered acceptance rules: '+String(stamp)+' / '+name,()=>wrap({...options,clock:Date.parse('2026-10-16T04:30:00Z')},(method,actor)=>
      method('f2274').call(actor,stamp,actor.now(),actor.now()+120,name==='plain'?undefined:'custom')));

for(const[name,options]of Object.entries({
  off:{sync:false},timestamp:{response:{body:{timeStamp:'2026-10-16 10:00:00'}}},dataTimestamp:{response:{body:{data:{timeStamp:'2026-10-16 10:00:00'}}}},both:{response:{body:{timeStamp:'2026-10-16 10:00:00',data:{timeStamp:'x'}}}},
  noResponse:{response:undefined},noBody:{response:{}},nullBody:{response:{body:null}},rejects:{callRejects:true},throws:{callThrows:true},badStamp:{response:{body:{timeStamp:'bad'}}},tick:{tick:30,response:{body:{timeStamp:'2026-10-16 10:00:00'}}},
}))test('syncServerTime matches recovered keepalive sync: '+name,()=>wrap({...options,clock:Date.parse('2026-10-16T04:30:00Z')},(method,actor)=>{
  actor.applyServerTimeStamp=function(...args){assert.equal(this,actor);actor.__calls=[...(actor.__calls??[]),args];return true;};
  return method('f2276').call(actor).then(value=>({value,calls:actor.__calls}));
}));

for(const[name,options]of Object.entries({
  captured:{captured:1234},capturedNegative:{captured:-1234},capturedNaN:{captured:NaN,response:{body:{timeStamp:'2026-10-16 10:00:00'}}},noApi:{noApi:true},
  fetched:{response:{body:{timeStamp:'2026-10-16 10:00:00'}}},unavailable:{response:{body:{}}},rejected:{callRejects:true},thrown:{callThrows:true},nullResponse:{response:null},tick:{tick:25,response:{body:{timeStamp:'2026-10-16 10:00:00'}}},
}))test('ensureServerTimeSynced matches recovered first sync: '+name,()=>wrap({...options,clock:Date.parse('2026-10-16T04:30:00Z')},async(method,actor)=>{
  const real=actor.applyServerTimeStamp;
  actor.applyServerTimeStamp=function(...args){actor.__calls=[...(actor.__calls??[]),args];return !!options.response?.body?.timeStamp;};
  return method('f2278').call(actor).then(value=>({value,calls:actor.__calls}));
}));

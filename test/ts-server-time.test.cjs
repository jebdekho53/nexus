'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const legacy=require('./fixtures/legacy/server-time.legacy.cjs');
const migrated=require('../src/main/booking/server-time.cjs');
const {parseServerTimestamp,formatIstClock}=require('../src/main/booking/time-helpers.cjs');

// src/ts/main/booking/server-time.ts versus the previous JavaScript (kept as a fixture): same scripted run,
// results, state mutations, log order and API calls are compared.
const makeActor=({tokens,timeOffset=0,serverTimeSync=true,api,clock=[1000,1200,1400,1600]}={})=>{
  const trace=[];
  const times=[...clock];
  const actor={
    timeOffset,session:{tokens:tokens===undefined||tokens===null?tokens:structuredClone(tokens)},opts:{serverTimeSync},
    now(){const value=times.length?times.shift():9999;trace.push(['now',value]);return value;},
    log(category,message,level){trace.push(['log',category,message,level]);},
  };
  actor.serverNow=function(){return module_.serverNow(this);};
  actor.applyServerTimeStamp=function(stamp,t0,t1,label){trace.push(['apply',stamp,t0,t1,label]);return module_.applyServerTimeStamp(this,stamp,t0,t1,label,deps);};
  if(api!==undefined)actor.api=api;
  return{actor,trace};
};
let module_=legacy;
const deps={parseStamp:parseServerTimestamp,formatClock:formatIstClock};
const apiOf=(trace,behaviour)=>({call(method,path){trace.push(['api',method,path]);return behaviour(method,path);}});

async function scenario(target,build,run) {
  module_=target;
  const built=build();
  const actor=built.actor;
  let result,error;
  try{result=await run(actor,target);}catch(e){error=e.constructor.name;}
  return{result,error,trace:built.trace,timeOffset:actor.timeOffset,tokens:actor.session.tokens&&JSON.parse(JSON.stringify(actor.session.tokens))};
}
async function same(name,build,run) {
  const expected=await scenario(legacy,build,run);
  const actual=await scenario(migrated,build,run);
  assert.deepEqual(actual,expected,name);
  return actual;
}
const withApi=(behaviour,options={})=>()=>{const built=makeActor({...options,api:{}});built.actor.api=apiOf(built.trace,behaviour);return built;};

test('serverNow prefers the captured offset and ignores non-finite values',async()=>{
  for(const tokens of[undefined,null,{},{serverTimeOffsetMs:250},{serverTimeOffsetMs:-90},{serverTimeOffsetMs:0},{serverTimeOffsetMs:'250'},{serverTimeOffsetMs:NaN},{serverTimeOffsetMs:Infinity},{serverTimeOffsetMs:null}])
    await same('serverNow '+JSON.stringify(tokens),()=>makeActor({tokens,timeOffset:77}),actor=>module_.serverNow(actor));
  const{actor}=makeActor({tokens:{serverTimeOffsetMs:0},timeOffset:77});
  assert.equal(migrated.serverNow(actor),1000);
});

test('applyServerTimeStamp accepts plausible offsets and rejects bad ones',async()=>{
  const server=text=>text;
  const stamps=['2024-05-01 10:00:00.250','2024-05-01 10:00:00','garbage','',undefined,null,12];
  const local=Date.UTC(2024,4,1,4,30,0);
  for(const stamp of stamps)for(const label of[undefined,'','custom'])for(const tokens of[undefined,{},{serverTimeOffsetMs:5}])
    await same('apply '+stamp+'|'+label+'|'+JSON.stringify(tokens),()=>makeActor({tokens,timeOffset:12.4}),(actor)=>module_.applyServerTimeStamp(actor,stamp,local-100,local+300,label,deps));
  // offsets of an hour or more are refused and the previous estimate is kept
  const wrong=await same('wrong machine date',()=>makeActor({tokens:{},timeOffset:5}),actor=>module_.applyServerTimeStamp(actor,'2024-05-01 12:00:00',local,local+200,'x',deps));
  assert.equal(wrong.result,false);
  assert.equal(wrong.timeOffset,5);
  assert.deepEqual(wrong.tokens,{});
  assert.equal(wrong.trace.filter(item=>item[0]==='log')[0][3],'warn');
  const hour=Date.UTC(2024,4,1,5,0,0);
  const edge=await same('exactly one hour',()=>makeActor({tokens:{},timeOffset:5}),actor=>module_.applyServerTimeStamp(actor,'2024-05-01 11:30:00',hour,hour,'x',deps));
  assert.equal(edge.result,false);
  const below=await same('one millisecond under an hour',()=>makeActor({tokens:{},timeOffset:5}),actor=>module_.applyServerTimeStamp(actor,'2024-05-01 11:29:59.999',hour,hour,'x',deps));
  assert.equal(below.result,true);
  const ok=await same('accepted',()=>makeActor({tokens:{},timeOffset:5}),actor=>module_.applyServerTimeStamp(actor,'2024-05-01 10:00:00.250',local-100,local+300,'x',deps));
  assert.equal(ok.result,true);
  assert.equal(ok.tokens.serverTimeOffsetMs,ok.timeOffset);
});

test('syncServerTime does nothing unless sync is enabled',async()=>{
  for(const serverTimeSync of[false,undefined,0,'',null])
    await same('disabled '+String(serverTimeSync),withApi(()=>Promise.resolve({body:{timeStamp:'2024-05-01 10:00:00'}}),{serverTimeSync,tokens:{}}),actor=>module_.syncServerTime(actor,{basePath:()=>'/base'}));
});

test('syncServerTime reads the timestamp from the body or body.data',async()=>{
  const bodies=[{timeStamp:'2024-05-01 10:00:00'},{data:{timeStamp:'2024-05-01 10:00:00'}},{timeStamp:'bad',data:{timeStamp:'2024-05-01 10:00:00'}},{timeStamp:null,data:{timeStamp:'2024-05-01 10:00:00'}},{timeStamp:'',data:{timeStamp:'2024-05-01 10:00:00'}},{},{data:null},null,undefined];
  for(const body of bodies)
    await same('sync '+JSON.stringify(body),withApi(()=>Promise.resolve(body===undefined?undefined:{body}),{tokens:{},clock:[Date.parse('2024-05-01T04:29:59.900Z'),Date.parse('2024-05-01T04:30:00.100Z'),0,0]}),actor=>module_.syncServerTime(actor,{basePath:()=>'/base'}));
  await same('response without a body',withApi(()=>Promise.resolve({}),{tokens:{}}),actor=>module_.syncServerTime(actor,{basePath:()=>'/base'}));
  await same('null response',withApi(()=>Promise.resolve(null),{tokens:{}}),actor=>module_.syncServerTime(actor,{basePath:()=>'/base'}));
});

test('syncServerTime swallows API failures and keeps request order',async()=>{
  const result=await same('rejected',withApi(()=>Promise.reject(new Error('network')),{tokens:{}}),actor=>module_.syncServerTime(actor,{basePath:()=>'/base'}));
  assert.deepEqual(result.trace.filter(item=>item[0]==='api'),[['api','GET','/base/recentTxnsDetails']]);
  assert.equal(result.result,undefined);
  const order=result.trace.map(item=>item[0]);
  assert.deepEqual(order.slice(0,4),['now','api','now','apply']);
  await same('throws synchronously',withApi(()=>{throw new Error('sync');},{tokens:{}}),actor=>module_.syncServerTime(actor,{basePath:()=>'/base'}));
  await same('basePath throws',withApi(()=>Promise.resolve({}),{tokens:{}}),actor=>module_.syncServerTime(actor,{basePath:()=>{throw new Error('no base');}}));
  await same('no api client',()=>makeActor({tokens:{}}),actor=>module_.syncServerTime(actor,{basePath:()=>'/base'}));
});

test('ensureServerTimeSynced uses the captured offset when present',async()=>{
  for(const tokens of[{serverTimeOffsetMs:300},{serverTimeOffsetMs:-300},{serverTimeOffsetMs:0}]) {
    const result=await same('captured '+JSON.stringify(tokens),withApi(()=>Promise.resolve({body:{timeStamp:'2024-05-01 10:00:00'}}),{tokens}),actor=>module_.ensureServerTimeSynced(actor,{basePath:()=>'/base',formatClock:formatIstClock}));
    assert.equal(result.trace.some(item=>item[0]==='api'),false);
    assert.equal(result.trace.filter(item=>item[0]==='log').length,1);
  }
});

test('ensureServerTimeSynced falls back to fetchJourneyDetails and then to the local clock',async()=>{
  const local=Date.parse('2024-05-01T04:30:00.000Z');
  const cases={
    good:{body:{timeStamp:'2024-05-01 10:00:00.050'}},bad:{body:{timeStamp:'junk'}},missing:{body:{}},noBody:{},nullResponse:null,
    wrongDate:{body:{timeStamp:'2024-05-01 18:00:00'}},dataOnly:{body:{data:{timeStamp:'2024-05-01 10:00:00'}}},
  };
  for(const[name,response]of Object.entries(cases)) {
    const result=await same('fallback '+name,withApi(()=>Promise.resolve(response),{tokens:{},clock:[local-50,local+50,0,0,0]}),actor=>module_.ensureServerTimeSynced(actor,{basePath:()=>'/base',formatClock:formatIstClock}));
    assert.deepEqual(result.trace.filter(item=>item[0]==='api'),[['api','GET','/base/fetchJourneyDetails']]);
  }
  await same('rejected',withApi(()=>Promise.reject(new Error('network')),{tokens:{}}),actor=>module_.ensureServerTimeSynced(actor,{basePath:()=>'/base',formatClock:formatIstClock}));
  await same('no tokens object',withApi(()=>Promise.resolve({body:{timeStamp:'2024-05-01 10:00:00'}}),{tokens:undefined}),actor=>module_.ensureServerTimeSynced(actor,{basePath:()=>'/base',formatClock:formatIstClock}));
  const none=await same('no api',()=>makeActor({tokens:{}}),actor=>module_.ensureServerTimeSynced(actor,{basePath:()=>'/base',formatClock:formatIstClock}));
  assert.equal(none.trace.length,0);
});

test('log level is warn only on failures',async()=>{
  const failed=await same('level',withApi(()=>Promise.resolve({body:{timeStamp:'junk'}}),{tokens:{}}),actor=>module_.ensureServerTimeSynced(actor,{basePath:()=>'/base',formatClock:formatIstClock}));
  assert.deepEqual(failed.trace.filter(item=>item[0]==='log').map(item=>item[3]),['warn','warn']);
});

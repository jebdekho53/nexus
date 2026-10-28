'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {safeCall}=require('../src/main/booking/safe-call.cjs');
const {summary}=require('../src/main/runtime/api-diagnostics.cjs');

test('network, CSRF, access denied, expired session and provider high load stay distinct in diagnostics',async()=>{
  for(const [kind,status,category,reason]of [
    ['network',null,'network','network'],['csrf',409,'csrf','csrf-mismatch'],
    ['forbidden',403,'terminal','access-denied'],['expired',401,'terminal','session-expired'],['expired-body',200,'terminal','session-expired'],
    ['highload',510,'highload','provider-highload'],['busy',200,'retry','provider-busy'],
  ]){
    let time=0,calls=0,refreshes=0;const rows=[],owners=[],progress=[],waits=[];
    const actor={opts:{},session:{tokens:{},page:{isClosed:()=>false,waitForTimeout:async ms=>waits.push(ms)}},
      log(){},onProgress:(stage,message)=>progress.push({stage,message}),
      refreshCsrfFromSpa:async()=>{refreshes++;},
      api:{call:async()=>{time+=125;calls++;if(calls>1)return{ok:true,status:200,body:{}};if(kind==='network')throw Error('PRIVATE network detail');return{status,body:kind.startsWith('expired')?{error:'invalid access token'}:{error:'PRIVATE'}};},resyncCsrf(){}},
    };
    const deps={clock:()=>time,sleep:async ms=>waits.push(ms),random:()=>0,highloadText:'Provider High Load',ipBlockedMessage:'denied',describeFailure:()=> 'Session expired',
      classifyResponse:()=>calls===1?category:'ok',onResponse:(row,owner)=>{owners.push(owner);rows.push(summary(row));}};
    const result=await safeCall(actor,'api','POST','/mapps1/allLapAvlFareEnq/Y?token=PRIVATE',{password:'PRIVATE'},{max510:60,boundedRetry:2},deps);
    assert.equal(rows[0].reason,reason);assert.equal(rows[0].durationMs,125);assert.equal(rows[0].attempt,1);assert.equal(rows[0].endpoint,'allLapAvlFareEnq/Y');
    assert.equal(JSON.stringify(rows).includes('PRIVATE'),false);
    assert.equal(owners[0],actor);
    if(kind.startsWith('expired')){
      assert.equal(result,null);assert.equal(calls,1);assert.equal(refreshes,0);assert.match(progress[0].message,/Session expired/);
    }else{
      assert.equal(result.status,200);assert.equal(rows[1].attempt,2);assert.equal(rows[1].durationMs,125);
      if(['network','csrf','forbidden'].includes(kind))assert.equal(progress.some(row=>row.stage==='booking:highload'||/high load/i.test(row.message)),false);
      if(kind==='csrf')assert.equal(refreshes,1);
      if(kind==='network'||kind==='forbidden')assert.deepEqual(waits,[2000]);
      if(kind==='highload')assert.equal(progress[0].stage,'booking:highload');
    }
  }
});

test('telemetry failures do not change an API result',async()=>{
  const expected={ok:true,status:200,body:{}};
  const actor={api:{call:async()=>expected},log(){}};
  assert.equal(await safeCall(actor,'api','GET','/validateUser',null,{}, {onResponse:()=>{throw Error('logger failed');}}),expected);
});

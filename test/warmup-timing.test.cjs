'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NEAR_SLOT_MS,nearOpening,warmupTiming}=require('../src/main/runtime/warmup-timing.cjs');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const {createCompiledRuntime}=require('../src/main/runtime/compiled-runtime.cjs');

function actor(delta,patch={}) {
  return {session:{mode:'weblogin'},opts:{akamaiWarmUp:true},serverNow:()=>1000000,
    resolveTarget:()=>({ms:1000000+delta}),...patch};
}

test('five-minute exclusion includes just-before, opening instant and late starts, with strict boundaries',()=>{
  for(const delta of [-NEAR_SLOT_MS+1,-1000,0,1000,NEAR_SLOT_MS-1])assert.equal(nearOpening(actor(delta),{}),delta);
  for(const delta of [-NEAR_SLOT_MS-1,-NEAR_SLOT_MS,NEAR_SLOT_MS,NEAR_SLOT_MS+1])assert.equal(nearOpening(actor(delta),{}),null);
});

test('missing/nonfinite target, nonweb mode, disabled warmup and resume retain inherited behavior',async()=>{
  const unchanged=[actor(0,{resolveTarget:()=>null}),actor(0,{resolveTarget:()=>({ms:NaN})}),
    actor(0,{serverNow:()=>Infinity}),actor(0,{resolveTarget:()=>{throw Error('unavailable');}}),
    actor(0,{session:{mode:'railone'}}),actor(0,{session:{mode:'uilogin'}}),
    actor(0,{opts:{akamaiWarmUp:false}}),actor(0,{opts:{akamaiWarmUp:true,resume:true}})];
  for(const value of unchanged){let calls=0;const job={quota:'8AM'};
    assert.equal(await warmupTiming().f2136(async received=>{calls++;assert.equal(received,job);return 'inherited';},[job],value),'inherited');
    assert.equal(calls,1);
  }
});

test('late skip does not change actor options, original job or slot; real booking remains runnable',async()=>{
  const job=Object.freeze({quota:'8AM',date:'2026-10-31'}),value=actor(-30000),events=[];
  const opts=value.opts;Object.freeze(opts);let dummyCalls=0,bookings=0;
  const result=await warmupTiming((event,data)=>events.push([event,data])).f2136(async()=>{dummyCalls++;},[job],value);
  assert.equal(result,undefined);assert.equal(dummyCalls,0);assert.equal(value.opts,opts);
  assert.equal(nearOpening(value,job),-30000);assert.equal(events[0][1].deltaMs,-30000);
  value.runBrowserBooking=async received=>{assert.equal(received,job);bookings++;};
  await value.runBrowserBooking(job);assert.equal(bookings,1);
});

for(const runtime of ['instruction','compiled'])test(runtime+' runtime passes receiver to interceptor and preserves bound original',async()=>{
  const definition={id:'f2136',kind:'AsyncFunction',language:'strict',length:1,name:'warmUpViaDummyUi',constants:[],code:[],handlers:[]};
  const originalCalls=[];
  const bodies={f2136:async(_rt,_fn,self,args)=>{originalCalls.push([self,args]);return 'warmed';}};
  const options={functionInterceptors:warmupTiming(),compiledBodies:bodies};
  const engine=runtime==='compiled'?createCompiledRuntime({...options,meta:{f2136:definition}}):createEngine({f2136:definition},options);
  const warm=engine.makeFunction('f2136'),late=actor(-30000),early=actor(NEAR_SLOT_MS+1),job={quota:'8AM'};
  assert.equal(await warm.call(late,job),undefined);assert.equal(originalCalls.length,0);
  assert.equal(await warm.call(early,job),'warmed');assert.equal(originalCalls.length,1);
  assert.equal(originalCalls[0][0],early);assert.equal(originalCalls[0][1][0],job);
});

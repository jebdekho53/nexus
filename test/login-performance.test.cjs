const test=require('node:test'),assert=require('node:assert/strict');
const {loginPerformance}=require('../src/main/runtime/login-performance.cjs');
const {createEngine}=require('../src/main/runtime/engine.cjs');

test('ready page uses shorter quiet period but keeps original popup handler',async()=>{
  const hooks=loginPerformance();let waited=false;
  const page={async waitForFunction(_predicate,_arg,options){waited=true;assert.equal(options.timeout,4000);}};
  const result=await hooks.f698((actual,settings)=>{
    assert.equal(actual,page);assert.deepEqual(settings,{maxMs:1500,quietMs:200,extra:true});return 3;
  },[page,{maxMs:16000,quietMs:3000,extra:true}]);
  assert.equal(waited,true);assert.equal(result,3);
});
test('unready page retains popup handling and subtracts readiness time from original budget',async()=>{
  let time=0;const page={async waitForFunction(){time=4000;throw Error('not ready');}},settings={maxMs:16000,quietMs:3000};
  await loginPerformance(()=>{},{now:()=>time}).f698((actual,options)=>{assert.equal(actual,page);assert.deepEqual(options,{maxMs:12000,quietMs:3000});},[page,settings]);
  assert.deepEqual(settings,{maxMs:16000,quietMs:3000});
});
test('original popup failure is propagated without invoking it twice',async()=>{
  let calls=0;const error=Error('popup handler failed'),events=[];
  await assert.rejects(loginPerformance((name,data)=>events.push({name,data}),{now:()=>0}).f698(async()=>{calls++;throw error;},[{waitForFunction:async()=>{}},{maxMs:16000}]),error);
  assert.equal(calls,1);assert.equal(events.at(-1).name,'matrix-login-settle-timing');
});
test('short or exhausted caller budget never gains an additional readiness timeout',async()=>{
  let time=0;const page={waitForFunction:async(_p,_a,options)=>{assert.equal(options.timeout,1000);time=1000;throw Error('not ready');}};
  await loginPerformance(()=>{},{now:()=>time}).f698((_page,options)=>assert.equal(options.maxMs,0),[page,{maxMs:1000}]);
  await loginPerformance().f698((_page,options)=>assert.equal(options.maxMs,0),[{waitForFunction:async()=>{throw Error('must not probe zero budget');}},{maxMs:0}]);
});
test('field value is verified; mismatches retain original typing recovery',async()=>{
  const hook=loginPerformance().f583;let fallback=0;
  const original=()=>{fallback++;return false;};
  assert.equal(await hook(original,[{}, {async fill(value){assert.equal(value,'synthetic');},async inputValue(){return 'synthetic';}},'synthetic']),true);
  assert.equal(fallback,0);
  assert.equal(await hook(original,[{}, {async fill(){},async inputValue(){return 'wrong';}},'synthetic']),false);
  assert.equal(fallback,1);
});
test('engine interceptor calls original with captured context and replacement arguments',()=>{
  const defs={sample:{id:'sample',name:'sample',kind:'NormalFunction',language:'strict',length:1,parameterCount:2,registerCount:0,constants:[],handlers:[],code:[[0,'Ldar',[{a:0}]],[2,'Return',[]]]}};
  const engine=createEngine(defs,{functionInterceptors:{sample:(original,args)=>original(args[0]+1)}});
  assert.equal(engine.makeFunction('sample')(7),8);
});

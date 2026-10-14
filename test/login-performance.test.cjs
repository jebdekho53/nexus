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
test('unready page retains original wait settings',async()=>{
  const page={async waitForFunction(){throw Error('not ready');}},settings={maxMs:16000,quietMs:3000};
  await loginPerformance().f698((actual,options)=>{assert.equal(actual,page);assert.equal(options,settings);},[page,settings]);
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

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspect}=require('node:util');
const legacy=require('./fixtures/legacy/runtime-support.legacy.cjs');
const migrated=require('../src/main/runtime/runtime-support.cjs');

// src/ts/main/runtime/runtime-support.ts versus the previous JavaScript. Each implementation gets its own support
// instance; results are rendered with util.inspect (symbols by description, functions by name) and compared.
const show=value=>inspect(value,{depth:10,showHidden:false,breakLength:Infinity});
const both=(scenario)=>{
  const run=module=>{const trace=[];try{return{value:show(scenario(module.createSupport({__esmImport:undefined}),module,trace)),trace};}catch(error){return{error:error.constructor.name+': '+error.message,trace};}};
  return[run(legacy),run(migrated)];
};
const same=(label,scenario)=>{const[a,b]=both(scenario);assert.deepEqual(b,a,label);return b;};

test('exports',()=>{
  assert.deepEqual(Object.keys(migrated).sort(),Object.keys(legacy).sort());
  for(const name of['numeric','receiver','own'])for(const value of[1,'2','x',null,undefined,5n,{},[],()=>1,true,'',NaN]) {
    if(name==='own')continue;
    assert.equal(show(migrated[name](value)),show(legacy[name](value)),name+String(value));
  }
  const a={},b={};
  migrated.own(a,'k',1);legacy.own(b,'k',1);
  assert.deepEqual(Object.getOwnPropertyDescriptors(a),Object.getOwnPropertyDescriptors(b));
  assert.equal(typeof migrated.HOLE,'symbol');assert.equal(migrated.HOLE.description,legacy.HOLE.description);
  assert.equal(migrated.SUSPEND.description,legacy.SUSPEND.description);assert.equal(migrated.META.description,legacy.META.description);assert.equal(migrated.CONTEXT.description,legacy.CONTEXT.description);
});

test('context',()=>{
  for(const length of[0,1,2,3,10])for(const parent of[null,undefined,[1],{}])
    same('context '+length,(support,module)=>{const ctx=support.context(length,parent);return[ctx.length,ctx[1]===parent,ctx[module.CONTEXT]===parent,Object.keys(ctx).length];});
});

test('constant',()=>{
  const constants=[undefined,null,0,'s',true,{type:'undefined'},{type:'uninitialized'},{type:'hole'},{type:'number',value:'12.5'},{type:'number',value:'abc'},{type:'bigint',digits:[5],negative:false},{type:'bigint',digits:[0,1],negative:false},{type:'bigint',digits:[1,2,3],negative:true},{type:'bigint',digits:[],negative:false},
    {type:'symbol',id:1,description:'plain'},{type:'symbol',id:2,description:'Symbol.iterator'},{type:'symbol',id:3,description:'Symbol.nope'},{type:'symbol',id:4,description:{type:'undefined'}},{type:'symbol',id:5,description:{type:'number',value:7}},
    {type:'unsupported'},{type:'depth-limit'},{type:'other',x:1},{},[],[1,2],{type:'object',entries:[]}];
  for(const c of constants)same('constant '+show(c),support=>support.constant(c));
  same('symbol identity per id',support=>{const a=support.constant({type:'symbol',id:9,description:'x'}),b=support.constant({type:'symbol',id:9,description:'y'}),c=support.constant({type:'symbol',id:10,description:'x'});return[a===b,a===c,support.constant({type:'symbol',id:11,description:'Symbol.iterator'})===Symbol.iterator,support.constant({type:'symbol',id:12,description:'Symbol.nope'})===undefined];});
  same('hole identity',(support,module)=>support.constant({type:'hole'})===module.HOLE);
});

test('literal',()=>{
  const k=(value)=>({type:'number',value});
  const literals=[1,'x',null,undefined,[],[1,[2,3],{type:'number',value:'4'}],{type:'array',values:[1,{type:'hole'},3]},{type:'array',values:[]},{type:'object',entries:[]},{type:'object',entries:[['a',1],[{type:'number',value:'7'},{type:'array',values:[1]}],[{type:'symbol',id:1,description:'s'},'v']]},{type:'tuple',values:[1,2]},{type:'tuple',values:{type:'array',values:[9]}},{type:'bigint',digits:[3],negative:true},{type:'hole'},{type:'object',entries:[['a',{type:'object',entries:[['b',{type:'object',entries:[]}]]}]]},[{type:'hole'},{type:'hole'}],[,1],{type:'weird'}];
  void k;
  for(const l of literals)same('literal '+show(l),support=>support.literal(l));
  same('literal arrays keep holes sparse',(support,module)=>{const arr=support.literal([1,{type:'hole'},3]);return[arr.length,1 in arr,Object.keys(arr)];});
  same('object keys are own enumerable writable',support=>{const o=support.literal({type:'object',entries:[['__proto__',1],['x',2]]});return[Object.getPrototypeOf(o)===Object.prototype,Object.getOwnPropertyDescriptors(o)];});
});

test('defineClass',()=>{
  const makeCtor=()=>function Ctor(){};
  class Base{base(){return'b';}}
  const attrs=[0,1,2,3,4,6,7];
  const recipes=[
    {},
    {instanceProperties:{entries:[['m',5,2,0],['n',{type:'number',value:'3'},0,1]]}},
    {instanceProperties:{entries:[['a',1,0,2],['b',2,1,1]]},instanceElements:{entries:[['0','e',2,0]]}},
    {staticProperties:{entries:[['s',9,4,0]]},staticElements:{entries:[['1','v',6,3]]}},
    {instanceProperties:{entries:[[{type:'symbol',id:1,private:true,description:'#p'},1,2,0],['pub',1,2,1]]}},
    {instanceProperties:{entries:[['skip',{type:'builtinAccessor'},2,0],['skip2',{type:'classPositions'},2,1],['ok','x',2,2]]}},
    {instanceProperties:{entries:[['acc',{type:'accessor',get:4,set:5},2,0],['acc2',{type:'accessor',get:{type:'undefined'},set:{type:'undefined'}},2,1]]}},
    {instanceComputed:[0<<2|0,1<<2|1],staticComputed:[2<<2|2]},
    {instanceComputed:[3<<2|3]},
    {instanceProperties:{entries:[['get_set',null,2,0]]}},
  ];
  const parents=['hole',null,Base,Object,undefined,5,'str',{}];
  recipes.forEach((recipe,ri)=>parents.forEach(pk=>attrs.slice(0,1).forEach(()=>{
    same(`defineClass recipe ${ri} parent ${String(pk)}`,(support,module,trace)=>{
      const ctor=makeCtor();
      const parent=pk==='hole'?module.HOLE:pk;
      const getter=function getter(){return'g';},setter=function setter(v){trace.push(['set',v]);};
      const prototype=support.defineClass([recipe,ctor,parent,'k0','v0',getter,setter,'computedKey','computedValue']);
      return[prototype===ctor.prototype,Object.getPrototypeOf(prototype)===(parent===module.HOLE?Object.prototype:parent===null?null:parent&&parent.prototype),Object.getPrototypeOf(ctor)===(parent===module.HOLE||parent===null?Function.prototype:parent),Object.getOwnPropertyDescriptors(prototype),Object.getOwnPropertyDescriptors(ctor),Object.getOwnPropertyDescriptor(ctor,'prototype')];
    });
  })));
  same('computed accessor merges with existing',(support,module,trace)=>{
    const ctor=makeCtor();
    support.defineClass([{instanceComputed:[3<<2|1,5<<2|2]},ctor,module.HOLE,'k',function g(){return 1;},'k',function s(v){trace.push(v);}]);
    return Object.getOwnPropertyDescriptors(ctor.prototype);
  });
});

test('runtime helpers',async()=>{
  same('unknown helper',support=>support.runtime('Nope',[],{}));
  for(const name of['ThrowIteratorResultNotAnObject','ThrowStaticPrototypeError'])same(name,support=>support.runtime(name,[],{}));
  same('async enter/await/resolve',(support)=>{
    const frame={};const state=support.runtime('_AsyncFunctionEnter',[],frame);
    support.runtime('_AsyncFunctionAwait',[state,'p'],frame);
    const promise=support.runtime('_AsyncFunctionResolve',[state,42],frame);
    return[frame.state===state,state.pending,state.mode,state.input,promise===state.promise,support.runtime('_GeneratorGetResumeMode',[state],frame)];
  });
  for(const kind of['_AsyncFunctionResolve','_AsyncFunctionReject']) {
    const[a,b]=['legacy','migrated'].map(()=>null);void a;void b;
    const outcomes=[legacy,migrated].map(module=>{const support=module.createSupport({});const frame={};const state=support.runtime('_AsyncFunctionEnter',[],frame);const promise=support.runtime(kind,[state,'value'],frame);return promise.then(v=>['resolved',v],e=>['rejected',e]);});
    const[x,y]=await Promise.all(outcomes);assert.deepEqual(y,x,kind);
  }
  const sources=[null,undefined,{a:1,b:2},{[Symbol('s')]:1,c:3},'str',5,[1,2],Object.create({inherited:1},{own:{value:1,enumerable:true},hidden:{value:2,enumerable:false}})];
  for(const source of sources) {
    same('copy '+show(source),support=>{const target={};support.runtime('_CopyDataProperties',[target,source],{});return target;});
    same('copy excluded '+show(source),support=>support.runtime('_CopyDataPropertiesWithExcludedPropertiesOnStack',[source,'a','c'],{}));
  }
  same('super load',support=>{class A{get v(){return this.x;}}const target={x:7};Object.setPrototypeOf(target,A.prototype);return support.runtime('LoadKeyedFromSuper',[target,{...Object.create(A.prototype)},'v'],{});});
  for(const flags of[0,2,4,6])for(const getter of[undefined,null,function g(){return 1;}])
    same('accessor flags '+flags,support=>{const target={};support.runtime('DefineAccessorPropertyUnchecked',[target,'p',getter,undefined,flags],{});return Object.getOwnPropertyDescriptor(target,'p');});
  // dynamic import: injected loader, default loader supplied by the entry point
  for(const module of[legacy,migrated]) {
    const calls=[];
    const support=module.createSupport({__esmImport:(...args)=>{calls.push(args);return'loaded';}});
    assert.equal(support.runtime('DynamicImportCall',['a','spec','c','opts'],{}),'loaded');
    assert.deepEqual(calls,[['spec','opts']]);
    const fallback=module.createSupport({});
    const imported=await fallback.runtime('DynamicImportCall',[0,'node:path',0,undefined],{});
    assert.equal(typeof imported.join,'function');
  }
  // __esmImport is read at call time, not captured when the support is created
  for(const module of[legacy,migrated]) {
    const globals={};const support=module.createSupport(globals);
    globals.__esmImport=()=>'late';
    assert.equal(support.runtime('DynamicImportCall',[0,'x',0,1],{}),'late');
  }
});

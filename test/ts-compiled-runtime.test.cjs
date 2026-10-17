'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspect}=require('node:util');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const legacy=require('./fixtures/legacy/compiled-runtime.legacy.cjs');
const migrated=require('../src/main/runtime/compiled-runtime.cjs');

// src/ts/main/runtime/compiled-runtime.ts versus the previous JavaScript, using synthetic metadata and bodies.
const check=differential(legacy,migrated);
test('exports',()=>sameExports(legacy,migrated));

const kinds=['NormalFunction','ArrowFunction','AsyncFunction','AsyncArrowFunction','ClassMethod','Getter','Setter','DerivedConstructor','BaseConstructor','AsyncMethod','GeneratorLike'];
const meta=Object.fromEntries(kinds.flatMap((kind,i)=>[['f'+i,{kind,language:'strict',name:kind+'Name',length:i,constants:{k:i}}],['s'+i,{kind,language:'sloppy',length:undefined,constants:[i]}]]));
meta.noName={kind:'NormalFunction',language:'strict'};
const bodyFor=(trace,id)=>(rt,fn,self,args,newTarget,captured,constants)=>{
  trace.push(['body',id,self===rt.HOLE?'HOLE':self===rt.globals?'globals':typeof self==='object'&&self!==null?'object:'+(self.tag||'?'):self===undefined?'undefined':typeof self,args,newTarget===undefined?'undefined':typeof newTarget,Array.isArray(captured),constants,typeof fn]);
  return 'result:'+id;
};

test('every function kind: this binding, new.target, name/length/META, hooks',async()=>{
  for(const id of Object.keys(meta))
    await check(id,async(m,trace)=>{
      const bodies=Object.fromEntries(Object.keys(meta).map(k=>[k,bodyFor(trace,k)]));
      const globals={tag:'G'};
      const runtime=m.createCompiledRuntime({meta,compiledBodies:bodies,globals,onInvoke:(...a)=>trace.push(['onInvoke',a[0],a[1],Array.isArray(a[2])])});
      const captured=runtime.context(3,null);
      const lexical={thisValue:{tag:'lexicalThis'},newTarget:'NT'};
      const fn=runtime.makeFunction(id,captured,lexical);
      const descriptor=name=>Object.getOwnPropertyDescriptor(fn,name);
      const shape={name:fn.name,length:fn.length,nameDesc:{...descriptor('name'),value:undefined},meta:(({id:i,kind})=>({id:i,kind,captured:fn[m.META].captured===captured}))(fn[m.META]),proto:'prototype' in fn,isAsync:fn.constructor.name,metaDesc:{...Object.getOwnPropertyDescriptor(fn,m.META),value:undefined}};
      const callThis={tag:'callThis'};
      const results=[];
      results.push(await fn.call(callThis,1,2));
      results.push(await fn.call(undefined,3));
      results.push(await fn.call(null));
      results.push(await fn.call('str'));
      if(/Function$|Constructor$/.test(meta[id].kind)&&!/Arrow|Async/.test(meta[id].kind)){try{results.push(inspect(new fn(7)));}catch(e){results.push('new threw '+e.constructor.name);}}
      return{shape,results};
    });
});

test('overrides and interceptors',async()=>{
  const bodies=trace=>({f0:bodyFor(trace,'f0'),f1:bodyFor(trace,'f1'),f2:bodyFor(trace,'f2')});
  const metas={f0:{kind:'NormalFunction'},f1:{kind:'ArrowFunction'},f2:{kind:'AsyncFunction'}};
  const scenarios={
    override:{overrides:{f0:function(...a){return['override',this&&this.tag,a];}}},interceptor:{interceptors:{f0:(original,args)=>['intercepted',original(...args.map(x=>x+1)),args]}},
    both:{overrides:{f0:()=>'override wins'},interceptors:{f0:()=>'interceptor'}},overrideOther:{overrides:{f1:()=>'o1'},interceptors:{f2:(original,args)=>original(...args)}},
    inheritedKey:{overrides:Object.create({f0:()=>'inherited'})},interceptorDefers:{interceptors:{f0:(original)=>original(10,20)}},interceptorAsync:{interceptors:{f2:async(original,args)=>['async',await original(...args)]}},
    none:{},
  };
  for(const[name,o]of Object.entries(scenarios))for(const id of['f0','f1','f2'])
    await check(name+id,async(m,trace)=>{
      const runtime=m.createCompiledRuntime({meta:metas,compiledBodies:bodies(trace),functionOverrides:o.overrides,functionInterceptors:o.interceptors,onInvoke:(i,a)=>trace.push(['onInvoke',i,a])});
      const fn=runtime.makeFunction(id,undefined,{thisValue:{tag:'L'}});
      return fn.call({tag:'T'},1,2);
    });
});

test('native implementations read bindings lazily',async()=>{
  const bodies=trace=>({f0:bodyFor(trace,'f0')});
  const scenarios={
    native:{factory:({readBinding})=>function(...a){return['native',this&&this.tag,a,readBinding(2,'x')];}},
    depth:{factory:({readBinding})=>()=>readBinding(2,'x',1)},hole:{factory:({readBinding})=>()=>readBinding(2,'x'),hole:true},holeDepth:{factory:({readBinding})=>()=>readBinding(2,'y',1),holeParent:true},
    notFunction:{factory:()=>5},undefinedFactoryResult:{factory:()=>undefined},noFactory:{},factoryOtherId:{factories:{other:()=>()=>1}},factoryThrows:{factory:()=>{throw new Error('factory');}},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,async(m,trace)=>{
      const meta0={f0:{kind:'NormalFunction'}};
      const runtime=m.createCompiledRuntime({meta:meta0,compiledBodies:bodies(trace),functionFactories:o.factories||(o.factory?{f0:o.factory}:undefined),onInvoke:(i,a)=>trace.push(['onInvoke',i,a])});
      const parent=runtime.context(4,null);parent[2]='parentValue';
      const captured=runtime.context(4,parent);captured[2]=o.hole?runtime.HOLE:'value';
      if(o.holeParent)parent[2]=runtime.HOLE;
      const fn=runtime.makeFunction('f0',captured);
      return fn.call({tag:'T'},'a','b');
    });
});

test('errors and runtime helpers',async()=>{
  await check('missing function',m=>{const r=m.createCompiledRuntime({meta:{},compiledBodies:{}});return r.makeFunction('nope');});
  await check('missing body',m=>{const r=m.createCompiledRuntime({meta:{f0:{kind:'NormalFunction'}},compiledBodies:{}});return r.makeFunction('f0');});
  await check('rt helpers',(m,trace)=>{
    let rtSeen;
    const r=m.createCompiledRuntime({meta:{f0:{kind:'NormalFunction'}},compiledBodies:{f0:(rt)=>{rtSeen=rt;return'ok';}},globals:{known:1,tag:'G'},tick:()=>trace.push('tick')});
    r.makeFunction('f0')();
    const parent=rtSeen.context(2,null),child=rtSeen.context(2,parent),grandchild=rtSeen.context(2,child);
    const out=[Object.keys(rtSeen).sort(),rtSeen.outer(grandchild,2)===parent,rtSeen.outer(grandchild,0)===grandchild,rtSeen.global('known'),rtSeen.call((a,b)=>[a,b,'called'],null,[1,2]),rtSeen.numeric('5'),rtSeen.receiver(null),rtSeen.receiver({}),rtSeen.constant({type:'number',value:'3'}),rtSeen.literal([1,{type:'hole'}]).length];
    rtSeen.tick();
    for(const bad of[()=>rtSeen.global('missing'),()=>rtSeen.outer(grandchild,5),()=>rtSeen.runtime('Nope',[],{})]){try{bad();out.push('no throw');}catch(e){out.push(e.constructor.name+': '+e.message);}}
    const inner=rtSeen.makeFunction('f0');out.push(typeof inner);
    return out;
  });
  await check('default tick absent',m=>{let rt;const r=m.createCompiledRuntime({meta:{f0:{kind:'NormalFunction'}},compiledBodies:{f0:x=>{rt=x;}}});r.makeFunction('f0')();rt.tick();return'ok';});
  await check('exposed members',m=>{const r=m.createCompiledRuntime({meta:{},compiledBodies:{}});return[Object.keys(r).sort(),r.HOLE===m.HOLE,r.META===m.META];});
});

test('dynamic import: __esmImport read from globals at call time, real import fallback',async()=>{
  for(const module of[legacy,migrated]) {
    const globals={};const r=module.createCompiledRuntime({meta:{},compiledBodies:{},globals});
    void r;
    const calls=[];globals.__esmImport=(...a)=>{calls.push(a);return'late';};
    let rtSeen;const r2=module.createCompiledRuntime({meta:{f0:{kind:'NormalFunction'}},compiledBodies:{f0:rt=>{rtSeen=rt;}},globals});
    r2.makeFunction('f0')();
    assert.equal(rtSeen.runtime('DynamicImportCall',[0,'spec',0,'opts'],{}),'late');
    delete globals.__esmImport;
    const imported=await rtSeen.runtime('DynamicImportCall',[0,'node:path',0,undefined],{});
    assert.equal(typeof imported.join,'function');
  }
});

test('default bundle: metadata and bodies load from src/main/compiled',()=>{
  for(const module of[legacy,migrated]) {
    const runtime=module.createCompiledRuntime();
    const fn=runtime.makeFunction('f2271');
    assert.equal(typeof fn,'function');
    assert.equal(fn.name.length>0,true);
  }
});

test('engine: default compiled-bundle switch (MATRIX_COMPILED=1) and interpreter parity on a recovered function',()=>{
  const legacyEngine=require('./fixtures/legacy/engine.legacy.cjs'),migratedEngine=require('../src/main/runtime/engine.cjs');
  assert.deepEqual(Object.keys(migratedEngine).sort(),Object.keys(legacyEngine).sort());
  const definitions=require('../src/main/generated/index.cjs');
  const previous=process.env.MATRIX_COMPILED;
  try{
    for(const mode of['0','1']) {
      process.env.MATRIX_COMPILED=mode;
      const outputs=[legacyEngine,migratedEngine].map(module=>{
        const engine=module.createEngine(definitions,{globals:{Math:Object.create(Math,{random:{value:()=>0.5}}),Number,Object,Array,String,JSON,Date}});
        const root=engine.context(2000,null);
        const fn=engine.makeFunction('f2271',root);
        return[fn.name,fn.length,typeof fn,Object.keys(engine).sort(),Object.keys(engine.definitions).length];
      });
      assert.deepEqual(outputs[1],outputs[0],'MATRIX_COMPILED='+mode);
    }
  }finally{if(previous===undefined)delete process.env.MATRIX_COMPILED;else process.env.MATRIX_COMPILED=previous;}
});

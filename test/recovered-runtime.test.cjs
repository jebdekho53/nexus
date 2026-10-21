'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const definitions=require('../src/main/generated/index.cjs');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const strings=require('./fixtures/import-helper-strings.json');
const {checks,developmentOverrides}=require('../src/main/runtime/development.cjs');

test('development mode covers local screen, network-probe and recurring security checks',async()=>{
  const events=[];
  const overrides=developmentOverrides((event,details)=>events.push({event,...details}));
  assert.deepEqual(Object.keys(overrides),['f2595','f2605','f2635','f2684','f2685','f2689','f2749','f2758','f2810','f2835','f2539','f2549','f2877','f2009','f3370','f3383']);
  const engine=createEngine(definitions,{functionOverrides:overrides});
  for(const id of Object.keys(checks)) {
    assert.ok(definitions[id].kind.includes('Async'));
    const result=await engine.makeFunction(id).call({name:'check-'+id});
    if(id==='f2758'){assert.deepEqual(result,{passed:true,skipped:true,checks:[]});continue;}
    if(id==='f2810'){assert.deepEqual(result,[]);continue;}
    if(id==='f2835'){assert.equal(result,undefined);continue;}
    assert.equal(result.name,'check-'+id);
    assert.equal(result.passed,true);
    assert.deepEqual(result.findings,[]);
  }
  assert.equal(events.length,10);
  assert.equal(overrides.f3370({}),true,'key-free booking branch is selected');
  assert.equal(Object.hasOwn(overrides,'f2455'),false,'license activation is preserved');
  assert.equal(engine.makeFunction('f0')().length,5);
});

test('recovered script returns the actual five-argument CommonJS wrapper',()=>{
  const wrapper=createEngine(definitions).makeFunction('f0')();
  assert.equal(typeof wrapper,'function');assert.equal(wrapper.length,5);
});

test('recovered namespace helper copies multiple properties and preserves live getters',()=>{
  const engine=createEngine(definitions);
  const captured=engine.context(6,null);
  captured[5]=(index,key)=>{
    const token=index+'|'+key;
    assert.ok(Object.hasOwn(strings,token),'unknown helper decoder lookup');
    return strings[token];
  };
  const original={alpha:1,beta:2};
  const namespace=engine.makeFunction('f6',captured)(original);
  assert.equal(namespace.alpha,1);assert.equal(namespace.beta,2);
  assert.equal(namespace.default,original);
  original.alpha=7;original.beta=11;
  assert.equal(namespace.alpha,7);assert.equal(namespace.beta,11);
  assert.equal(Object.getPrototypeOf(namespace),null);
  assert.ok(Object.isFrozen(namespace));
});

test('zero-argument constructor uses its native count instead of the printed register range',()=>{
  const source=definitions.f1;
  const segment=source.code.filter(row=>row[0]>=18711&&row[0]<=18719);
  assert.equal(segment.at(-1)[1],'Construct');
  assert.equal(source.registerCounts[18719],0);
  const fixture={...source,id:'fixtureMap',name:'mapFactory',handlers:[],parameterCount:2,length:1,
    code:[[0,'Ldar',[{a:0}]],[1,'Star0',[]],...segment,[18724,'Return',[]]]};
  const result=createEngine({fixtureMap:fixture}).makeFunction('fixtureMap')(()=>{});
  assert.ok(result instanceof Map);assert.equal(result.size,0);
});

test('every generated jump and exception handler resolves inside its function',()=>{
  for(const definition of Object.values(definitions)) {
    const offsets=new Set(definition.code.map(row=>row[0]));
    for(const row of definition.code) {
      if(row.length>3)assert.ok(offsets.has(row[3]),definition.id+' jump '+row[3]);
      for(const operand of row[2])if(operand?.table)for(const target of Object.values(operand.table))assert.ok(offsets.has(target));
    }
    for(const handler of definition.handlers)assert.ok(offsets.has(handler[2]),definition.id+' handler '+handler[2]);
  }
});

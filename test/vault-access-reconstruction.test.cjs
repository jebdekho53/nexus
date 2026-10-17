'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,compare,outcome}=require('./helpers/recovered-harness.cjs');
const {HOLE}=require('../src/main/runtime/engine.cjs');
const cases=[['f3499',1711,547],['f3575',1788,549],['f3578',1791,554],['f3582',1795,551],['f3583',1797,550]];
function scenario(name,[id,cacheSlot,typeSlot],options={}) {
  test('vault access matches recovered: '+id+' '+name,async()=>compare(async native=>{
    const trace=[];let identity,instance,created=0;
    const fail=name=>{if(options.fail===name)throw new Error('synthetic '+name);};
    function Vault(directory,key,callback) {
      trace.push(['construct',directory,key,arguments.length,new.target===Vault]);fail('construct');
      this.number=++created;instance=this;identity=callback;
      if(options.identityDuringConstruction)trace.push(['during',callback()]);
    }
    Vault.prototype.migrateLabels=function(){trace.push(['migrate',this===instance]);fail('migrate');return options.migrated??2;};
    const slots={
      [cacheSlot]:Object.hasOwn(options,'cached')?options.cached:undefined,[typeSlot]:Vault,
      1611:'first-identity',22:{app:{getPath(name){trace.push(['path',name]);fail('path');return '/synthetic';}}},
      1805:directory=>{trace.push(['key',directory]);fail('key');return 'synthetic-key';},
      1885:(...args)=>{trace.push(['log',...args]);fail('log');},
    };
    for(const slot of options.holes??[])slots[slot]=HOLE;
    const h=harness({native,slots});
    if(options.invalidConstructor)h.root[typeSlot]={};
    const describe=value=>value===instance&&instance?{instance:instance.number}:value===HOLE?'HOLE':value;
    const results=[];
    for(let i=0;i<(options.repeat?2:1);i++)results.push(await outcome(()=>describe(h.rootFunction(id)())));
    if(identity&&options.identityAfter){h.root[1611]='second-identity';results.push(await outcome(()=>identity()));h.root[1611]=HOLE;results.push(await outcome(()=>identity()));}
    return {results,trace,cached:describe(h.root[cacheSlot]),created};
  }));
}
for(const config of cases) {
  scenario('fresh then cached',config,{repeat:true});
  for(const cached of [null,false,0,'',true,1,'cached',{already:'created'}])scenario('cache '+JSON.stringify(cached),config,{cached,repeat:true});
  for(const fail of ['path','key','construct'])scenario('failure '+fail,config,{fail,repeat:true});
  for(const slot of [config[1],config[2],22])scenario('uninitialised '+slot,config,{holes:[slot]});
  scenario('cached bypasses missing Electron and constructor',config,{cached:{existing:true},holes:[22,config[2]]});
  scenario('not a constructor',config,{invalidConstructor:true});
}
for(const migrated of [0,false,'',1,4,'3'])scenario('label migration '+JSON.stringify(migrated),cases[0],{migrated,repeat:true});
for(const fail of ['migrate','log'])scenario('post-cache failure '+fail,cases[0],{fail,repeat:true});
scenario('identity is lazy and observes current binding',cases[0],{identityAfter:true});
scenario('identity during constructor',cases[0],{identityDuringConstruction:true});
test('standalone identity callback matches recovered',async()=>compare(async native=>{
  const h=harness({native,slots:{1611:'synthetic'}});const identity=h.rootFunction('f3500');
  const first=identity();h.root[1611]='changed';return {first,next:identity()};
}));
test('forms vault initialization is cached before migration failure',()=>{
  const {formsVault}=require('../src/main/storage/vault-access.cjs');let cached,constructs=0;
  class Vault{constructor(){constructs++;}migrateLabels(){throw new Error('synthetic migration');}}
  const deps={cached:()=>cached,cache:value=>{cached=value;},userData:()=>'/synthetic',constructor:()=>Vault,key:()=>'',identity:()=>'',log(){}};
  assert.throws(()=>formsVault(deps),/synthetic migration/);assert.equal(formsVault(deps),cached);assert.equal(constructs,1);
});

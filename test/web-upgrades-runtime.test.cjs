'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {webBookingUpgrades}=require('../src/main/runtime/web-booking-upgrades.cjs');
const {csrfTiming}=require('../src/main/runtime/csrf-timing.cjs');
const {createCompiledRuntime}=require('../src/main/runtime/compiled-runtime.cjs');
const {createEngine}=require('../src/main/runtime/engine.cjs');

for(const compiled of [false,true])for(const scenario of ['csrf','network','exhausted'])test(`default web factories ${compiled?'compiled':'instruction'} recover ${scenario}`,async()=>{
  const options={functionFactories:webBookingUpgrades({dependencies:{timers:{sleep:async()=>{}},random:()=>0}}),functionInterceptors:csrfTiming()};
  const runtime=compiled?createCompiledRuntime(options):createEngine(require('../src/main/generated/index.cjs'),options);
  const root=runtime.context(2000,null),scope=runtime.context(2,root);
  Object.assign(root,{581:3,598:'busy',601:'blocked',602:'duplicate',603:'closed',774:{parseAkScore:()=>null},930:status=>status===409?'csrf':'ok',931:status=>String(status),939:()=>''});
  let token='old',posts=0,refreshes=0;
  const body={test:'unchanged'};
  const actor={opts:{},session:{tokens:{csrfToken:'old'},page:{isClosed:()=>false}},log:()=>{},onProgress:()=>{},api:{
    csrfToken:()=>token,resyncCsrf:value=>{token=value;},
    call:async(method,url,input)=>{
      if(method==='GET'){refreshes++;token='fresh-'+refreshes;return{status:200,body:{}};}
      assert.equal(url,'/booking-test');assert.equal(input,body);posts++;
      if(scenario==='network'&&posts===1)throw Error('lost response');
      return{status:scenario==='exhausted'||scenario==='csrf'&&posts===1?409:200,body:{},headers:{}};
    },
  }};
  const result=await runtime.makeFunction('f2064',scope).call(actor,'api','POST','/booking-test',body,{boundedRetry:2});
  assert.equal(refreshes,scenario==='exhausted'?3:1);
  assert.equal(posts,scenario==='exhausted'?4:2);
  assert.equal(result?.status,scenario==='exhausted'?undefined:200);
  assert.equal(actor.session.tokens.csrfToken,token);
  if(scenario==='exhausted')assert.equal(actor.terminal,'duplicate');
});

test('production upgrades select reviewed web adapters without loading archived definitions',()=>{
  // Run in a fresh process: test runners may already have loaded the interpreter.
  const {execFileSync}=require('node:child_process');
  const source="const f=require('./src/main/runtime/web-booking-upgrades.cjs').webBookingUpgrades();console.log(JSON.stringify({ids:Object.keys(f),archived:Object.keys(require.cache).some(p=>p.includes('/generated/')||p.includes('\\\\generated\\\\'))}));";
  const result=JSON.parse(execFileSync(process.execPath,['-e',source],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8'}));
  assert.deepEqual(result.ids,['f2064','f2161','f2269','f2052','f2172','f1652']);
  assert.equal(result.archived,false);
});

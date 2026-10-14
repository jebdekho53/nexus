'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const definitions=require('../src/main/generated/index.cjs'),{createEngine}=require('../src/main/runtime/engine.cjs');
const strings=require('./fixtures/booking-timing-strings.json');
test('clicked login skips Tatkal login waiting without changing scheduled booking or other runs',async()=>{
 const {bookingTiming,withImmediateLogin}=require('../src/main/runtime/booking-timing.cjs');
 const hook=bookingTiming().f2281,scheduled={ms:Date.now()+36000000,label:'login'};
 const original=()=>scheduled;
 await withImmediateLogin(async()=>{
  await new Promise(resolve=>setImmediate(resolve));
  for(const quota of ['TQ','PT','8AM'])assert.equal(hook(original,[{quota}]),null);
 });
 for(const quota of ['TQ','PT','8AM'])assert.equal(hook(original,[{quota}]),scheduled);
 const engine=createEngine(definitions,{functionInterceptors:bookingTiming()}),parent=engine.context(940,null),context=engine.context(6,parent);
 parent[934]=()=> 'acTatkal';parent[5]=decoder('f2280');
 const form={quota:'TQ',classCode:'3A',timing:{availTimes:{acTatkal:{hour:10,minute:0,second:0,ms:0}}}};
 parent[279]=()=>false;parent[625]=()=>false;parent[280]=()=>({hour:10});parent[938]=()=>scheduled.ms;
 const actor={opts:{timing:form.timing},isChancesFlow:()=>false,serverNow:()=>Date.now(),log:()=>{}};
 const booking=engine.makeFunction('f2280',context);
 const before=booking.call(actor,form);
 assert.equal(before.ms,scheduled.ms);
 assert.deepEqual(withImmediateLogin(()=>booking.call(actor,form)),before);
});
function decoder(id){return (index,key)=>{const value=strings[id][index+'|'+key];assert.notEqual(value,undefined,'missing decoder '+id+': '+index+'|'+key);return value;};}
test('actual slot resolver keeps General immediate and existing opening/Tatkal slots scheduled',()=>{
 const engine=createEngine(definitions),context=engine.context(940,null);
 context[5]=decoder('f2375');context[933]=new Set(['1A','2A','3A','3E','CC','EC']);
 const resolve=engine.makeFunction('f2375',context);
 for(const cls of ['SL','3A','2S'])assert.equal(resolve('GN',cls),null);
 assert.equal(resolve('8AM','SL'),'eightAm');assert.equal(resolve('TQ','SL'),'slTatkal');assert.equal(resolve('TQ','3A'),'acTatkal');assert.equal(resolve('PT','3A'),'acTatkal');
});
test('General ignores stale saved slot timing for browser login and availability',()=>{
 const engine=createEngine(definitions,{functionInterceptors:require('../src/main/runtime/booking-timing.cjs').bookingTiming()}),parent=engine.context(940,null),context=engine.context(6,parent);
 parent[934]=(quota)=>quota==='GN'?null:'eightAm';parent[5]=decoder('f2280');
 const form={quota:'GN',classCode:'SL',timing:{loginTimes:{eightAm:{hour:8}},availTimes:{eightAm:{hour:8}}}};
 const actor={opts:{timing:form.timing},loginTargetCache:undefined};
 assert.equal(engine.makeFunction('f2280',context).call(actor,form),null);
 parent[5]=decoder('f2281');actor.loginTargetCache={ms:Date.now()+3600000,label:'login'};
 assert.equal(engine.makeFunction('f2281',context).call(actor,form),null);
 assert.deepEqual(engine.makeFunction('f2281',context).call(actor,{...form,quota:'8AM'}),actor.loginTargetCache);
});
test('General survives shipped conversion and is offered in both form and booking panel',async()=>{
 const types=await import(pathToFileURL(path.join(__dirname,'../src/renderer/assets/types-B0-2ZUtm.js')).href);
 const form={account:{},journey:{quota:'GN',classCode:'SL'},options:{},payment:{method:'paytm'},passengers:[],timing:{}};
 assert.equal(types.J(form).quota,'GN');
 for(const file of ['form.html','booking-box.html'])assert.match(fs.readFileSync(path.join(__dirname,'../src/renderer',file),'utf8'),/value="GN">[^<]*Book now/);
});
test('actual countdown IPC returns no scheduled login or availability for General',async()=>{
 const engine=createEngine(definitions),parent=engine.context(1800,null),context=engine.context(6,parent);
 parent[934]=quota=>quota==='GN'?null:'eightAm';
 parent[289]=()=>({});parent[1678]=value=>value;parent[290]=value=>value;
 const request={quota:'GN',classCode:'SL',formId:'synthetic',timing:{loginTimes:{eightAm:{hour:8}}}};
 for(const id of ['f3873','f3874']){context[2]=decoder(id);assert.deepEqual(await engine.makeFunction(id,context)({},request),{ok:true,data:null});}
});

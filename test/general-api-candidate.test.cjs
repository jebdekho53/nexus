'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBookNow}=require('../src/main/runtime/book-now.cjs');
const {withCandidate,interceptors}=require('../src/main/runtime/general-api-candidate.cjs');
const definitions=require('../src/main/generated/index.cjs'),{createEngine}=require('../src/main/runtime/engine.cjs');
test('opt-in candidate reuses login and marks API search only for General Auto without mutating saved requests',()=>{
 const policy=createBookNow(()=>{},{generalApiCandidate:true});
 policy.observe('app:get-form',['one'],{ok:true,data:{id:'one',journey:{quota:'GN'}}});
 const login={formId:'one',mode:'weblogin',provider:'brave',directLogin:false};
 assert.equal(policy.prepare('app:login',[login])[0].directLogin,true);assert.equal(login.directLogin,false);
 const request={formId:'one',form:{quota:'GN',directLogin:false,train:'13307',timing:{}}};
 const candidate=policy.prepare('app:start-booking',[request])[0];
 assert.equal(candidate.matrixGeneralApiCandidate,true);assert.equal(candidate.form.directLogin,true);assert.equal(candidate.form.train,'13307');assert.equal(request.form.directLogin,false);
 for(const flags of [{manual:true},{directLogin:true},{brahmosLogin:true},{mode:'uilogin'}]){
  policy.prepare('app:login',[{...login,...flags}]);assert.equal(policy.prepare('app:start-booking',[request])[0],request);
 }
});
test('candidate does not change scheduled quotas, other forms or the default General policy',()=>{
 for(const enabled of [false,true])for(const quota of ['8AM','TQ','PT']){
  const policy=createBookNow(()=>{},{generalApiCandidate:enabled});policy.observe('app:get-form',[],{ok:true,data:{id:'one',journey:{quota}}});
  const login={formId:'one',mode:'weblogin'};assert.equal(policy.prepare('app:login',[login])[0],login);
  const request={formId:'one',form:{quota}};assert.equal(policy.prepare('app:start-booking',[request])[0],request);
 }
 const policy=createBookNow();policy.observe('app:get-form',[],{ok:true,data:{id:'one',journey:{quota:'GN'}}});const login={formId:'one',mode:'weblogin'};assert.equal(policy.prepare('app:login',[login])[0],login);
 const candidate=createBookNow(()=>{},{generalApiCandidate:true});const request={formId:'unloaded',form:{quota:'GN'}};assert.equal(candidate.prepare('app:start-booking',[request])[0],request);
});
test('actual recovered skip-search getter is scoped to opted-in GN; concurrent scheduled runs keep their own setting',async()=>{
 const engine=createEngine(definitions,{functionInterceptors:interceptors()}),context=engine.context(1606,null);context[1604]=false;
 const getter=engine.makeFunction('f3406',context),request={matrixGeneralApiCandidate:true,form:{quota:'GN'}};
 assert.equal(getter(),false);
 await Promise.all([
  withCandidate(async()=>{await new Promise(r=>setImmediate(r));assert.equal(getter(),true);},request,true),
  withCandidate(async()=>{await new Promise(r=>setImmediate(r));assert.equal(getter(),false);},{...request,form:{quota:'TQ'}},true),
  withCandidate(async()=>{await new Promise(r=>setImmediate(r));assert.equal(getter(),false);},request,false),
 ]);
 assert.equal(getter(),false);
});

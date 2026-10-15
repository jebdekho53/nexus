const test=require('node:test'),assert=require('node:assert/strict'),{createBookNow}=require('../src/main/runtime/book-now.cjs');
test('Auto General uses unchanged scheduled-Auto flags while preserving quota and explicit login modes',()=>{
 const policy=createBookNow();const form={id:'test',journey:{quota:'GN'}};
 policy.observe('app:get-form',['test'],{ok:true,data:form});
 const login={mode:'weblogin',formId:'test',manual:false,directLogin:false,brahmosLogin:false};
 assert.equal(policy.prepare('app:login',[login])[0],login);assert.equal(login.directLogin,false);
 const booking={formId:'test',form:{quota:'GN',directLogin:false}};
 assert.equal(policy.prepare('app:start-booking',[booking])[0],booking);assert.equal(booking.form.directLogin,false);assert.equal(booking.form.quota,'GN');
 for(const flags of [{manual:true},{directLogin:true},{brahmosLogin:true}]){const request={...login,...flags};assert.equal(policy.prepare('app:login',[request])[0],request);assert.equal(policy.prepare('app:start-booking',[booking])[0],booking);}
 const ui={...login,mode:'uilogin'};assert.equal(policy.prepare('app:login',[ui])[0],ui);assert.equal(policy.prepare('app:start-booking',[booking])[0],booking);
 for(const quota of ['8AM','TQ','PT']){policy.observe('app:get-form',['test'],{ok:true,data:{...form,journey:{quota}}});assert.equal(policy.prepare('app:login',[login])[0],login);const request={...booking,form:{quota}};assert.equal(policy.prepare('app:start-booking',[request])[0],request);}
});

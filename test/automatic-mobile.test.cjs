'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {freshMobile,prepareMobile}=require('../src/main/runtime/automatic-mobile.cjs');
test('each booking gets a fresh mobile without modifying saved account or credentials',()=>{
 const saved={account:{username:'demo',password:'fixture',mobileNumber:'9876543210'},journey:{quota:'GN'}};
 const request={formId:'one',form:saved};
 const first=prepareMobile('app:start-booking',[request])[0];
 const second=prepareMobile('app:start-booking',[first])[0];
 assert.match(first.form.mobile,/^[6-9]\d{9}$/);assert.notEqual(first.form.mobile,saved.account.mobileNumber);
 assert.notEqual(second.form.mobile,first.form.mobile);assert.equal(first.form.account.mobileNumber,first.form.mobile);
 assert.equal(saved.account.mobileNumber,'9876543210');assert.equal(second.form.account.username,'demo');assert.equal(second.form.account.password,'fixture');
});
test('flat booking jobs receive fresh contact mobile and unrelated actions remain untouched',()=>{
 const args=[{formId:'two',form:{username:'demo',mobile:'9876543210'}},'extra'];
 assert.equal(prepareMobile('app:save-form',args),args);
 const result=prepareMobile('app:start-booking',args);assert.equal(result[1],'extra');assert.notEqual(result[0].form.mobile,args[0].form.mobile);
 assert.equal(prepareMobile('app:start-booking',[]).length,0);
});
test('generated contact numbers have the required format',()=>{for(let i=0;i<100;i++)assert.match(freshMobile(),/^[6-9]\d{9}$/)});

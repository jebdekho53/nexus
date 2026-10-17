'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolvePlan}=require('../tools/qr_test_plan.cjs');
const plan=()=>({enabled:true,readyForLiveExecution:true,timezone:'Asia/Calcutta',source:'BSB',destination:'LTT',
  paymentSubmissionAllowed:false,stopAt:'rendered QR',leadMinutes:5,verifyActualAppLaunchAndAutoCountdown:true,
  passengers:[{name:'Synthetic Test Passenger',age:30,gender:'M'}],credentialFile:'synthetic-encrypted.xml',
  slots:{'08:00':{quota:'GN',formQuota:'8AM',classCode:'SL',dateOffsetDays:60,result:'pending'},
    '10:00':{quota:'TQ',classCode:'AC',journeyDate:'2026-10-19',result:'pending'},
    '11:00':{quota:'TQ',classCode:'SL',journeyDate:'2026-10-19',result:'pending'}}});
test('General date rolls by 60 calendar days and launch is five minutes early',()=>{
  const result=resolvePlan(plan(),'08:00','2026-10-18');
  assert.equal(result.journeyDate,'2026-12-17');assert.equal(result.launchAtIST,'07:55');
  assert.equal(result.formQuota,'8AM');assert.equal(result.providerQuota,'GN');
  assert.equal(result.autoCountdownRequired,true);assert.equal(result.paymentSubmissionAllowed,false);
});
test('calendar calculation crosses years and leap days without host timezone effects',()=>{
  assert.equal(resolvePlan(plan(),'08:00','2026-12-31').journeyDate,'2027-03-01');
  assert.equal(resolvePlan(plan(),'08:00','2028-01-01').journeyDate,'2028-03-01');
});
for(const [slot,time,policy]of [['10:00','09:55','AC'],['11:00','10:55','SL']])test('fixed Tatkal date and preparation '+slot,()=>{
  const result=resolvePlan(plan(),slot,'2026-10-18');
  assert.equal(result.journeyDate,'2026-10-19');assert.equal(result.launchAtIST,time);assert.equal(result.classPolicy,policy);
  assert.equal(result.formQuota,'TQ');assert.equal(result.providerQuota,'TQ');
});
test('expired fixed dates require updated instructions instead of silent retargeting',()=>{
  assert.throws(()=>resolvePlan(plan(),'10:00','2026-10-20'),/expired/);
  assert.throws(()=>resolvePlan(plan(),'11:00','2026-11-01'),/expired/);
});
for(const date of [undefined,'2026-02-30','18-10-2026','2026-1-01','invalid'])test('invalid explicit run day '+date,()=>{
  assert.throws(()=>resolvePlan(plan(),'08:00',date));
});
for(const patch of [{enabled:false},{readyForLiveExecution:false},{timezone:'UTC'},{source:'OTHER'},{destination:'OTHER'},
  {paymentSubmissionAllowed:true},{stopAt:'paid ticket'},{leadMinutes:0},{verifyActualAppLaunchAndAutoCountdown:false},
  {passengers:[]},{passengers:[{name:'',age:30,gender:'M'}]},{passengers:[{name:'Synthetic',age:0,gender:'M'}]},
  {passengers:[{name:'Synthetic',age:30,gender:'unknown'}]},{credentialFile:''}])test('invalid authorization '+JSON.stringify(patch),()=>{
  assert.throws(()=>resolvePlan({...plan(),...patch},'08:00','2026-10-18'));
});
test('GN Book now cannot accidentally stand in for General opening',()=>{
  const p=plan();p.slots['08:00'].formQuota='GN';assert.throws(()=>resolvePlan(p,'08:00','2026-10-18'),/8AM form/);
});
test('Tatkal cannot be changed to GN or the wrong class',()=>{
  const p=plan();p.slots['10:00'].quota='GN';assert.throws(()=>resolvePlan(p,'10:00','2026-10-18'),/class\/quota/);
  p.slots['10:00'].quota='TQ';p.slots['10:00'].classCode='SL';assert.throws(()=>resolvePlan(p,'10:00','2026-10-18'),/class\/quota/);
});
test('verified slot is reported so the scheduler can skip duplicate work',()=>{
  const p=plan();p.slots['08:00'].result='qr-verified';assert.equal(resolvePlan(p,'08:00','2026-10-18').alreadyVerified,true);
});
test('preflight output contains counts and authorized journey, not passenger or credential data',()=>{
  const result=resolvePlan(plan(),'08:00','2026-10-18'),text=JSON.stringify(result);
  assert.equal(result.passengerCount,1);assert.doesNotMatch(text,/Synthetic Test Passenger|synthetic-encrypted|credentialFile|passengers/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const legacy=require('./fixtures/legacy/time-helpers.legacy.cjs');
const migrated=require('../src/main/booking/time-helpers.cjs');

// The TypeScript module (src/ts/main/booking/time-helpers.ts) must behave exactly like the previous JavaScript
// implementation, which is kept as a test fixture. Both run on the same inputs; results (and thrown errors) are compared.
const outcome=run=>{try{return{value:run()};}catch(error){return{error:error.constructor.name};}};
const same=(name,...args)=>assert.deepEqual(outcome(()=>migrated[name](...args)),outcome(()=>legacy[name](...args)),name+' '+args.map(arg=>{try{return JSON.stringify(arg)??String(arg);}catch{return'<unprintable>';}}).join(', '));

test('exports the same names with the same IST offset',()=>{
  assert.deepEqual(Object.keys(migrated).filter(key=>key!=='__esModule').sort(),Object.keys(legacy).sort());
  assert.equal(migrated.IST_OFFSET_MS,legacy.IST_OFFSET_MS);
  assert.equal(migrated.IST_OFFSET_MS,5.5*3600000);
});

const sequence=values=>{let index=0;return()=>values[index++%values.length];};

test('random helpers consume the random source identically',()=>{
  for(const r of[0,0.0001,0.5,0.999999]) {
    for(const[min,max]of[[0,10],[5,5],[100,300],[-5,5],[3,1]])assert.equal(migrated.randomBetween(min,max,()=>r),legacy.randomBetween(min,max,()=>r));
    for(const list of[['a','b','c'],[1],[]])assert.equal(migrated.pickRandom(list,()=>r),legacy.pickRandom(list,()=>r));
    assert.equal(migrated.referenceNumber(()=>r),legacy.referenceNumber(()=>r));
  }
  const calls=[];
  migrated.randomBetween(1,9,()=>{calls.push('x');return 0.3;});
  assert.equal(calls.length,1);
  assert.equal(migrated.referenceNumber(()=>0.123456789),legacy.referenceNumber(()=>0.123456789));
  assert.match(migrated.referenceNumber(),/^REF-[0-9A-Z]{0,8}$/);
  const a=sequence([0.1,0.9]),b=sequence([0.1,0.9]);
  assert.deepEqual([migrated.pickRandom([1,2,3,4],a),migrated.pickRandom([1,2,3,4],a)],[legacy.pickRandom([1,2,3,4],b),legacy.pickRandom([1,2,3,4],b)]);
});

test('pickStep clamps the position and falls back to 35',()=>{
  const lists=[[],[10],[10,20,30],[10,'x',30],[10,NaN,30],[10,undefined],[10,null,Infinity],[10,'20']];
  for(const list of lists)for(const position of[-3,0,1,2,3,4,99,1.5,NaN])same('pickStep',list,position);
  assert.equal(migrated.pickStep([],1),35);
  assert.equal(migrated.pickStep([10,20],99),20);
});

test('errorText reads strings and error-like objects',()=>{
  const values=['text','',null,undefined,0,false,12,[],['a'],{},{error:'e'},{error:5},{error_description:'d',errorMessage:'m',errorMsg:'g',error:'e'},{errorMsg:'only'},{error:{nested:true}},{errorMessage:''}];
  for(const value of values)same('errorText',value);
  assert.equal(migrated.errorText({error_description:'d',errorMessage:'m',errorMsg:'g',error:'e'}),'d m g e');
});

test('describeFailure maps statuses and message text',()=>{
  const deps=extra=>({messageOf:text=>String(text??''),duplicateLoginMessage:()=>'duplicate',...extra});
  const log=[];
  const watched=side=>({messageOf:text=>{side.push(['message',text]);return String(text??'');},duplicateLoginMessage:()=>{side.push(['dup']);return'duplicate';}});
  for(const status of[200,400,401,403,404,409,429,500,0,undefined])
    for(const text of['','plain','invalid_token','Invalid Access Token here',null,'x'])same('describeFailure',status,text,deps());
  const sideA=[],sideB=[];
  for(const status of[401,403,409,500]) {
    assert.equal(migrated.describeFailure(status,'hello',watched(sideA)),legacy.describeFailure(status,'hello',watched(sideB)));
  }
  assert.deepEqual(sideA,sideB);
  assert.equal(migrated.describeFailure(500,'',deps()),'error 500');
  assert.equal(migrated.describeFailure(401,'',deps()),'session expired (invalid token) — re-login & retry');
  assert.equal(migrated.describeFailure(403,'',deps()),'access blocked by the Provider (403)');
  log.length=0;
});

test('quotaFamily groups quotas and classes',()=>{
  const ac=new Set(['1A','2A','3A','CC']);
  const reads=[];
  const deps=()=>({acClasses:()=>{reads.push(1);return ac;}});
  for(const quota of['8AM','LD','SS','TQ','PT','GN','','tq',undefined])
    for(const classCode of['3A','3a','SL','',null,undefined,'cc'])same('quotaFamily',quota,classCode,deps());
  // acClasses is only consulted for tatkal quotas
  reads.length=0;
  migrated.quotaFamily('GN','3A',deps());migrated.quotaFamily('8AM','3A',deps());
  assert.equal(reads.length,0);
  migrated.quotaFamily('TQ','3A',deps());
  assert.equal(reads.length,1);
  assert.equal(migrated.quotaFamily('PT','sl',deps()),'slTatkal');
  assert.equal(migrated.quotaFamily('TQ','3a',deps()),'acTatkal');
});

test('parseClockTime validates hour and minute and defaults second/millisecond',()=>{
  const values=[
    {hour:0,minute:0},{hour:23,minute:59},{hour:24,minute:0},{hour:-1,minute:0},{hour:10,minute:60},{hour:'10',minute:'5'},{hour:'',minute:''},
    {hour:10.5,minute:1},{hour:10,minute:1,second:30,millisecond:500},{hour:10,minute:1,second:60,millisecond:1000},{hour:10,minute:1,second:-1,millisecond:-1},
    {hour:10,minute:1,second:'7',millisecond:'9'},{hour:10,minute:1,second:null},{hour:null,minute:5},{hour:undefined,minute:5},{hour:10},{},[],[1],
    null,undefined,0,'10:00',true,()=>1,{hour:'abc',minute:1},{hour:true,minute:false},{hour:1e3,minute:1},{hour:10,minute:1,second:59.5},
  ];
  for(const value of values)same('parseClockTime',value);
  assert.deepEqual(migrated.parseClockTime({hour:9,minute:5}),{hour:9,minute:5,second:0,millisecond:0});
  assert.equal(migrated.parseClockTime(null),null);
});

test('formatIstClock prints IST wall time',()=>{
  const times=[0,1,999,1000,86399999,Date.UTC(2024,1,29,18,29,59,999),Date.UTC(2024,1,29,18,30,0,0),Date.UTC(2025,11,31,23,59,59,999),-1,NaN,Infinity,1.5e12];
  for(const time of times)same('formatIstClock',time);
  assert.equal(migrated.formatIstClock(Date.UTC(2024,0,1,4,30,5,7)),'10:00:05.007');
});

test('parseServerTimestamp assumes IST when no zone is present',()=>{
  const values=['2024-05-01 10:00:00','2024-05-01T10:00:00','2024-05-01T10:00:00Z','2024-05-01T10:00:00+05:30','2024-05-01T10:00:00+0530','2024-05-01T10:00:00-04:00','  2024-05-01 10:00:00.123  ','','   ','garbage','2024-13-45 99:99:99',undefined,null,0,{},['2024-05-01'],'2024-05-01','1700000000000'];
  for(const value of values)same('parseServerTimestamp',value);
  assert.equal(migrated.parseServerTimestamp('2024-05-01 10:00:00'),Date.UTC(2024,4,1,4,30,0));
  assert.equal(migrated.parseServerTimestamp(''),null);
});

test('istDayAt resolves a clock time on the IST day containing a timestamp',()=>{
  const days=[0,Date.UTC(2024,1,29,18,29,59),Date.UTC(2024,1,29,18,30,0),Date.UTC(2024,11,31,12),NaN,-86400000];
  const times=[{hour:10,minute:0},{hour:0,minute:0,second:0,millisecond:0},{hour:23,minute:59,second:59,millisecond:999},{hour:10,minute:0,second:null,millisecond:null},{hour:10,minute:0,second:undefined},{hour:8,minute:30,second:15}];
  for(const day of days)for(const time of times)same('istDayAt',day,time);
  assert.equal(migrated.istDayAt(Date.UTC(2024,0,1,20,0),{hour:10,minute:0}),Date.UTC(2024,0,2,4,30));
});

test('preview truncates long JSON unless full',()=>{
  const long={text:'x'.repeat(30000)};
  const circular={};circular.self=circular;
  const values=['plain','',null,undefined,0,12,false,{a:1},[1,2],long,'y'.repeat(20001),'y'.repeat(20000),circular,()=>1,BigInt?1n:0,Symbol('s')];
  for(const value of values)for(const full of[undefined,false,true])same('preview',value,full);
  assert.equal(migrated.preview('y'.repeat(20001)),'y'.repeat(20000)+'…');
  assert.equal(migrated.preview(circular),'');
  assert.equal(migrated.preview('y'.repeat(20001),true).length,20001);
});

test('maskedKey keeps the last four digits',()=>{
  for(const value of['1234567890','12-34','abcd','',null,undefined,'a1b2c3d4e5'])same('maskedKey','p',value);
  assert.equal(migrated.maskedKey('card','4111 1111 1111 1234'),'card|1234');
  assert.equal(migrated.maskedKey('x',undefined),'x|');
});

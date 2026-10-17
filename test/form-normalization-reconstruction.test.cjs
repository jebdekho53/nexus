'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');
const {HOLE}=require('../src/main/runtime/engine.cjs');

function setup(native,o={}) {
  const trace=[];
  const call=(name,fn)=>(...args)=>{trace.push([name,...args]);if(o.fail===name)throw new Error('synthetic '+name);return fn(...args);};
  const slots={327:'f487',297:call('object',v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v)),
    298:call('string',v=>typeof v==='string'?v:''),281:call('label',(route,user)=>route+' ['+user+']'),
    299:call('enum',(choices,v,fallback)=>typeof v==='string'&&choices.includes(v)?v:fallback),
    295:['GN','TQ','PT'],294:['SL','3A','2A'],296:['paytm','phonepay','wallet'],
    300:call('fare',v=>v),301:call('racers',v=>v),317:call('method',v=>v==='phonepe'?'phonepay':v),
    319:call('passenger',(v,index,all)=>({raw:v,index,count:all.length}))};
  for(const slot of o.holes??[])slots[slot]=HOLE;
  const h=harness({native,slots});return {...h,trace};
}
function check(name,value,o={}) {
  test('form normalization matches recovered: '+name,async()=>{
    await compare(async native=>{const h=setup(native,o);return {result:await outcome(()=>h.rootFunction('f472')(value,'id',1234)),trace:h.trace};});
  });
}
const flat=()=>({label:'Trip',username:'synthetic',password:'synthetic-only',mobileNumber:'0000000000',fromStation:'AAA',toStation:'BBB',trainNumber:'12345',
  journeyDate:'2026-11-01',coach:'3A',quota:'GN',boardingStation:'CCC',paymentMethod:'paytm',upiId:'synthetic@example',fareLimit:'500',racers:3,
  passengers:[{name:'Synthetic'}],timing:{test:1},manual:true});
const nested=()=>({label:'Nested',account:{username:'nested',password:'synthetic-only',mobileNumber:'0000000000'},
  journey:{origin:'DDD',destination:'EEE',trainNumber:'54321',journeyDate:'2026-11-02',boardingStation:'FFF',quota:'PT',classCode:'2A',specialTrain:true},
  options:{bookOnlyIfConfirmed:false,travelInsurance:false,fareLimit:1000,autoOtpSync:true,racers:2},
  payment:{method:'phonepe',upiId:'synthetic@example',paymentPause:true,card:{number:'test',expiry:'test',cvv:'test',staticPassword:'test',holderName:'Synthetic'}},
  proxy:{enabled:true,host:'proxy.invalid',port:'1234',username:'synthetic',password:'synthetic-only'},passengers:[{},{}],timing:{test:2},
  manualLogin:true,directLogin:true,brahmosLogin:true,railBrahmos:true,loginMode:'weblogin',browserProvider:'chrome'});

for(const v of [undefined,null,false,0,1,'', 'x',[],{},flat(),nested(),{...flat(),...nested()}])check('input '+JSON.stringify(v),v);
for(const field of ['account','journey','options','payment','proxy','timing','passengers'])for(const v of [undefined,null,false,0,'',[],{},['x']])
  check('nested shape '+field+' '+JSON.stringify(v),{...flat(),[field]:v});
for(const [group,key,legacy]of [['account','username','username'],['account','password','password'],['account','mobileNumber','mobileNumber'],
  ['journey','origin','fromStation'],['journey','destination','toStation'],['journey','trainNumber','trainNumber'],['journey','journeyDate','journeyDate'],
  ['journey','boardingStation','boardingStation'],['journey','quota','quota'],['journey','classCode','coach'],['options','fareLimit','fareLimit'],
  ['options','racers','racers'],['payment','method','paymentMethod'],['payment','upiId','upiId']])
  for(const v of [undefined,null,'',0,false,'value'])check('precedence '+group+'.'+key+' '+String(v),{...flat(),[group]:{[key]:v},[legacy]:'legacy'});
for(const [group,key,legacy]of [['options','bookOnlyIfConfirmed','bookOnlyIfCnf'],['options','travelInsurance','travelInsurance'],
  ['options','autoOtpSync','autoOtpSync'],['journey','specialTrain','specialTrain'],['payment','paymentPause','stopPayEnabled']])
  for(const v of [true,false,0,1,'true',null,undefined])check('flag '+key+' '+String(v),{...flat(),[group]:{[key]:v},[legacy]:true});
for(const key of ['manualLogin','manual','brahmosLogin','railBrahmos','directLogin'])for(const v of [true,false,1,'true',null,undefined])
  check('top flag '+key+' '+String(v),{...flat(),[key]:v});
for(const v of ['adspower','comet','brahmos','chrome','brave-beta','fingerprint','gologin','unknown',null,0])
  check('provider '+String(v),{...flat(),browserProvider:v});
for(const v of ['railone','weblogin','uilogin','auto','unknown',null])check('login mode '+String(v),{...flat(),loginMode:v});
for(const v of [null,undefined,false,0,[],{},nested().payment.card])check('card '+JSON.stringify(v),{...flat(),payment:{card:v}});
for(const v of ['','Title',null,123])check('label '+v,{...flat(),label:v});
for(const proxy of [{user:'alias',pass:'alias-pass'},{username:'',user:'alias',password:'',pass:'alias-pass'},
  {username:null,user:'alias',password:null,pass:'alias-pass'}])check('proxy aliases '+JSON.stringify(proxy),{...flat(),proxy});
for(const fail of ['object','string','label','enum','fare','racers','method','passenger'])check('dependency failure '+fail,{...nested(),label:''},{fail});
for(const slot of [294,295,296])check('uninitialized enum '+slot,nested(),{holes:[slot]});

for(const id of ['f449','f450','f452','f453'])for(const v of [undefined,null,false,true,0,-1,0.5,1,4,5,Infinity,NaN,'','  ','5','5x','-20','₹1,234.50','1.2.3',[],{},new Date(0)]) {
  test('normalization primitive '+id+' '+String(v),async()=>{
    await compare(async native=>{const h=harness({native});return outcome(()=>h.rootFunction(id)(v));});
  });
}
for(const v of ['GN','TQ','bad',0,null,undefined])test('enum helper '+String(v),async()=>{
  await compare(async native=>harness({native}).rootFunction('f451')(['GN','TQ'],v,'fallback'));
});
test('default models do not share mutable arrays or objects',()=>{
  const h=harness({native:true}),create=h.rootFunction('f487'),a=create('a',1),b=create('b',2);
  a.passengers.push({name:'Synthetic'});a.journey.origin='changed';
  assert.deepEqual(b.passengers,[]);assert.equal(b.journey.origin,'');assert.equal(b.id,'b');
});
test('normalizer computes complete nested output, not matching errors',()=>{
  const h=setup(true),result=h.rootFunction('f472')(nested(),'new-id',42);
  assert.equal(result.id,'new-id');assert.equal(result.createdAt,42);assert.equal(result.account.username,'nested');
  assert.equal(result.journey.origin,'DDD');assert.equal(result.journey.quota,'PT');
  assert.equal(result.payment.method,'phonepay');assert.equal(result.options.travelInsurance,false);
  assert.equal(result.proxy.enabled,false);assert.equal(result.passengers.length,2);
});

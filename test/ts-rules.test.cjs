'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const legacy=require('./fixtures/legacy/rules.legacy.cjs');
const migrated=require('../src/main/booking/rules.cjs');

// src/ts/main/booking/rules.ts versus the previous JavaScript (kept as a fixture): same inputs, same results,
// same dependency reads in the same order.
const safe=arg=>{try{return JSON.stringify(arg)??String(arg);}catch{return'<unprintable>';}};
const outcome=run=>{try{return{value:run()};}catch(error){return{error:error.constructor.name};}};
const same=(name,make)=>{
  const a=[],b=[];
  assert.deepEqual(outcome(()=>make(migrated,a)),outcome(()=>make(legacy,b)),name);
  assert.deepEqual(a,b,name+' (dependency reads)');
  return outcome(()=>make(migrated,[]));
};

test('exports the same names',()=>{
  assert.deepEqual(Object.keys(migrated).filter(key=>key!=='__esModule').sort(),Object.keys(legacy).sort());
});

test('proxy records',()=>{
  const records=[{host:'h'},{host:'h',port:80},{host:'h',port:'8080',username:'u',password:'p'},{host:'h',port:0,username:'',password:''},{host:'h',label:'  Lab  '},{host:'h',label:'   ',port:1},{host:'h',label:null},{host:'h',label:'',port:'9'}];
  for(const record of records){same('proxySettings '+safe(record),module_=>module_.proxySettings(record));same('proxyLabel '+safe(record),module_=>module_.proxyLabel(record));}
  assert.equal(migrated.proxySettings({host:'h',port:80}).server,'h:80');
  const forms=[null,undefined,{},{enabled:false,host:'h'},{enabled:true},{enabled:true,host:'  '},{enabled:true,host:' h '},{enabled:true,host:'h',port:' 80 ',username:'u',password:'p'},{enabled:true,host:'h',port:'  '},{enabled:1,host:'h',port:null,username:'',password:''},{enabled:'yes',host:'h'}];
  for(const form of forms)same('proxyFromConfig '+safe(form),module_=>module_.proxyFromConfig(form));
  assert.equal(migrated.proxyFromConfig({enabled:true,host:' h ',port:' 80 '}).server,'h:80');
  assert.equal(migrated.proxyFromConfig({enabled:false,host:'h'}),undefined);
});

test('senior citizens and lower berths',()=>{
  for(const gender of['M','F','m','',undefined,null,'X'])for(const age of[0,5,57,58,59,60,61,NaN,'60',undefined])same('senior '+safe([gender,age]),module_=>module_.isSeniorCitizen(gender,age));
  assert.equal(migrated.isSeniorCitizen('F',58),true);
  assert.equal(migrated.isSeniorCitizen('M',59),false);
  const passengers=[];
  for(const age of[undefined,null,'',0,1,4,5,30,57,58,60,'4','abc',NaN,-3])
    for(const gender of['M','F',undefined,null,'T'])
      for(const berthPreference of[undefined,null,'',' ','LB','lb',' lb ','UB','SU','No Preference'])
        for(const childBerth of[undefined,false,true,0])passengers.push({age,gender,berthPreference,childBerth});
  for(const passenger of passengers)same('countsAsLowerBerth '+safe(passenger),(module_)=>module_.countsAsLowerBerth(passenger));
  const reads=[];
  same('injected senior',(module_,log)=>module_.countsAsLowerBerth({berthPreference:'',gender:'F',age:3},{isSenior:(g,a)=>{log.push([g,a]);return true;}}));
  same('children without a berth never count',(module_,log)=>module_.countsAsLowerBerth({age:4,childBerth:false,berthPreference:'LB'},{isSenior:()=>{log.push('read');return true;}}));
  assert.equal(migrated.countsAsLowerBerth({age:4,childBerth:false,berthPreference:'LB'}),false);
  assert.equal(migrated.countsAsLowerBerth({age:4,childBerth:true,berthPreference:'LB'}),true);
  assert.equal(migrated.countsAsLowerBerth({gender:'M',age:60}),true);
  assert.equal(migrated.countsAsLowerBerth({gender:'M',age:60,berthPreference:'UB'}),false);
  void reads;
  const list=[{a:1},{a:2},{a:3},{a:4}];
  same('countLowerBerths',(module_,log)=>module_.countLowerBerths(list,{counts:p=>{log.push(p.a);return p.a%2===0;}}));
  assert.equal(migrated.countLowerBerths(list,{counts:p=>p.a>1}),3);
  assert.equal(migrated.countLowerBerths([],{counts:()=>true}),0);
});

test('lowerBerthWarning reads the limit lazily',()=>{
  for(const lower of[0,1,2,3,6])for(const limit of[0,2,4,6])
    same('warning '+lower+'/'+limit,(module_,log)=>module_.lowerBerthWarning(['p'],{countLower:()=>{log.push('count');return lower;},limit:()=>{log.push('limit');return limit;}}));
  assert.equal(migrated.lowerBerthWarning([],{countLower:()=>2,limit:()=>2}),null);
  assert.match(migrated.lowerBerthWarning([],{countLower:()=>3,limit:()=>2}),/^Only 2 lower berths are allowed per booking — this form has 3\./);
});

test('opening times and availability times',()=>{
  const defaults=()=>({eightAm:{hour:8,minute:0},acTatkal:{hour:10,minute:0},slTatkal:{hour:11,minute:0}});
  const stored=[null,undefined,{},{default:{}},{default:{eightAm:{hour:9,minute:5},acTatkal:'bad',slTatkal:{hour:25,minute:0}}},{default:{eightAm:{hour:9,minute:5,second:3,millisecond:2},acTatkal:{hour:0,minute:0},slTatkal:{hour:12,minute:30}}},{default:null}];
  for(const value of stored)same('openingTimes '+safe(value),(module_,log)=>module_.openingTimes(value,{defaults:()=>{log.push('defaults');return defaults();}}));
  same('openingTimes parse injected',(module_,log)=>module_.openingTimes({default:{eightAm:1,acTatkal:2,slTatkal:3}},{parse:v=>{log.push(v);return v===2?null:v*10;},defaults:()=>({eightAm:'d1',acTatkal:'d2',slTatkal:'d3'})}));
  for(const falsy of[0,'',false])
    assert.deepEqual(same('openingTimes falsy '+safe(falsy),(module_,log)=>module_.openingTimes({default:{eightAm:1,acTatkal:1,slTatkal:1}},{parse:()=>falsy,defaults:()=>({eightAm:'d',acTatkal:'d',slTatkal:'d'})})).value.eightAm,falsy);
  assert.deepEqual(migrated.openingTimes({default:{eightAm:{hour:9,minute:5}}},{defaults}),{eightAm:{hour:9,minute:5,second:0,millisecond:0},acTatkal:{hour:10,minute:0},slTatkal:{hour:11,minute:0}});

  const configs=[null,undefined,{},{availabilityEpoch:1},{availabilityEpoch:2,availTimes:{default:{eightAm:{hour:1,minute:1}}}},{availTimes:{default:{eightAm:{hour:1,minute:1}},special:{eightAm:{hour:2,minute:2}}}}];
  for(const config of configs)for(const epoch of[undefined,null,0,1,2,'x'])same('withAvailabilityEpoch '+safe([config,epoch]),module_=>module_.withAvailabilityEpoch(config,epoch));
  const original={availabilityEpoch:1,availTimes:{default:{}}};
  assert.equal(migrated.withAvailabilityEpoch(original,1),original);
  assert.deepEqual(migrated.withAvailabilityEpoch({availabilityEpoch:1,availTimes:{default:{}},other:true},2),{availabilityEpoch:2,other:true});
  const mutationProbe={availabilityEpoch:1,availTimes:{default:{}}};
  migrated.withAvailabilityEpoch(mutationProbe,2);
  assert.deepEqual(mutationProbe,{availabilityEpoch:1,availTimes:{default:{}}});

  const families=['eightAm','acTatkal','slTatkal'];
  const state=[null,undefined,{},{availabilityEpoch:1,availTimes:{default:{eightAm:{hour:5,minute:5}}}},{availabilityEpoch:2,availTimes:{default:{eightAm:{hour:5,minute:5}}}},{availTimes:{default:{eightAm:{hour:5,minute:5}}}}];
  const currents=[{},{availabilityEpoch:1},{availabilityEpoch:2},{availTimes:{default:{eightAm:{hour:3,minute:3},acTatkal:{hour:4,minute:4}},special:{eightAm:{hour:6,minute:6},slTatkal:'bad'}}},{availabilityEpoch:1,availTimes:{default:{eightAm:{hour:3,minute:3}},special:{eightAm:{hour:6,minute:6}}}}];
  for(const s of state)for(const c of currents)for(const family of families) {
    same('storedAvailabilityTime '+safe([s,c,family]),module_=>module_.storedAvailabilityTime(s,c,family));
    for(const special of[false,true,undefined,0,'x'])same('availabilityTime '+safe([s,c,family,special]),module_=>module_.availabilityTime(s,c,family,special));
  }
  same('availabilityTime injected',(module_,log)=>module_.availabilityTime({},{availTimes:{default:{eightAm:'dflt'}}},'eightAm',false,{parse:v=>{log.push(['parse',v]);return v==='found'?1:null;},lookup:(a,b,c)=>{log.push(['lookup',c]);return'found';}}));
  same('availabilityTime injected unresolved',(module_,log)=>module_.availabilityTime({},{availTimes:{default:{eightAm:'dflt'}}},'eightAm',false,{parse:v=>{log.push(['parse',v]);return null;},lookup:()=>{log.push('lookup');return'x';}}));
  for(const falsy of[0,'',false]) {
    assert.equal(same('availabilityTime special falsy '+safe(falsy),(module_,log)=>module_.availabilityTime({},{availTimes:{default:{eightAm:'dflt'},special:{eightAm:'x'}}},'eightAm',true,{parse:()=>falsy})).value,falsy);
    assert.equal(same('availabilityTime stored falsy '+safe(falsy),(module_,log)=>module_.availabilityTime({},{availTimes:{default:{eightAm:'dflt'}}},'eightAm',false,{parse:()=>falsy,lookup:()=>'stored'})).value,falsy);
  }
  for(const flag of[true,false,1,'true',undefined])for(const minute of[0,599,600,601])same('beforeCutoff '+safe([flag,minute]),(module_,log)=>module_.beforeCutoff(flag,minute,{cutoff:()=>{log.push('cutoff');return 600;}}));
  assert.equal(migrated.beforeCutoff(true,600,{cutoff:()=>600}),false);
  assert.equal(migrated.beforeCutoff(true,599,{cutoff:()=>600}),true);
});

test('labels, lists and login modes',()=>{
  for(const name of['Rajdhani','  Rajdhani Express ','',null,undefined,'Delhi'])for(const detail of['','  ',null,undefined,'NDLS','two words','Raj','dhani',' NDLS '])same('joinLabel '+safe([name,detail]),module_=>module_.joinLabel(name,detail));
  assert.equal(migrated.joinLabel('Rajdhani','NDLS'),'Rajdhani · NDLS');
  assert.equal(migrated.joinLabel('Rajdhani','two words'),'Rajdhani');
  same('listIncludes',module_=>[module_.listIncludes(['a','b'],'a'),module_.listIncludes([],'a'),module_.listIncludes(['a'],undefined)]);
  for(const config of[null,undefined,{},{railBrahmos:true},{railBrahmos:1},{railBrahmos:'true'}])for(const included of[true,false])same('railBrahmosKind',(module_,log)=>module_.railBrahmosKind(config,'L',{includes:l=>{log.push(l);return included;}}));
  const options=[null,undefined,{},{manualLogin:true},{manualLogin:1},{brahmosLogin:true},{directLogin:true},{manualLogin:true,brahmosLogin:true,directLogin:true},{brahmosLogin:true,directLogin:true},{manualLogin:'true'},{manualLogin:false,brahmosLogin:false,directLogin:false}];
  for(const option of options)same('loginMode '+safe(option),(module_,log)=>module_.loginMode(option,{brahmosMode:()=>{log.push('brahmos');return'brahmos';}}));
  for(const mode of['manual','direct','brahmos','auto',undefined,null,'other'])same('loginFlags '+safe(mode),(module_,log)=>module_.loginFlags(mode,{brahmosMode:()=>{log.push('brahmos');return'brahmos';}}));
  assert.deepEqual(migrated.loginFlags('brahmos',{brahmosMode:()=>'brahmos'}),{manualLogin:false,directLogin:true,brahmosLogin:true});
  for(const mode of['a','b','z',undefined])for(const list of[[],['a','b'],['b'],['z']])same('allowedMode '+safe([mode,list]),(module_,log)=>module_.allowedMode(mode,list,{defaults:()=>{log.push('defaults');return new Set(['a','c']);}}));
  for(const mode of['railone','uilogin','manual',undefined])
    same('modeDispatch '+safe(mode),(module_,log)=>module_.modeDispatch(mode,{cfg:1},new Set(['x','y']),{railKind:(c,a)=>{log.push(['rail',c,[...a]]);return'rail';},loginModeOf:c=>{log.push(['login',c]);return'auto';},allowedModeOf:(m,l)=>{log.push(['allowed',m,l]);return'picked';}}));
});

test('value coercion helpers',()=>{
  const values=[undefined,null,0,1,-1,3.7,NaN,Infinity,'','0','7','7.9','abc','₹1,234.50','  12  ','1e3','-5','0x10',true,false,[],[1],{},{a:1},'4 passengers','9','00'];
  for(const value of values) {
    same('isPlainObject '+safe(value),module_=>module_.isPlainObject(value));
    same('stringOr '+safe(value),module_=>[module_.stringOr(value),module_.stringOr(value,'fb')]);
    same('positiveAmount '+safe(value),module_=>module_.positiveAmount(value));
    same('passengerCount '+safe(value),module_=>module_.passengerCount(value));
    same('memberOr '+safe(value),module_=>[module_.memberOr('abc',value,'fb'),module_.memberOr(['a','bc'],value,'fb'),module_.memberOr('',value,null)]);
  }
  assert.equal(migrated.positiveAmount('₹1,234.50'),1234.5);
  assert.equal(migrated.positiveAmount('0'),undefined);
  assert.equal(migrated.passengerCount('9'),4);
  assert.equal(migrated.passengerCount(0),1);
  assert.equal(migrated.passengerCount('x'),1);
  assert.equal(migrated.memberOr('abc','b','fb'),'b');
});

test('quota families and booking windows',()=>{
  const reads=[];
  for(const quota of['8AM','8am','ld','SS','TQ','tq','PT','pt','GN','',null,undefined,'Tatkal'])
    for(const classCode of['3A','3a','SL','',null,undefined])
      same('quotaFamilyCaseless '+safe([quota,classCode]),(module_,log)=>module_.quotaFamilyCaseless(quota,classCode,{acClasses:()=>{log.push('ac');return new Set(['3A','2A']);}}));
  void reads;
  const opening={eightAm:{h:8,m:0,label:'08:00'},acTatkal:{h:10,m:0,label:'10:00'},slTatkal:{h:11,m:30,label:'11:30'}};
  const day=Date.UTC(2024,4,1,0,0,0);
  const nows=[day,day+3*3600000,day+4.5*3600000,day+4.5*3600000+1,day+5*3600000,day+6*3600000,day+22*3600000,NaN];
  for(const now of nows)for(const name of[null,'eightAm','acTatkal','slTatkal'])
    same('bookingWindow '+safe([now,name]),(module_,log)=>module_.bookingWindow('Q','C',now,{family:(q,c)=>{log.push([q,c]);return name;},openingTimes:()=>{log.push('opening');return opening;}}));
  assert.deepEqual(migrated.bookingWindow('TQ','3A',day+3*3600000,{family:()=>'acTatkal',openingTimes:()=>opening}),{open:false,opensAtLabel:'10:00'});
  assert.deepEqual(migrated.bookingWindow('GN','3A',day,{family:()=>null,openingTimes:()=>assert.fail('not read')}),{open:true});
  const premium=new Set(['12951','22222']);
  for(const number of['12951',' 12951 ','99999','',null,undefined,'22222 '])
    for(const name of['Mumbai Rajdhani','VANDE BHARAT','Tejas Express','Local','',null,undefined,'Gatimaan','Shatabdi'])
      same('isPremiumTrain '+safe([number,name]),(module_,log)=>module_.isPremiumTrain(number,name,{premiumNumbers:()=>{log.push('numbers');return premium;}}));
  assert.equal(migrated.isPremiumTrain('1','Vande Bharat',{premiumNumbers:()=>assert.fail('name match must not read the number list')}),true);
});

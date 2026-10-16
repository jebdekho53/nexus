'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');

// Root-level pure helpers of the booking form model, compared with the recovered functions on many inputs.
const slots={
  267:2,268:'f427',269:'f428',270:'f429',272:{eightAm:{hour:8,minute:0},acTatkal:{hour:10,minute:0},slTatkal:{hour:11,minute:0}},273:'f432',277:'f436',278:540,
  282:['auto','manual','direct'],283:'brahmos',286:'f440',287:'f441',289:'f444',291:'f446',
};
function check(id,inputs,extraSlots={}) {
  return Promise.all(inputs.map(args=>compare(async native=>{
    const{rootFunction}=harness({native,slots:{...slots,...extraSlots}});
    return outcome(async()=>rootFunction(id)(...args));
  })));
}
const passengers=(...specs)=>specs.map(([gender,age,berthPreference,childBerth])=>({gender,age,berthPreference,childBerth}));

test('proxySettings (f425)',()=>check('f425',[[{host:'h',port:8080,username:'u',password:'p'}],[{host:'h'}],[{host:'h',port:'',username:'',password:''}],[{host:'h',port:0}],[{host:'h',port:'9'}],[{}],[null]]));
test('proxyLabel (f426)',()=>check('f426',[[{label:' Home ',host:'h'}],[{label:'  ',host:'h',port:80}],[{host:'h',port:80}],[{host:'h'}],[{label:'x',host:'h'}],[{label:5,host:'h'}],[{}],[null]]));
test('isSeniorCitizen (f427)',()=>check('f427',[['M',60],['M',59],['F',58],['F',57],['T',99],['m',70],[undefined,undefined],['M','61'],['F',null]]));
test('countsAsLowerBerth (f428)',()=>check('f428',[[{age:30,berthPreference:'LB'}],[{age:30,berthPreference:' lb '}],[{age:30,berthPreference:'UB'}],[{age:30}],[{age:30,berthPreference:''}],[{age:2,berthPreference:'LB',childBerth:false}],[{age:2,berthPreference:'LB',childBerth:true}],[{age:5,berthPreference:'LB',childBerth:false}],
  [{age:62,gender:'M',berthPreference:'SL'}],[{age:57,gender:'F',berthPreference:'SL'}],[{age:'61',gender:'M',berthPreference:'MB'}],[{age:'x',gender:'F',berthPreference:'MB'}],[{age:-1,berthPreference:'LB'}],[{}]]));
test('countLowerBerths (f429)',()=>check('f429',[[passengers(['M',30,'LB'],['F',30,'LB'],['M',30,'UB'])],[[]],[passengers(['M',70,'SU'],['F',58,'SU'],['F',40,'SU'])],[passengers(['M',30],['M',30,''])]]));
test('lowerBerthWarning (f431)',()=>check('f431',[[passengers(['M',30,'LB'],['F',30,'LB'])],[passengers(['M',30,'LB'],['F',30,'LB'],['M',30,'LB'])],[[]],[passengers(['M',65,'SU'],['F',60,'SU'],['M',30,'LB'],['F',20,'LB'])]]));
test('openingTimes (f433)',()=>check('f433',[[undefined],[null],[{default:{eightAm:{hour:7,minute:30},acTatkal:{hour:99,minute:0}}}],[{default:{slTatkal:{hour:'12',minute:'05',second:'3'}}}],[{default:null}],[{}],[{default:{eightAm:'08:00'}}]]));
test('withAvailabilityEpoch (f435)',()=>check('f435',[[{availabilityEpoch:'e1',availTimes:{a:1},x:2},'e1'],[{availabilityEpoch:'e1',availTimes:{a:1},x:2},'e2'],[{availTimes:{a:1}},'e2'],[undefined,'e2'],[null,'e2'],[{x:1},''],[{x:1},undefined],[{x:1}, 0],[{availTimes:1},'e']]));
test('storedAvailabilityTime (f436)',()=>check('f436',[[{availabilityEpoch:'e',availTimes:{default:{k:5}}},{availabilityEpoch:'e'},'k'],[{availabilityEpoch:'x',availTimes:{default:{k:5}}},{availabilityEpoch:'e'},'k'],[{availTimes:{default:{k:5}}},{},'k'],[undefined,{},'k'],[undefined,{availabilityEpoch:'e'},'k'],[{availTimes:{}},{},'k'],[{availTimes:{default:null}},{},'k']]));
test('beforeCutoff (f437)',()=>check('f437',[[true,0],[true,539],[true,540],[true,541],[false,0],[1,5],[undefined,'100'],[true,NaN],[true,undefined]]));
const cur=(special,def)=>({availTimes:{special,default:def}});
test('availabilityTime (f438)',()=>check('f438',[
  [undefined,cur({k:{hour:9,minute:5}},{k:{hour:1,minute:1}}),'k',true],[undefined,cur({k:{hour:99,minute:5}},{k:{hour:1,minute:1}}),'k',true],[undefined,cur({},{k:{hour:1,minute:1}}),'k',true],[undefined,cur(undefined,undefined),'k',true],
  [undefined,{availabilityEpoch:'e',...cur({},{k:{hour:2,minute:2}})},'k',false],[{availabilityEpoch:'e',availTimes:{default:{k:{hour:3,minute:3}}}},{availabilityEpoch:'e',...cur({},{k:{hour:2,minute:2}})},'k',false],
  [{availabilityEpoch:'x',availTimes:{default:{k:{hour:3,minute:3}}}},{availabilityEpoch:'e',...cur({},{k:{hour:2,minute:2}})},'k',false],[{availTimes:{default:{k:'bad'}}},cur({},{k:7}),'k',0],[undefined,undefined,'k',false],[undefined,undefined,'k',true],
]));
test('joinLabel (f439)',()=>check('f439',[['IRCTC','web'],['IRCTC web','web'],['IRCTC','two words'],['IRCTC',''],['IRCTC',undefined],[undefined,'x'],[' a ',' b '],['','b'],['abc','b'],[null,null]]));
test('listIncludes (f440)',()=>check('f440',[[['brahmos']],[['a','b']],[[]],[undefined]]));
test('railBrahmosKind (f441)',()=>check('f441',[[{railBrahmos:true},['brahmos']],[{railBrahmos:true},['a']],[{railBrahmos:false},['brahmos']],[undefined,['brahmos']],[{railBrahmos:'yes'},['brahmos']],[{railBrahmos:true},undefined]]));
test('loginMode (f444)',()=>check('f444',[[{manualLogin:true}],[{brahmosLogin:true}],[{directLogin:true}],[{}],[undefined],[{manualLogin:true,brahmosLogin:true,directLogin:true}],[{manualLogin:1,directLogin:'yes'}],[{brahmosLogin:true,directLogin:true}]]));
test('loginFlags (f445)',()=>check('f445',[['manual'],['direct'],['brahmos'],['auto'],[undefined]]));
test('allowedMode (f446)',()=>check('f446',[['manual',['auto','manual']],['x',['auto','manual']],['manual',[]],['x',[]],['direct',[]],['x',undefined]]));
test('modeDispatch (f447)',()=>check('f447',[['railone',{railBrahmos:true},['brahmos']],['railone',undefined,['x']],['uilogin',{manualLogin:true},[['a']]],['other',{manualLogin:true},[['manual','auto']]],['other',{directLogin:true},[['manual']]],['other',{},[[]]],['other',{brahmosLogin:true},[['brahmos']]],['other',{},[]]]));

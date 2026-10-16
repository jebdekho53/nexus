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

const more={302:new Set(['3A','CC','2A']),303:{eightAm:{h:8,m:0,label:'8:00 AM'},acTatkal:{h:10,m:30,label:'10:30 AM'},slTatkal:{h:11,m:15,label:'11:15 AM'}},304:'f454',306:new Set(['12951','20901'])};
test('proxyFromConfig (f448)',()=>check('f448',[[{enabled:true,host:' h ',port:' 8 ',username:'u',password:'p'}],[{enabled:true,host:'h'}],[{enabled:false,host:'h'}],[{enabled:true,host:'  '}],[{enabled:true}],[undefined],[null],[{enabled:true,host:'h',port:'  '}],[{enabled:true,host:'h',port:80}],[{enabled:1,host:'h',username:'',password:''}]],more));
test('isPlainObject (f449)',()=>check('f449',[[{}],[[]],[null],[undefined],[0],['x'],[()=>1],[new Date()],[1],[true]],more));
test('stringOr (f450)',()=>check('f450',[['x'],['x','y'],[5,'y'],[5],[undefined],[null,'z'],['', 'y'],[{},undefined]],more));
test('memberOr (f451)',()=>check('f451',[['abcdef','cd','z'],['abcdef','xy','z'],['abc',5,'z'],['abc','', 'z'],[['a','b'],'a','z'],['abc',undefined,'z'],[undefined,'a','z']],more));
test('positiveAmount (f452)',()=>check('f452',[[5],[0],[-3],['₹1,234.50'],['abc'],[''],['12.3.4'],[Infinity],[NaN],[null],[undefined],['0'],['  7 '],[{}]],more));
test('passengerCount (f453)',()=>check('f453',[[2],[0],[9],[3.9],[-1],['3'],['abc'],['2x'],[''],[undefined],[NaN],[Infinity],[null]],more));
test('quotaFamilyCaseless (f454)',()=>check('f454',[['8am','SL'],['ld','SL'],['SS',''],['tq','3a'],['PT','sl'],['pt',undefined],['GN','SL'],[undefined,'3A'],['tQ','cc'],[null,null]],more));
test('bookingWindow (f455)',()=>check('f455',[
  ['GN','SL',Date.parse('2026-10-16T09:00:00+05:30')],['8AM','SL',Date.parse('2026-10-16T07:59:59+05:30')],['8AM','SL',Date.parse('2026-10-16T08:00:00+05:30')],['TQ','3A',Date.parse('2026-10-16T10:29:59+05:30')],['TQ','3A',Date.parse('2026-10-16T10:30:00+05:30')],
  ['TQ','SL',Date.parse('2026-10-16T11:14:59+05:30')],['PT','SL',Date.parse('2026-10-16T23:59:59+05:30')],['PT','SL',Date.parse('2026-10-15T20:00:00Z')],['TQ','SL',NaN],['tq','cc',Date.parse('2026-10-16T05:00:00Z')],
],more));
test('isPremiumTrain (f456)',()=>check('f456',[['12951','Mumbai Rajdhani'],['00000','Vande Bharat Express'],['12951',''],['12951',undefined],['20901','Local'],['99999','Local'],['',' x '],[undefined,'tejas'],[undefined,undefined],['  ','shatabdi'],[' 12951 ','x'],[12951,'x']],more));

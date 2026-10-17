'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');
const {HOLE}=require('../src/main/runtime/engine.cjs');

const form=()=>({account:{username:'synthetic-user',password:'synthetic-only',mobileNumber:'0000000000'},
  journey:{trainNumber:'12345',origin:'AAA',destination:'BBB',boardingStation:'CCC',classCode:'SL',quota:'GN',journeyDate:'2026-11-01',specialTrain:false},
  payment:{method:'paytm',upiId:'synthetic@example',paymentPause:true},options:{bookOnlyIfConfirmed:true,fareLimit:500,travelInsurance:true,autoOtpSync:false,racers:2},
  passengers:[{name:'Synthetic Passenger',age:30,gender:'M',berthPreference:'LB',foodChoice:'veg',childBerth:false}],
  proxy:{host:'proxy.invalid',port:1234,username:'synthetic',password:'synthetic-only'},
  loginMode:'auto',browserProvider:'chrome',manualLogin:false,directLogin:true,brahmosLogin:false,railBrahmos:false,label:'Trip',timing:{test:1}});

function setup(native,o={}) {
  const trace=[];
  const record=(...args)=>trace.push(args);
  class Clock {constructor(){record('date');}toISOString(){record('iso');if(o.badDate)throw new Error('synthetic date');return '2026-01-02T03:04:05.000Z';}}
  const slots={324:o.extensions??['.csv','.json'],323:text=>{record('csv',text);if(o.csvThrows)throw new Error('synthetic csv');return [{csv:text}];},
    315:method=>{record('payment',method);if(o.paymentThrows)throw new Error('synthetic payment');return 'export:'+method;},
    314:o.food??{veg:'Vegetarian',zero:0,empty:'',off:false,missing:null}};
  for(const slot of o.holes??[])slots[slot]=HOLE;
  const h=harness({native,slots,globals:{Date:Clock},dependencies:{dateConstructor:Clock}});
  return {...h,trace};
}
function check(name,id,args,o={},nested=false) {
  test('form codecs match recovered: '+name,async()=>{
    await compare(async native=>{
      const h=setup(native,o);
      const fn=nested?h.nestedFunction(id):h.rootFunction(id);
      return {result:await outcome(()=>fn(...args)),trace:h.trace};
    });
  });
}
for(const name of ['a.json','a.JSON','a.csv','a.CSV','a.txt','a.json.tmp','noextension','',null,undefined,42])
  for(const text of ['{"a":1}','[1,2]', 'null','false','0','"string"','{bad'])check('parse '+name+' '+text,'f484',[name,text]);
check('csv callback throws','f484',['a.csv','text'],{csvThrows:true});
check('extension list hole','f484',['a.json','[]'],{holes:[324]});
check('extension list wrong type','f484',['a.json','[]'],{extensions:{}});
check('extension list custom includes','f484',['a.any','[1]'],{extensions:{includes:()=>true}});
for(const date of [undefined,null,'',false,0,'explicit date'])check('export date '+date,'f485',[form(),date]);
check('date failure','f485',[form()],{badDate:true});
check('payment callback failure','f485',[form(),null],{paymentThrows:true});
for(const key of ['account','journey','payment','options','proxy','passengers']) {
  for(const value of [undefined,null]){const model=form();model[key]=value;check('missing '+key+' '+value,'f485',[model,null]);}
}
for(const field of ['boardingStation','upiId','username','password'])for(const value of [null,undefined,'',false,0,'value']) {
  const model=form();const target=field==='boardingStation'?model.journey:field==='upiId'?model.payment:model.proxy;
  target[field]=value;check('fallback '+field+' '+value,'f485',[model,null]);
}
for(const field of ['manualLogin','directLogin','brahmosLogin','railBrahmos'])for(const value of [true,false,1,'true',undefined,null]) {
  const model=form();model[field]=value;check('flag '+field+' '+value,'f485',[model,null]);
}
for(const foodChoice of ['veg','zero','empty','off','missing','unknown',undefined])for(const childBerth of [true,false,0,null,undefined]) {
  const passenger={name:'Synthetic',age:undefined,gender:'F',berthPreference:'UB',foodChoice,childBerth};
  check('passenger '+foodChoice+' '+childBerth,'f486',[passenger,0],{},true);
}
for(const index of [0,1,-1,10])check('serial '+index,'f486',[{age:5},index],{},true);
check('food map hole','f486',[{age:5},0],{holes:[314]},true);
check('multiple passengers','f485',[{...form(),passengers:[{age:5},{age:30,foodChoice:'veg',childBerth:false}]},null]);
check('empty passengers','f485',[{...form(),passengers:[]},null]);

test('export form emits actual portable schema and preserves falsy food values',()=>{
  const h=setup(true),model=form();model.passengers[0].foodChoice='zero';
  const exported=h.rootFunction('f485')(model,'explicit');
  assert.equal(exported.version,'V6.5.8');assert.equal(exported.username,'synthetic-user');
  assert.equal(exported.paymentMethod,'export:paytm');assert.equal(exported.exportDate,'explicit');
  assert.equal(exported.passengers[0].passengerFoodChoice,0);assert.equal(exported.passengers[0].passengerSerialNumber,1);
  assert.equal(exported.passengers[0].needsChildBerth,false);
});

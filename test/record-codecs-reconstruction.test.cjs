'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');
const {HOLE}=require('../src/main/runtime/engine.cjs');
function setup(native,o={}) {
  const trace=[];
  const slots={254:()=>{trace.push(['mobile']);if(o.mobileFails)throw Error('synthetic mobile');return '0000000000';},
    258:{test(value){trace.push(['validate',value]);if(o.validFails)throw Error('synthetic validator');return /^[a-z0-9._-]+@[a-z]+$/i.test(value);}},
    259:'f418',263:'f422'};
  for(const slot of o.holes??[])slots[slot]=HOLE;
  const date={now(){trace.push(['now']);return 12345;}};
  const math=Object.create(Math,{random:{value:()=>{trace.push(['random']);return o.random??0.123456;}}});
  const h=harness({native,slots,globals:{Date:date,Math:math},dependencies:{now:()=>date.now(),random:()=>math.random()}});
  return {...h,trace};
}
function check(name,id,args,o={}) {
  test('record codecs match recovered: '+name,async()=>{
    await compare(async native=>{const h=setup(native,o);return {result:await outcome(()=>(['f417','f424'].includes(id)?h.nestedFunction(id):h.rootFunction(id))(...args)),trace:h.trace};});
  });
}
for(const value of [null,undefined,false,0,1,42,NaN,Infinity,'', ' text ',[],{},true])
  for(const id of ['f417','f424'])check('scalar '+id+' '+String(value),id,[value]);
for(const line of [undefined,null,'',' ','synthetic:password',' synthetic : password ','synthetic:a:b:c',':pass','user:','no-colon',':','u: ',0,42])
  check('login line '+String(line),'f415',[line,'id',42]);
check('login mobile helper failure','f415',['synthetic:password','id',42],{mobileFails:true});
for(const value of [undefined,null,false,0,[],{},'u:p',{username:'synthetic',password:'only'},
  {userId:123,pass:456,phone:'+91 12345 67890'}, {username:'',userId:'fallback',password:''},
  {username:null,userId:'alias',password:null,pass:'alias-pass'}, {password:'only'}, {username:'only'},
  {user:' user ',phone:'12-34',railone:true}, {user:'x',mobile:'000000000000000',railone:1}])
  check('login object '+JSON.stringify(value),'f416',[value,'id',42]);
for(const value of [{username:'synthetic',password:'only'},{username:1,password:2},{},null])check('login export '+JSON.stringify(value),'f414',[value]);

const proxyLines=['',' ',null,undefined,'host.invalid','host.invalid:8080','host.invalid:8x0',
  'host.invalid:80:user:pass','host.invalid:80:user:p:a:ss','http://host.invalid:80',
  'socks5://user:pass@host.invalid:1080','user@host.invalid:80','user:p@ss@host.invalid:80',
  ' Label = host.invalid:80:user:pass ','Outer=Inner=host.invalid:80','Label=host.invalid',
  'Label=','a:b=host.invalid:80',':80','@host.invalid:80','[::1]:80',42,0];
for(const line of proxyLines) {
  check('proxy parse '+String(line),'f422',[line]);
  check('proxy record '+String(line),'f423',[line,'id',42]);
}
for(const value of [null,undefined,false,0,42,[],{},
  {host:' host.invalid ',port:'80x',username:'synthetic',password:'only',label:' Name '},
  {ip:'host.invalid',port:80,user:123,pass:456,name:123},
  {server:'user:pass@host.invalid:90'}, {address:'host.invalid:90',port:80,username:'explicit',password:'explicit'},
  {hostname:'host.invalid',port:0},{host:'',ip:'fallback.invalid'},{host:null,ip:'fallback.invalid'},
  {host:123,port:NaN,label:false},{host:{x:1}},{host:'host.invalid:80',username:'',password:''}])
  check('proxy object '+JSON.stringify(value),'f423',[value,'id',42]);
for(const label of [undefined,null,'',' Name ',0,'  '])for(const user of [undefined,'','user'])for(const include of [undefined,true,false,0])
  check('proxy export '+String(label)+' '+String(user)+' '+String(include),'f421',[{host:'host.invalid',port:'80',username:user,password:'pass',label},include]);

for(const value of [null,undefined,'','bad','synthetic@example',' synthetic@example ','@example',0,42])
  check('validate UPI '+String(value),'f418',[value]);
check('validator hole','f418',['synthetic@example'],{holes:[258]});
check('validator throws','f418',['synthetic@example'],{validFails:true});
for(const method of ['wallet','railoneupi','railoneqr','paytmupi','unknown',undefined])for(const upi of ['synthetic@example','bad',null])
  check('stored method '+String(method)+' '+String(upi),'f419',[method,upi]);
for(const value of [null,undefined,0,false,[],{},'synthetic@example',{upiId:'synthetic@example'},
  {upi:' synthetic@example ',name:' Name ',id:'saved',createdAt:0,updatedAt:1},
  {vpa:'synthetic@example',label:123,id:0,createdAt:'x',updatedAt:null},
  {upiId:'',upi:'synthetic@example'}, {upiId:null,upi:'synthetic@example'},
  {upiId:'bad'}, {upiId:'synthetic@example',label:'',name:'fallback'},
  {upiId:'synthetic@example',createdAt:NaN,updatedAt:Infinity}])
  for(const date of [undefined,null,0,42])check('payment record '+JSON.stringify(value)+' '+String(date),'f420',[value,date]);
check('payment validator throws','f420',[{upiId:'synthetic@example'}],{validFails:true});

test('proxy and login codecs produce real stored records',()=>{
  const h=setup(true);
  assert.deepEqual(h.rootFunction('f422')('Office=user:pass@host.invalid:80'),{host:'host.invalid',port:'80',username:'user',password:'pass',label:'Office'});
  assert.deepEqual(h.rootFunction('f416')({user:' synthetic ',pass:'only',phone:'+91 12345 67890'},'id',42),
    {id:'id',username:'synthetic',password:'only',mobileNumber:'1234567890',createdAt:42,updatedAt:42});
  const payment=h.rootFunction('f420')({upiId:'synthetic@example'});
  assert.equal(payment.kind,'upi');assert.equal(payment.upiId,'synthetic@example');assert.match(payment.id,/^upi-12345-/);
});

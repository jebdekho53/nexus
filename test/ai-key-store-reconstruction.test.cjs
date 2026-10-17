'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,compare,outcome}=require('./helpers/recovered-harness.cjs');
const {HOLE}=require('../src/main/runtime/engine.cjs');

function world(options={}) {
  const trace=[];
  const settings={other:17,...options.settings};
  const fail=name=>{if(options.fail===name)throw Object.hasOwn(options,'error')?options.error:new Error('synthetic '+name);};
  const safeStorage={
    isEncryptionAvailable(){trace.push(['available']);fail('available');return options.available!==false;},
    encryptString(key){trace.push(['encrypt',key]);fail('encrypt');return {toString(encoding){trace.push(['encode',encoding]);fail('encode');return 'encoded:'+key;}};},
    decryptString(bytes){trace.push(['decrypt',Buffer.from(bytes).toString('hex')]);fail('decrypt');return options.decrypted??'synthetic-decoded';},
  };
  const slots={
    1566:options.environment??'',
    22:options.electronHole?HOLE:{safeStorage},
    1768:()=>{trace.push(['read']);fail('read');return settings;},
    1769:value=>{trace.push(['write',{...value}]);fail('write');},
  };
  return {trace,settings,slots,fail};
}
function scenario(name,options,run) {
  test('AI key storage matches recovered: '+name,async()=>compare(async native=>{
    const env=world(options);
    const h=harness({native,slots:env.slots,globals:{Buffer}});
    h.root[1783]=value=>{
      env.trace.push(['save',value]);env.fail('save');
      return h.rootFunction('f3570')(value);
    };
    const ctx=h.engine.context(4,h.root);ctx[2]=h.root[5];
    const handler=h.engine.makeFunction('f4022',ctx);
    const result=await outcome(()=>run(h,handler));
    return {result,trace:env.trace,settings:env.settings};
  }));
}
for(const key of [undefined,null,false,0,'','  ',' synthetic-key ',true,19,{},['x']]) {
  scenario('save '+JSON.stringify(key),{settings:{aiKey:'old',aiKeyEnc:'old-encoded'}},h=>h.rootFunction('f3570')(key));
  // Invalid inputs are compared directly above (TypeError). IPC error forwarding
  // is tested independently with scripted errors below; runtime-generated
  // non-callable-method messages differ between the interpreter and native JS.
  if (!key || typeof key==='string') scenario('IPC save '+JSON.stringify(key),{},(h,handler)=>handler({},key));
}
for(const available of [true,false]) {
  scenario('save encryption '+available,{available,settings:{aiKey:'old',aiKeyEnc:'old-encoded'}},h=>h.rootFunction('f3570')(' new '));
  for(const settings of [{},{aiKey:'plain'},{aiKey:' plain ',aiKeyEnc:'YQ=='},{aiKeyEnc:'YQ=='},{aiKeyEnc:'%%%'}])
    scenario('read encryption '+available+' '+JSON.stringify(settings),{available,settings},h=>h.rootFunction('f3571')());
}
for(const environment of ['environment-key',true,42])
  scenario('environment priority '+environment,{environment,electronHole:true,fail:'read'},h=>h.rootFunction('f3571')());
for(const fail of ['read','available','encrypt','encode','write']) {
  scenario('save failure '+fail,{fail,settings:{aiKey:'old',aiKeyEnc:'old-encoded'}},h=>h.rootFunction('f3570')('new'));
  scenario('IPC failure '+fail,{fail},(h,handler)=>handler({},'new'));
}
for(const fail of ['read','available','decrypt','save','write'])
  scenario('read failure '+fail,{fail,settings:fail==='save'||fail==='write'?{aiKey:'plain'}:{aiKey:'fallback',aiKeyEnc:'YQ=='}},h=>h.rootFunction('f3571')());
scenario('decryption failure never returns plaintext fallback',{fail:'decrypt',settings:{aiKeyEnc:'YQ==',aiKey:'fallback'}},h=>h.rootFunction('f3571')());
scenario('clear does not require Electron',{electronHole:true,settings:{aiKey:'old',aiKeyEnc:'old'}},h=>h.rootFunction('f3570')(''));
scenario('encryption unavailable migration still returns old plaintext',{available:false,settings:{aiKey:' old '}},h=>h.rootFunction('f3571')());
scenario('IPC message-less thrown object',{fail:'save',error:{}},(h,handler)=>handler({},'key'));
scenario('IPC null throw preserves rejection',{fail:'save',error:null},(h,handler)=>handler({},'key'));
test('AI key persistence factories are registered',()=>{
  const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
  const factories=reconstructedPayment({development:true,enabled:true});
  for(const id of ['f3570','f3571','f4022'])assert.equal(typeof factories[id],'function');
});

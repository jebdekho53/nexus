'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
function fixture(native,helpers={}) {
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{RegExp}});
  const root=engine.context(785,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[783]=helpers.field??engine.makeFunction('f1609',root);
  root[784]=helpers.action??engine.makeFunction('f1610',root);
  return engine.makeFunction('f1599',root);
}
const field=(name,value)=>'<input name="'+name+'" value="'+value+'">';
const scenarios={
  ordinary:'<form action="https://gateway.invalid/start">'+field('encData','synthetic-enc')+field('mid','synthetic-mid')+field('checksum','synthetic-checksum'),
  alternate:field('ENC_DATA','synthetic-enc')+field('MID','synthetic-mid')+field('CHECKSUMHASH','synthetic-checksum'),
  underscore:field('enc_data','synthetic-enc')+field('checksumhash','synthetic-checksum'),
  mixed:field('encdata','synthetic-enc')+field('checkSum','synthetic-checksum'),
  emptyFirst:field('encData','')+field('ENC_DATA','second')+field('checksum','')+field('CHECKSUMHASH','second'),
  precedence:field('enc_data','fourth')+field('ENC_DATA','second')+field('encData','first'),
  uppercaseValue:'<FORM ACTION="fixture"><INPUT NAME="MID" VALUE="fixture">',
  reversedAttributes:'<form action= "fixture"><input value="fixture" name="mid">',
  entities:'<form action="a&amp;b">'+field('mid','a&amp;b'),
  empty:'',null:null,undefined:undefined,number:7,coerced:{toString(){return field('mid','synthetic-mid');}},
};
for(const[name,html]of Object.entries(scenarios))test('PayTM form parser matches recovered aliases and HTML semantics: '+name,()=>{
  assert.deepEqual(fixture(true)(html),fixture(false)(html));
});
for(const mode of ['truthy','falsey','actionThrows','fieldThrows'])test('PayTM form parser preserves helper order and failure: '+mode,()=>{
  function run(native){
    const trace=[];
    const helpers={action(html){trace.push(['action',html]);if(mode==='actionThrows')throw Error('synthetic action');return 'synthetic-action';},
      field(html,name){trace.push(['field',html,name]);if(mode==='fieldThrows')throw Error('synthetic field');return mode==='truthy'?{name}:0;}};
    try{return{value:fixture(native,helpers)('synthetic-html'),trace};}catch(error){return{error:error.message,trace};}
  }
  assert.deepEqual(run(true),run(false));
});
test('PayTM parser resolves bindings after earlier helper side effects',()=>{
  for(const native of [false,true]){
    const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{RegExp}}),root=engine.context(785,null);
    root[5]=(n,key)=>table[n+'|'+key];
    root[783]=()=>{throw Error('stale field helper');};
    root[784]=()=>{root[783]=(_html,name)=>name;return 'synthetic-action';};
    assert.deepEqual(engine.makeFunction('f1599',root)('synthetic-html'),{action:'synthetic-action',encData:'encData',mid:'mid',checksum:'checksum'});
  }
});

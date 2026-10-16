'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
function fixture(native,id){
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{Number,Error,String}}),root=engine.context(786,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[139]=engine.makeFunction('f152',root);root[785]=engine.makeFunction('f1611',root);
  return engine.makeFunction(id,id==='f1611'?root:engine.context(2,root));
}
const delay=ms=>'<script>setTimeout(function(){ document.forms[0].submit(); }, '+ms+');</script>';
test('bank interstitial parser matches recovered grammar, case, zero and large delays',()=>{
  for(const value of [delay(45000),delay(0),'setTimeout(()=>form.submit(),1234)','SETTIMEOUT(()=>form.SUBMIT(), 2500)',delay('00100'),'setTimeout(()=>form.submit(), -1)',delay('9'.repeat(400)),delay(1.5),'',null,undefined,0])
    assert.equal(fixture(true,'f1611')(value),fixture(false,'f1611')(value));
});
async function run(native,options={},paytm=false){
  const trace=[],sequence=options.sequence??[{url:'https://example.invalid/booking-confirm'}];let calls=0,headers=0;
  const actor={hosts:{wps:'https://example.invalid'},stopped:!!options.stopped,
    bankResponseOrigin(){trace.push(['origin']);if(options.originThrow)throw Error('synthetic origin');return options.origin;},
    async gwHeaders(host,settings){headers++;trace.push(['headers',host,settings]);if(options.headersThrow===headers)throw Error('synthetic headers');return{'fixture-header':'fixture-value'};},
    req:{post(url,settings){assert.equal(this,actor.req);trace.push(['post',url,settings]);calls++;assert.ok(calls<150,'Unexpected unbounded synthetic bank-response loop');const item=sequence[Math.min(calls-1,sequence.length-1)];
      if(item.throw)throw Error(item.closed?'Target closed':'synthetic post');if(item.reject)return Promise.reject(Error(item.closed?'Target closed':'synthetic post'));
      if(item.rejectNull)return Promise.reject(null);
      return Promise.resolve({
        url(){trace.push(['url']);if(item.urlThrow)throw Error('synthetic url');return item.url??'https://example.invalid/intermediate';},
        text(){trace.push(['text']);if(item.textThrow)throw Error('synthetic text');if(item.textReject)return Promise.reject(Error('synthetic text'));return Promise.resolve(item.body??'fixture body');},
        status(){trace.push(['status']);if(item.statusThrow)throw Error('synthetic status');return item.status??200;},
      });
    }},
    async sleep(ms){trace.push(['sleep',ms]);if(options.sleepThrow)throw Error('synthetic sleep');},
    log(...args){trace.push(['log',...args]);if(options.logThrow)throw Error('synthetic log');},
  };
  if(options.noHosts)delete actor.hosts;
  try{return{value:await fixture(native,paytm?'f1717':'f1681').call(actor,paytm?{mid:'synthetic-mid',encData:'synthetic-enc',checksum:'synthetic-checksum'}:'fixture-encrypted-bank-response',options.key),trace,calls};}
  catch(error){return{error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{}),trace,calls};}
}
const confirm={url:'https://example.invalid/booking-confirm'};
const cases={urlConfirm:{},bodyConfirm:{sequence:[{body:'BOOKING-CONFIRM'}]},emptyExhaustion:{sequence:[{}]},textRejected:{sequence:[{textReject:true}]},
  networkRetry:{sequence:[{reject:true},confirm]},syncNetworkRetry:{sequence:[{throw:true},confirm]},networkExhaustion:{sequence:[{reject:true}]},closedBrowser:{sequence:[{reject:true,closed:true}]},nullError:{sequence:[{rejectNull:true}]},
  interstitial:{sequence:[{body:delay(45000)},confirm]},resetEmptyCount:{sequence:[{},{body:delay(1234)},{},{},confirm]},
  non200:{sequence:[{status:503},confirm]},multipleNon200:{sequence:[...Array.from({length:12},()=>({status:503})),confirm]},
  cumulativeErrors:{sequence:[{reject:true},{body:delay(100)},{reject:true},{status:503},{reject:true},{body:delay(100)},{reject:true}]},
  origin:{origin:{origin:'https://gateway.invalid',referer:'https://gateway.invalid/'}},emptyOrigin:{origin:{}},nullOrigin:{origin:null},originOverride:{origin:{navigate:false,secFetchSite:'fixture-ignored'}},
  customKey:{key:'response'},nullKey:{key:null},numericKey:{key:0},stoppedSettlement:{stopped:true},
  headersRetry:{headersThrow:1},originFailure:{originThrow:true},noHosts:{noHosts:true},urlFailure:{sequence:[{urlThrow:true}]},textFailure:{sequence:[{textThrow:true}]},statusFailure:{sequence:[{statusThrow:true}]},
  sleepFailure:{sequence:[{}],sleepThrow:true},logFailure:{logThrow:true},
};
for(const[name,options]of Object.entries(cases))test('bank response matches actual recovered settlement behavior: '+name,async()=>assert.deepEqual(await run(true,options),await run(false,options)));
test('bank response submits encrypted form once and honors full provider delay on bodiless continuation',async()=>{
  const result=await run(true,cases.interstitial),posts=result.trace.filter(row=>row[0]==='post');assert.equal(result.value,true);
  assert.deepEqual(posts[0][2].form,{encdata:'fixture-encrypted-bank-response'});assert.equal('form' in posts[1][2],false);assert.equal(posts[0][2].timeout,0);
  assert.deepEqual(result.trace.filter(row=>row[0]==='sleep'),[['sleep',45000]]);
  const errors=await run(true,cases.networkExhaustion);assert.equal(errors.calls,4);assert.equal(errors.value,false);
});

for(const[name,options]of Object.entries(cases))test('PayTM bank response matches recovered settlement behavior: '+name,async()=>assert.deepEqual(await run(true,options,true),await run(false,options,true)));

test('PayTM bank form is sent once and browser-close errors retain ordinary retry behavior',async()=>{
  const result=await run(true,cases.interstitial,true),posts=result.trace.filter(row=>row[0]==='post');
  assert.equal(result.value,true);assert.deepEqual(posts[0][2].form,{MID:'synthetic-mid',ENC_DATA:'synthetic-enc',CHECKSUMHASH:'synthetic-checksum'});assert.equal('form' in posts[1][2],false);
  assert.deepEqual(result.trace.filter(row=>row[0]==='sleep'),[['sleep',45000]]);
  const closed=await run(true,cases.closedBrowser,true);assert.equal(closed.calls,4);assert.equal(closed.value,false);
});

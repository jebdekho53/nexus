'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
function fixture(native,id,clock={now:Date.now}){
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{clock}}):{},globals:{String,Number,JSON,Math,Date:clock,atob,Buffer}}),root=engine.context(785,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[777]=engine.makeFunction('f1602',root);root[778]=engine.makeFunction('f1603',root);
  return engine.makeFunction(id,id==='f1603'?root:engine.context(2,root));
}
const config=value=>'<textarea id="app-config-data">'+Buffer.from(JSON.stringify(value)).toString('base64')+'</textarea>';
test('command status classifier preserves aliases, case coercion and success/pending precedence',()=>{
  const before=fixture(false,'f1603'),after=fixture(true,'f1603');
  const states=['SUC','success','FAIL','awaiting','INITIATED','IN_PROGRESS','timed_out','unSuccess','unrecognized',''];
  for(const status of states)for(const code of ['0000','P0030','',null])for(const field of ['txnResponseCode','responseCode']){
    const body={txnStatus:status,[field]:code,respDescription:'fixture',txnRespDescription:''};assert.equal(after(body),before(body));
  }
  for(const description of ['processing failed','failed','await','DECLINED','timed out','SUCCESS',''])assert.equal(after({respDescription:description}),before({respDescription:description}));
  assert.throws(()=>after(null),TypeError);assert.throws(()=>before(null),TypeError);
});
const qr={pgOrigin:'https://pg.invalid',authReferer:'https://pg.invalid/auth',merchantId:'fixture-merchant',merchantTxnNo:'fixture-transaction',pageToken:'fixture-page-token'};
async function run(native,options={}){
  const trace=[];let now=0,commands=0,fallbacks=0,stopChecks=0,waits=0,headerCalls=0;
  const clock={now(){trace.push(['clock',now]);return now;}};
  const input=options.qr===undefined?{...qr}:options.qr;
  const actor={
    async gwHeaders(host,settings){headerCalls++;trace.push(['headers',host,settings]);if(options.headersThrow===headerCalls)throw Error('synthetic headers');return{'fixture-header':'fixture-value'};},
    req:{post(url,settings){trace.push(['post',url,settings]);const command=url.includes('/command?');if(command)commands++;else fallbacks++;
      const sequence=command?(options.commands??[{body:{txnStatus:'PENDING'}}]):(options.fallbacks??[{config:{status:'PENDING'}}]);
      const item=sequence[Math.min((command?commands:fallbacks)-1,sequence.length-1)];
      if(item.syncThrow)throw Error('synthetic post');
      if(item.reject)return Promise.reject(Error('synthetic post'));
      return Promise.resolve({
        text(){trace.push(['text',command?'command':'fallback']);if(item.textThrow)throw Error('synthetic text');if(item.textReject)return Promise.reject(Error('synthetic text'));return Promise.resolve(command?(item.raw??JSON.stringify(item.body??{})):(item.raw??config(item.config??{})));},
        status(){trace.push(['status',command?'command':'fallback']);return item.status??200;},
        ok(){trace.push(['ok']);return item.ok??true;},
      });
    }},
    async irctcQrFetchEncdata(value){assert.equal(value,input);trace.push(['encdata']);if(options.encThrows)throw Error('synthetic encdata');return options.encdata??'fixture-encdata';},
    log(...args){trace.push(['log',...args]);if(options.logThrows)throw Error('synthetic log');},
    sleep:ms=>sleep(ms,'internal'),
  };
  async function sleep(ms,kind){trace.push(['sleep',kind,ms]);if(options.sleepThrows)throw Error('synthetic sleep');now+=options.elapsed??ms;}
  const stopped=()=>{stopChecks++;trace.push(['stop',stopChecks]);if(options.stopThrows)throw Error('synthetic stop');return options.stopped===true||(options.stopAfterWait&&waits>0);};
  const onWait=options.noOnWait?undefined:()=>{waits++;trace.push(['wait']);if(options.waitThrows)throw Error('synthetic wait');};
  try{
    const value=await fixture(native,'f1673',clock).call(actor,input,stopped,onWait,options.defaultMax?undefined:(options.max??2),options.defaultInterval?undefined:(options.interval??1000),options.internalSleep?undefined:ms=>sleep(ms,'external'));
    return{value,trace,commands,fallbacks,waits};
  }catch(error){return{error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{}),trace,commands,fallbacks,waits};}
}
const cases={paid:{commands:[{body:{txnStatus:'SUC'}}]},paidNoEncdata:{commands:[{body:{txnStatus:'SUC'}}],encdata:''},declined:{commands:[{body:{txnStatus:'FAIL',respDescription:'fixture declined'}}]},
  pendingThenPaid:{commands:[{body:{txnStatus:'PENDING'}},{body:{txnResponseCode:'0000'}}]},pendingTimeout:{},deduplicatedLogs:{max:3},
  noIds:{qr:{}},nullQr:{qr:null},stopAtStart:{stopped:true},stopAfterWait:{stopAfterWait:true},noOnWait:{noOnWait:true},
  networkThreshold:{max:5,commands:[{reject:true}],fallbacks:[{config:{status:'SUCCESS',responseParams:{encdata:'fixture-fallback'}}}]},
  unusableThreshold:{max:6,commands:[{body:{},ok:false,status:503}],fallbacks:[{config:{status:'SUC',responseParams:{encData:'fixture-alias'}}}]},
  fallbackDecline:{max:5,commands:[{reject:true}],fallbacks:[{config:{status:'cancelled'}}]},fallbackReject:{max:6,commands:[{reject:true}],fallbacks:[{reject:true}]},
  fallbackTextReject:{max:5,commands:[{reject:true}],fallbacks:[{textReject:true}]},fallbackUnknown:{max:5,commands:[{reject:true}],fallbacks:[{config:{status:'OTHER'}}]},
  errorCounterReset:{max:6,commands:[{reject:true},{body:{txnStatus:'PENDING'}},{reject:true},{reject:true},{reject:true},{reject:true}]},
  invalidJson:{commands:[{raw:'invalid JSON'}]},nullJson:{commands:[{raw:'null'}]},textReject:{commands:[{textReject:true}]},textThrow:{commands:[{textThrow:true}]},
  syncPostThrow:{commands:[{syncThrow:true}]},headersThrow:{headersThrow:1},fallbackHeadersThrow:{max:5,commands:[{reject:true}],headersThrow:2},
  encdataThrow:{commands:[{body:{txnStatus:'SUC'}}],encThrows:true},logThrow:{logThrows:true},stopThrow:{stopThrows:true},waitThrow:{waitThrows:true},sleepThrow:{sleepThrows:true},
  internalSleep:{internalSleep:true},defaultBounds:{defaultMax:true,defaultInterval:true},fastSleeps:{max:1,elapsed:0},shortSleeps:{max:1,elapsed:599},boundarySleeps:{max:1,elapsed:600},
  noToken:{qr:{...qr,pageToken:''}},noReferer:{qr:{...qr,authReferer:''}},
};
for(const[name,options]of Object.entries(cases))test('provider QR polling matches recovered state machine: '+name,async()=>assert.deepEqual(await run(true,options),await run(false,options)));
test('provider QR polling caps accelerated waits and switches fallback on the fifth failure',async()=>{
  const fast=await run(true,{max:1,elapsed:0});assert.equal(fast.commands,61);assert.equal(fast.value.kind,'timeout');
  const normal=await run(true,{max:1,elapsed:600});assert.equal(normal.commands,1);
  const fallback=await run(true,cases.networkThreshold);assert.equal(fallback.commands,5);assert.equal(fallback.fallbacks,1);assert.equal(fallback.value.kind,'paid');
  assert.equal(fallback.value.encdata,'fixture-fallback');
});
async function encRun(native,options={}){
  const trace=[],actor={
    async gwHeaders(host,settings){trace.push(['headers',host,settings]);if(options.headerThrow)throw Error('synthetic headers');return {};},
    req:{post(url,settings){trace.push(['post',url,settings]);if(options.postThrow)throw Error('synthetic post');if(options.postReject)return Promise.reject(Error('synthetic post'));
      return Promise.resolve({text(){trace.push(['text']);if(options.textThrow)throw Error('synthetic text');if(options.textReject)return Promise.reject(Error('synthetic text'));return Promise.resolve(options.html??config({responseParams:options.params??{encdata:'fixture-encdata'}}));}});
    }},
  };
  try{return{value:await fixture(native,'f1678').call(actor,qr),trace};}catch(error){return{error:error.name,trace};}
}
for(const[name,options]of Object.entries({success:{},camel:{params:{encData:'fixture'}},caps:{params:{ENC_DATA:'fixture'}},snake:{params:{enc_data:'fixture'}},
  emptyPrimary:{params:{encdata:'',encData:'fixture'}},numeric:{params:{encdata:123}},missing:{params:{}},invalidHtml:{html:'fixture'},
  headerFailure:{headerThrow:true},postFailure:{postThrow:true},postRejection:{postReject:true},textFailure:{textThrow:true},textRejection:{textReject:true},
}))test('provider encdata fetch matches recovered request and aliases: '+name,async()=>assert.deepEqual(await encRun(true,options),await encRun(false,options)));

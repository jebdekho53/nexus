'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

// Synthetic form text: "mid=..;enc=..;chk=..;" keeps the tests independent of real provider markup.
const field=(text,name)=>(new RegExp(name+'=([^;]*);').exec(text)||[])[1]||'';
async function run(native,options={}) {
  const trace=[],logs=[];
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{encodeURIComponent,URLSearchParams,Promise}});
  const root=engine.context(776,null);
  root[5]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined);return table[n+'|'+key];};
  root[775]=text=>{trace.push(['parse',text]);if(options.fail==='parse')throw Error('synthetic parse');return{mid:field(text,'mid'),encData:field(text,'enc'),checksum:field(text,'chk'),text};};
  const base={merchantId:'synthetic&mid',acquirementId:'synthetic-acq',cashierRequestId:'synthetic-cashier',paymentMode:'synthetic-mode',orderId:'synthetic/order',topicName:'synthetic-topic',status:'synthetic-status',_id:'synthetic-id'};
  const payment=new Proxy(options.payment??base,{get(target,key){trace.push(['read',String(key)]);return target[key];}});
  const complete='mid=m;enc=e;chk=c;';
  const actor={hosts:{paytm:'https://gateway.invalid'},
    paytmInPageFetch(path,settings){trace.push(['page',path,settings]);if(options.fail==='pageSync')throw Error('synthetic page');if(options.fail==='pageReject')return Promise.reject(Error('synthetic page rejection'));
      return Promise.resolve(options.page===undefined?{status:200,text:'mid=;'}:options.page);},
    async gwHeaders(host,settings){trace.push(['headers',host,settings]);if(options.fail==='headers')throw Error('synthetic headers');return{synthetic:'header'};},
    req:{post(url,settings){trace.push(['post',url,settings]);assert.equal(this,actor.req);if(options.fail==='postSync')throw Error('synthetic post');if(options.fail==='postReject')return Promise.reject(Error('synthetic post rejection'));
      return Promise.resolve(options.response===null?null:{status(){trace.push(['status']);if(options.fail==='status')throw Error('synthetic status');return 201;},
        text(){trace.push(['text']);if(options.fail==='textSync')throw Error('synthetic text');return options.fail==='textReject'?Promise.reject(Error('synthetic text rejection')):Promise.resolve(options.text??complete);}});}},
    log(value){trace.push(['log']);logs.push(value);if(options.fail==='log')throw Error('synthetic log');},
    snip(text){trace.push(['snip',text]);if(options.fail==='snip')throw Error('synthetic snip');return text;},
  };
  let result;try{result={value:await engine.makeFunction('f1712',engine.context(2,root)).call(actor,payment)};}catch(error){result={error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{})};}
  return{...result,trace,logs:logs.map(value=>value.split(' :: ')[0]),rawLogs:logs};
}
const ready='mid=m;enc=e;chk=c;';
const cases={
  inPageComplete:{page:{status:200,text:ready}},
  inPageIncompleteThenRequest:{},
  requestIncomplete:{text:'mid=m;'},
  inPageBetter:{page:{status:200,text:'mid=m;enc=e;'},text:'nothing'},
  unavailablePage:{page:null},
  pageUndefinedText:{page:{status:200}},
  requestMissing:{response:null},
  paymentGaps:{payment:{merchantId:undefined,orderId:undefined}},
  emptyStatus:{page:{status:0,text:''}},
};
for(const fail of ['pageSync','pageReject','parse','log','snip','headers','postSync','postReject','status','textSync','textReject'])cases['failure-'+fail]={fail,page:fail==='parse'||fail==='log'||fail==='snip'?{status:200,text:'mid=;'}:undefined};
for(const[name,options]of Object.entries(cases))test('PayTM final status matches recovered in-page/request fallback flow: '+name,async()=>{
  const actual=await run(true,options),expected=await run(false,options);delete actual.rawLogs;delete expected.rawLogs;assert.deepEqual(actual,expected);
});
test('PayTM final status keeps form fields and omits supplier text from diagnostics',async()=>{
  const value=await run(true,{page:{status:200,text:'synthetic-secret-page'},text:'synthetic-secret-request'});
  const post=value.trace.find(row=>row[0]==='post');
  assert.equal(post[1],'https://gateway.invalid/theia/transactionStatus?MID=synthetic%26mid&ORDER_ID=synthetic%2Forder');
  assert.equal(post[2].form.transId,'synthetic-acq');assert.equal(post[2].headers.synthetic,'header');
  assert.equal(value.trace.find(row=>row[0]==='page')[2].body,new URLSearchParams(post[2].form).toString());
  assert.equal(value.trace.filter(row=>row[0]==='snip').length,2);assert.doesNotMatch(value.rawLogs.join(' '),/synthetic-secret/);
});

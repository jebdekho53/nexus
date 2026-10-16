'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
async function run(native,options={}) {
  const trace=[],logs=[];let attempts=0;
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{encodeURIComponent,RegExp}}),root=engine.context(784,null);
  root[5]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined);return table[n+'|'+key];};
  const getField=engine.makeFunction('f1609',root);root[783]=(html,name)=>{trace.push(['field',name]);if(options.fail==='field')throw Error('synthetic field');return getField(html,name);};
  const actor={hosts:{paytm:'https://gateway.invalid'},
    async sleep(ms){trace.push(['sleep',ms]);if(options.fail==='sleep')throw Error('synthetic sleep');},
    paytmInPageFetch(path,settings){trace.push(['page',path,settings]);attempts++;if(options.fail==='pageSync')throw Error('synthetic page');if(options.fail==='pageReject')return Promise.reject(Error('synthetic page rejection'));return Promise.resolve(options.fallback?null:{status:options.pageStatus??200,text:(options.responses??['SUCCESS'])[Math.min(attempts-1,(options.responses??['SUCCESS']).length-1)]});},
    async gwHeaders(host,settings){trace.push(['headers',host,settings]);if(options.fail==='headers')throw Error('synthetic headers');if(options.replaceGet)actor.req.get=()=>{throw Error('replacement must not run');};return{synthetic:'header'};},
    req:{get(url,settings){trace.push(['get',url,settings]);assert.equal(this,actor.req);if(options.fail==='getSync')throw Error('synthetic get');if(options.fail==='getReject')return Promise.reject(Error('synthetic get rejection'));return Promise.resolve({
      ok(){trace.push(['ok']);if(options.fail==='ok')throw Error('synthetic ok');return !options.notOk;},
      text(){trace.push(['text']);if(options.fail==='textSync')throw Error('synthetic text');return options.fail==='textReject'?Promise.reject(Error('synthetic text rejection')):Promise.resolve(options.text??'SUCCESS');},
    });}},
    log(value){trace.push(['log']);logs.push(value);if(options.fail==='log')throw Error('synthetic log');},
    snip(text){trace.push(['snip',text]);if(options.fail==='snip')throw Error('synthetic snip');return text;},
  };
  const stopped=()=>{trace.push(['stop',attempts]);if(options.fail==='stop')throw Error('synthetic stop');return options.stopAt!==undefined&&attempts>=options.stopAt;};
  const onWait=options.noWait?undefined:()=>{trace.push(['wait']);if(options.fail==='wait')throw Error('synthetic wait');};
  let result;try{result={value:await engine.makeFunction('f1689',engine.context(2,root)).call(actor,'synthetic&mid','synthetic/order',stopped,onWait,options.useDefault?undefined:(Object.hasOwn(options,'max')?options.max:3))};}catch(error){result={error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{})};}
  return{...result,trace,logs:logs.map(value=>value.startsWith('PayTM transactionStatus poll ')?value.split(' [')[0]:value),rawLogs:logs};
}
const detailed='SUCCESS<input name="merchantId" value="synthetic-alt-mid"><input name="orderId" value="synthetic-alt-order"><input name="paymentMode" value="synthetic-mode"><input name="topicName" value="synthetic-topic"><input name="acquirementId" value="synthetic-acq"><input name="cashierRequestId" value="synthetic-cashier"><input name="_id" value="synthetic-id">';
const cases={ordinary:{},defaultBudget:{useDefault:true,stopAt:1,responses:['pending']},nullBudget:{max:null},legacySuccessSubstring:{responses:['UNSUCCESSFUL']},fields:{responses:[detailed]},pendingThenPaid:{responses:['STATUS pending','success']},neverPaid:{responses:['pending']},elevenAttempts:{responses:['STATUS pending'],max:11},fallback:{fallback:true},pageErrorFallback:{fail:'pageReject'},badStatusFallback:{pageStatus:403},notOk:{fallback:true,notOk:true},noWait:{noWait:true},zeroAttempts:{max:0},coercedCount:{max:'2',responses:['pending']},stopBefore:{stopAt:0},stopAfter:{stopAt:1,responses:['pending']},capturedGet:{fallback:true,replaceGet:true},emptyText:{fallback:true,text:''},undefinedText:{responses:[undefined]}};
for(const fail of ['sleep','pageSync','headers','getSync','getReject','ok','textSync','textReject','field','log','snip','stop','wait'])cases['failure-'+fail]={fail,fallback:['headers','getSync','getReject','ok','textSync','textReject'].includes(fail),responses:fail==='snip'?['pending']:undefined};
for(const[name,options]of Object.entries(cases))test('PayTM status poll matches recovered timing/fallback/result flow: '+name,async()=>{
  const actual=await run(true,options),expected=await run(false,options);delete actual.rawLogs;delete expected.rawLogs;assert.deepEqual(actual,expected);
});
test('PayTM status polling retains provider delays, escaped IDs and private diagnostics',async()=>{
  const value=await run(true,{responses:['STATUS synthetic-secret pending'],max:11});
  assert.deepEqual(value.trace.filter(row=>row[0]==='sleep').map(row=>row[1]),[2500,...Array(10).fill(2000)]);
  assert.equal(value.rawLogs.length,2);assert.doesNotMatch(value.rawLogs.join(' '),/synthetic-secret/);
  assert.match(value.trace.find(row=>row[0]==='page')[1],/MID=synthetic%26mid&ORDER_ID=synthetic%2Forder/);
});

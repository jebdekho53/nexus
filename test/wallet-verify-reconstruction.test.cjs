'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

const plain=value=>JSON.parse(JSON.stringify(value===undefined?null:value));
const outcome=async promise=>{try{return{value:await promise};}catch(error){return{error:error.message.startsWith('synthetic')?error.message:error.name};}};
class FixedDate{toISOString(){return '2026-10-16T00:00:00.000Z';}}

async function run(native,options={}) {
  const trace=[],logs=[];
  const globals={Promise,String,JSON,Date:FixedDate};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{dateConstructor:FixedDate}}):{},globals});
  const root=engine.context(1842,null);
  root[5]=root[1841]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined,'missing fixture '+n+'|'+key);return table[n+'|'+key];};
  const queue=[...(options.responses??[{status:200,body:{status:'SUCCESS'}}])];
  let posts=0;
  const actor={hosts:{wps:'https://provider.invalid'},
    async gwHeaders(host,settings){trace.push(['gw',host,settings]);if(options.fail==='gw')throw Error('synthetic gw');return{synthetic:'gw'};},
    async sleep(ms){trace.push(['sleep',ms]);if(options.fail==='sleep')throw Error('synthetic sleep');},
    req:{post(url,settings){trace.push(['post',url,settings]);assert.equal(this,actor.req);posts++;
      const next=queue.length>1?queue.shift():queue[0];
      if(next==='reject')return Promise.reject(Error('synthetic post rejection'));
      if(next==='throw')throw Error('synthetic post');
      return Promise.resolve({status(){trace.push(['status']);return next.status;},json(){trace.push(['json']);return next.jsonFails?Promise.reject(Error('synthetic json')):Promise.resolve(next.body);}});}},
    log(value){trace.push(['log']);logs.push(value);},snip(text){trace.push(['snip',text.length]);}};
  let stops=0;
  const input={clientTxnId:'txn/1',accessToken:options.noToken?'':'synthetic-access',bmiyek:'b',greq:'g',spaCsrf:'c',amount:options.amount??100,init:options.init,
    stopRetry:options.noStop?undefined:function(){assert.equal(this,input);stops++;trace.push(['stop?']);return options.stopAt!==undefined&&stops>options.stopAt;}};
  const result=await outcome(engine.makeFunction('f1722',engine.context(2,root)).call(actor,options.noInput?{...input,init:undefined}:input));
  const normalize=line=>line.replace(/ :: .*/,'');
  return{...result,trace,logs:logs.map(normalize),rawLogs:logs};
}
const transient={status:502,body:{}};
const cases={
  ok:{},fullInit:{init:{transationId:'T',bankId:'B',txnType:'Y',txnStatus:'0',txnDate:'D',amount:5,serverId:'S',timeStamp:'TS',upiModeOpted:'1',remainingBalance:'9.5',loyaltyNum:'L',withoutOTP:'false'}},
  emptyInit:{init:{}},nullInit:{init:null},noToken:{noToken:true},noStop:{noStop:true},
  gatewayTimeoutThenOk:{responses:[transient,{status:504,body:{}},{status:200,body:{ok:1}}]},stopOnTransient:{responses:[transient],stopAt:0},stopAfterSleep:{responses:[transient],stopAt:1},
  stopOnTransientBadJson:{responses:[{status:502,jsonFails:true,body:{}}],stopAt:0},
  badJson:{responses:[{status:200,jsonFails:true,body:{}}]},nullBody:{responses:[{status:200,body:null}]},clientError:{responses:[{status:400,body:{error:'x'}}]},
  postRejectsThenOk:{responses:['reject',{status:200,body:{ok:true}}]},postThrowsThenOk:{responses:['throw',{status:200,body:{ok:true}}]},rejectStopsFirst:{responses:['reject'],stopAt:0},rejectStopsAfterSleep:{responses:['reject'],stopAt:1},
  sleepFails:{responses:[transient,{status:200,body:{}}],fail:'sleep'},gwFails:{fail:'gw'},
};
for(const[name,options]of Object.entries(cases))test('wallet verification matches recovered request, retry and result flow: '+name,async()=>{
  const actual=await run(true,options),expected=await run(false,options);
  assert.deepEqual(plain({...actual,rawLogs:undefined}),plain({...expected,rawLogs:undefined}));
});
test('wallet verification request shape, retry budget and private diagnostics',async()=>{
  const value=await run(true);
  const post=value.trace.find(row=>row[0]==='post');
  assert.equal(post[1],'https://provider.invalid/eticketing/protected/mapps1/verifyPayment/txn/1');
  assert.deepEqual(post[2].data,{transationId:'0',bankId:'0',txnType:'0',txnStatus:'12',txnDate:'2026-10-16T00:00:00.000Z',amount:'100',serverId:'',timeStamp:'2026-10-16T00:00:00.000Z',upiModeOpted:'0',remainingBalance:'0.0',loyaltyNum:'0',withoutOTP:'true',paramList:[{key:'OTP'},{key:'TXN_TYPE',value:'undefined'}]});
  assert.equal(value.trace.find(row=>row[0]==='gw')[2].extra.Authorization,'Bearer synthetic-access');
  assert.doesNotMatch(value.rawLogs.join(' '),/SUCCESS|synthetic/);
  const endless=await run(true,{responses:[transient]});
  assert.equal(endless.trace.filter(row=>row[0]==='post').length,600);assert.equal(endless.trace.filter(row=>row[0]==='sleep').length,599);
});

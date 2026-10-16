'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

async function execute(native,options={}){
  const trace=[],math=Object.create(Math);math.random=()=>0.25;
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{...globalThis,Math:math,String}});
  const root=engine.context(1842,null),table=Object.assign({},...Object.values(strings));
  root[5]=root[1841]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
  const ids={paytm:10,phonepay:20,wallet:30};root[345]='https://example.invalid/mapps1';
  root[386]=method=>ids[method]??99;root[388]={paytm:[10],phonepay:[20],wallet:[30]};root[389]=['paytm','phonepay'];
  root[391]=(data,id)=>data.some(row=>row.bankId===id);
  root[392]=(data,method)=>data.some(row=>row.bankId===ids[method]);
  for(const[slot,id]of [[362,'f510'],[387,'f535'],[393,'f542'],[394,'f544'],[395,'f545'],[396,'f546'],[940,'f2382']])root[slot]=engine.makeFunction(id,root);
  let calls=0;
  const actor={bankDetail:options.banks??[{bankId:10},{bankId:20}],opts:{onProxyOutcome:outcome=>trace.push(['proxy-outcome',outcome])},stopped:!!options.stopped,terminal:false,lastAvail:null,
    async safeCall(...args){trace.push(['safe-call',...args]);if(++calls>12)throw Error('offline fixture request bound');return options.responses?.[calls-1]??{ok:true,status:200,body:{transationId:'fixture-txn'}};},
    onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    stopWith(message){trace.push(['stop',message]);return{success:false,message};},
    paymentPageReferrer(){trace.push(['referrer']);return'https://example.invalid/payment';},
    async routeGatewayThroughFormProxy(){trace.push(['proxy-route']);},
    async minimizeBrowser(...args){trace.push(['minimize',...args]);},
    async dispatchGateway(...args){trace.push(['dispatch',...args]);return{success:true};},
    session:{page:{async waitForTimeout(ms){trace.push(['wait',ms]);}}},
  };
  let result,error;
  try{result=await engine.makeFunction('f2172',engine.context(2,root)).call(actor,{paymentMethod:options.method??'paytm',travelInsurance:!!options.insurance},'fixture-txn',99,new Set(options.excluded));}
  catch(e){error={name:e.name,message:e.message};}
  return{trace,result,error};
}
for(const[name,options]of Object.entries({success:{},insured:{insurance:true},phonePe:{method:'phonepay'},wallet:{method:'wallet',banks:[{bankId:30}]},
  excludedSelected:{excluded:['paytm']},allExcluded:{excluded:['paytm','phonepay']},noBanks:{banks:[]},stopped:{stopped:true},
  rejectedTransaction:{responses:[{ok:true,status:200,body:{errorMessage:'synthetic rejection',transationId:0}}]},
  transientThenSuccess:{responses:[{ok:false,status:503,body:{}}]},
  bankErrorThenSuccess:{responses:[{ok:true,status:200,body:{errorMessage:'unable to process payment'}}]},
}))test('recovered payment initialization with native contracts matches baseline: '+name,async()=>{
  const before=await execute(false,options),after=await execute(true,options);
  assert.equal(before.error,undefined,'baseline fixture must complete: '+JSON.stringify(before.error));
  assert.equal(after.error,undefined);assert.deepEqual(after,before);
});

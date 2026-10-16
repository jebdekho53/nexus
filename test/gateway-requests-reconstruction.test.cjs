'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
async function run(native,id,options={}){
  const trace=[],resultBody={synthetic:true},stop=()=>false;
  const input=options.nullInput?null:{clientTxnId:options.id??'fixture-txn',pnr:options.id??'fixture-pnr',accessToken:options.token===undefined?'fixture-token':options.token,greq:'fixture-greq',bmiyek:'fixture-bmiyek',spaCsrf:'fixture-csrf',lang:options.lang,stopRetry:stop};
  let tokenReads=0;
  if(options.tokenGetter)Object.defineProperty(input,'accessToken',{get(){tokenReads++;return tokenReads%2?'first-fixture-token':'second-fixture-token';}});
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{}}),root=engine.context(6,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  const response={
    json(){trace.push(['json']);if(options.json==='throw')throw Error('synthetic json');if(options.json==='reject')return Promise.reject(Error('synthetic json'));if(options.json==='nonPromise')return resultBody;return Promise.resolve(resultBody);},
    status(){trace.push(['status']);if(options.status==='throw')throw Error('synthetic status');return 200;},
  };
  const actor={hosts:{wps:'https://example.invalid'},
    async reqRetry(name,operation,...rest){assert.equal(this,actor);trace.push(['retry',name,rest.length,rest[0],rest[1]===stop]);if(options.retry==='throw')throw Error('synthetic retry');if(options.retry==='twice')await operation();return operation();},
    async gwHeaders(host,settings){assert.equal(this,actor);trace.push(['headers',host,settings]);
      if(options.headers==='throw')throw Error('synthetic headers');
      if(options.replaceGet)actor.req.get=()=>{throw Error('replacement get must not run');};
      await Promise.resolve();return{'fixture-header':'fixture-value'};
    },
    req:{async get(url,settings){assert.equal(this,actor.req);trace.push(['get',url,settings]);if(options.get==='throw')throw Error('synthetic get');return response;}},
    log(value){trace.push(['log',value]);if(options.log==='throw')throw Error('synthetic log');},
  };
  if(options.noHosts)delete actor.hosts;
  try{const value=await engine.makeFunction(id,engine.context(2,root)).call(actor,input);if(options.json==='reject')assert.deepEqual(value,id==='f1719'?{}:null);else assert.equal(value,resultBody);return{value,trace,tokenReads};}
  catch(error){return{error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{}),trace,tokenReads};}
}
const cases={success:{},noToken:{token:''},nullToken:{token:null},falseToken:{token:false},tokenGetter:{tokenGetter:true},
  literalId:{id:'a/b?fixture=1'},numericId:{id:0},lang:{lang:'hi'},emptyLang:{lang:''},numericLang:{lang:0},
  jsonRejected:{json:'reject'},jsonThrows:{json:'throw'},jsonNonPromise:{json:'nonPromise'},retryThrows:{retry:'throw'},twoAttempts:{retry:'twice'},
  headersThrow:{headers:'throw'},getThrows:{get:'throw'},statusThrows:{status:'throw'},logThrows:{log:'throw'},nullInput:{nullInput:true},noHosts:{noHosts:true},capturedGet:{replaceGet:true},
};
for(const id of ['f1719','f1727'])for(const[name,options]of Object.entries(cases))
  test('gateway request matches actual recovered '+id+': '+name,async()=>assert.deepEqual(await run(true,id,options),await run(false,id,options)));
test('booking-data uses bounded retry arguments; print-ticket retains the retry default',async()=>{
  const booking=await run(true,'f1719'),print=await run(true,'f1727');
  assert.deepEqual(booking.trace[0],['retry','bookingData',2,4,true]);
  assert.deepEqual(print.trace[0],['retry','printTicket',0,undefined,false]);
  assert.equal(booking.trace[1][2].omitOrigin,true);
  assert.equal(print.trace[1][2].extra['Content-Type'],'application/json; charset=UTF-8');
});

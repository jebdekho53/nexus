'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
async function run(native,options={}){
  const trace=[],records=[],clock={now(){trace.push(['clock']);return 12345;}};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{clock}}):{},globals:{Object,String,JSON,Date:clock}}),root=engine.context(6,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  const headers={fixture:'request-header'},actor={onHttpRecord(record){assert.equal(this,actor);trace.push(['callback']);records.push(record);if(options.callback==='throw')throw Error('synthetic callback');if(options.callback==='pending')return new Promise(()=>{});}};
  if(options.disabled)actor.onHttpRecord=options.disabledValue;
  if(options.callback==='invalid')actor.onHttpRecord=true;
  if(options.guardThrow)Object.defineProperty(actor,'onHttpRecord',{get(){trace.push(['guard']);throw Error('synthetic guard');}});
  const input=options.input===undefined?{headers,data:'fixture body'}:options.input;
  if(options.circular){input.data={};input.data.self=input.data;}
  const response=options.noResponse?null:{
    status(){trace.push(['status']);if(options.statusThrow)throw Error('synthetic status');return 201;},
    headers(){trace.push(['headers']);if(options.headersThrow)throw Error('synthetic headers');return {fixture:'response-header'};},
    text(){trace.push(['text']);if(options.text==='throw')throw Error('synthetic text');if(options.text==='reject')return Promise.reject(Error('synthetic text'));return Promise.resolve(options.body===undefined?'fixture response':options.body);},
  };
  try{
    const value=await engine.makeFunction('f1649',engine.context(2,root)).call(actor,options.method===undefined?'post':options.method,'https://example.invalid/path',input,response,options.error);
    if(records[0]&&input?.headers)assert.equal(records[0].reqHeaders,input.headers,'Request header reference retained');
    return{value,trace,records};
  }catch(error){return{error:error.name,trace,records};}
}
const cases={success:{},form:{input:{form:{a:'fixture value',b:'second&field'}}},formClip:{input:{form:{long:'x'.repeat(1000)}}},arrayForm:{input:{form:['one','two']}},scalarForm:{input:{form:12}},
  json:{input:{data:{fixture:'json'}}},dataClip:{input:{data:'x'.repeat(2500)}},falseData:{input:{data:false}},zeroData:{input:{data:0}},nullData:{input:{data:null}},
  emptyInput:{input:{}},nullInput:{input:null},circular:{circular:true},bodyClip:{body:'x'.repeat(17000)},bufferBody:{body:Buffer.from('fixture buffer')},numericBody:{body:12},
  noResponse:{noResponse:true},thrownRequest:{error:new Error('synthetic request failure'),noResponse:true},longError:{error:{message:'x'.repeat(500)},noResponse:true},emptyError:{error:{message:''}},
  textReject:{text:'reject'},textThrow:{text:'throw'},statusThrow:{statusThrow:true},headersThrow:{headersThrow:true},
  callbackThrows:{callback:'throw'},callbackPending:{callback:'pending'},invalidCallback:{callback:'invalid'},invalidMethod:{method:null},
  disabled:{disabled:true},disabledNull:{disabled:true,disabledValue:null},guardThrows:{guardThrow:true}};
for(const[name,options]of Object.entries(cases))test('optional HTTP recorder matches recovered callback/limit behavior: '+name,async()=>assert.deepEqual(await run(true,options),await run(false,options)));
test('HTTP recorder stays inert without a callback and applies original truncation limits',async()=>{
  const off=await run(true,{disabled:true});assert.deepEqual(off.trace,[]);assert.deepEqual(off.records,[]);
  const clipped=await run(true,{input:{form:{long:'x'.repeat(1000)}},body:'y'.repeat(17000)});
  assert.equal(clipped.records[0].reqBody.length,'long='.length+600);assert.equal(clipped.records[0].resBody.length,16000);assert.equal(clipped.records[0].method,'POST*');
  assert.equal((await run(true,{input:{data:'x'.repeat(2500)}})).records[0].reqBody.length,2000);
});

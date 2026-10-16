'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
function fixture(native,options={}) {
  const globals={URL,Buffer,String,JSON,...options.globals};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{globals}}):{},globals}),root=engine.context(785,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  for(const[slot,id]of [[776,'f1601'],[779,'f1605'],[780,'f1606'],[781,'f1607']])root[slot]=engine.makeFunction(id,root);
  return{root,get:id=>engine.makeFunction(id,id==='f1687'?engine.context(2,root):root)};
}
const app=data=>'pushAppData = "'+Buffer.from(JSON.stringify(data)).toString('base64')+'"';
const parserCases={
  f1601:[[app({qr:{image:'synthetic-image'}})],[''],["pushAppData='bad-base64'"],[app(null)],[app('synthetic-string')],["PUSHAPPDATA='e30='"],[null],[undefined],[{toString(){return app({orderId:7});}}]],
  f1605:[[null],[{}],[{qr:{dataurl:'data:image/png;base64,synthetic-image'}}],[{qr:{dataurl:'',image:'ignored'}}],[{qr:{dataUrl:'second'}}],[{qr:{image:'third'}}],[{qr:{dataurl:7,image:'ignored'}}],[{qr:{image:'DATA:image/png;base64,unchanged'}}],[{qr:{dataurl:null,dataUrl:false,image:'ignored'}}]],
  f1606:[['https://example.invalid/?orderid=first&orderId=second'],['https://example.invalid/?orderid=&orderId=second'],['https://example.invalid/?ORDER_ID=third'],['/relative?orderid=ignored'],['bad-url'],[null],[undefined],['https://example.invalid/?orderid=a%26b']],
  f1607:[[{orderId:5},'bad-url'],[{orderId:'',orderid:'ignored'},'https://example.invalid/?orderid=url'],[{orderId:null,orderid:7},'bad-url'],[{ORDER_ID:'third'},'bad-url'],[null,'https://example.invalid/?orderId=url'],[{orderId:false,ORDER_ID:'ignored'},'bad-url'],[{orderId:{toString(){return 'synthetic-object';}}},'bad-url']],
};
for(const[id,cases]of Object.entries(parserCases))for(const[index,args]of cases.entries())test('PayTM response parser matches recovered '+id+' case'+index,()=>{
  const evaluate=native=>{try{return{value:fixture(native).get(id)(...args)};}catch(error){return{error:error.name};}};
  assert.deepEqual(evaluate(true),evaluate(false));
});
for(const name of ['atob','bufferFail','atobFail'])test('PayTM app data decoder compatibility: '+name,()=>{
  const globals=name==='atob'?{atob:value=>Buffer.from(value,'base64').toString('utf8')}:name==='bufferFail'?{Buffer:{from(){throw Error('synthetic buffer');}}}:{atob(){throw Error('synthetic atob');}};
  assert.deepEqual(fixture(true,{globals}).get('f1601')(app({orderId:7})),fixture(false,{globals}).get('f1601')(app({orderId:7})));
});
async function run(native,options={}) {
  const trace=[],logs=[],f=fixture(native);
  for(const[slot,key]of [[776,'parse'],[779,'image'],[780,'urlOrder'],[781,'dataOrder']]){
    const original=f.root[slot];f.root[slot]=(...args)=>{trace.push([key,...args]);if(options.fail===key)throw Error('synthetic '+key);return original(...args);};
  }
  const data=options.data??{qr:{image:'data:image/png;base64,synthetic-image'},orderId:'synthetic-data-order'};
  const html=options.html??app(data);
  const actor={hosts:{paytm:'https://gateway.invalid'},
    reqRetry(label,operation){trace.push(['retry',label]);if(options.fail==='retry')throw Error('synthetic retry');return operation();},
    async gwHeaders(host,settings){trace.push(['headers',host,settings]);if(options.fail==='headers')throw Error('synthetic headers');if(options.replacePost)actor.req.post=()=>{throw Error('replacement post must not run');};if(options.mutateInput)input.mid='synthetic-changed-mid';return{synthetic:'header'};},
    req:{async post(url,settings){assert.equal(this,actor.req);trace.push(['post',url,settings]);if(options.fail==='post')throw Error('synthetic post');return{
      async text(){trace.push(['text']);if(options.fail==='text')throw Error('synthetic text');return html;},
      url(){trace.push(['responseUrl']);if(options.fail==='responseUrl')throw Error('synthetic responseUrl');return options.responseUrl??'https://response.invalid/?ORDER_ID=synthetic-response-order';},
      status(){trace.push(['status']);if(options.fail==='status')throw Error('synthetic status');return 200;},
    };}},
    snip(value){trace.push(['snip',value]);if(options.fail==='snip')throw Error('synthetic snip');return value;},
    log(value){trace.push(['log']);logs.push(value);if(options.fail==='log')throw Error('synthetic log');},
  };
  const input=options.nullInput?null:{action:options.action??'/start?orderid=synthetic-url-order',mid:'synthetic-mid',encData:'synthetic-enc',checksum:'synthetic-checksum'};
  let result;try{result={value:await f.get('f1687').call(actor,input)};}catch(error){result={error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{})};}
  return{...result,trace,logs:logs.map(value=>value.replace(/ url=.*? pushApp=/,' pushApp=').replace(/ orderId=.*?( :: |$)/,' orderId=<redacted>$1').split(' :: ')[0]),rawLogs:logs};
}
const cases={ordinary:{},dataOrder:{action:'/start'},responseOrder:{action:'/start',data:{qr:{image:'synthetic-image'}}},noOrder:{action:'/start',data:{},responseUrl:'https://response.invalid/'},invalidUrl:{action:'http://['},missingAction:{action:''},emptyHtml:{html:''},capturedPost:{replacePost:true},fieldsAfterHeaders:{mutateInput:true},nullInput:{nullInput:true}};
for(const fail of ['retry','headers','post','text','parse','image','urlOrder','dataOrder','responseUrl','status','snip','log'])cases['failure-'+fail]={fail,action:'/start',data:{}};
for(const[name,options]of Object.entries(cases))test('PayTM QR request matches recovered request/parse/fallback flow: '+name,async()=>{
  const actual=await run(true,options),expected=await run(false,options);delete actual.rawLogs;delete expected.rawLogs;assert.deepEqual(actual,expected);
});
test('PayTM QR diagnostics omit URL, order identifier and raw HTML',async()=>{
  const value=await run(true);assert.equal(value.rawLogs.length,1);assert.doesNotMatch(value.rawLogs.join(' '),/gateway\.invalid|synthetic-url-order|pushAppData|synthetic-image|synthetic-checksum/);assert.match(value.rawLogs[0],/orderId=y/);
});

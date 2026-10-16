'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
function fixture(native,id){
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{URL,Number,String,Math}}),root=engine.context(2133,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[2132]=source=>new Function('return ('+source+')')();
  return engine.makeFunction(id,engine.context(2,root));
}
const nav={userAgent:'fixture UA Chrome/130.0',language:'en-IN',userAgentData:{brands:[{brand:'Chromium',version:'130'},{brand:'Fixture Browser',version:'1'}],mobile:false,platform:'Windows'}};
async function hintRun(native,options={}){
  const trace=[];let evaluated;
  const actor={hints:options.cached,page:{evaluate(fn){trace.push(['evaluate']);
    if(options.evaluation==='throw')throw Error('synthetic evaluate');
    if(options.evaluation==='reject')return Promise.reject(Error('synthetic evaluate'));
    if(options.evaluation==='nonPromise')return {};
    if(options.evaluation==='null')evaluated=null;
    else if(options.evaluation==='noUa')evaluated={lang:'fixture-language'};
    else evaluated=vm.runInNewContext('('+fn.toString()+')()',{navigator:options.navigator??nav});
    return Promise.resolve(evaluated);
  }}};
  if(options.noPage)delete actor.page;
  try{const fn=fixture(native,'f1660'),first=await fn.call(actor),second=await fn.call(actor);
    if(evaluated?.ua)assert.equal(first,evaluated,'Cache retains actual evaluated reference');
    if(actor.hints)assert.equal(first,second);
    return{first:structuredClone(first),second:structuredClone(second),cached:structuredClone(actor.hints),trace};
  }catch(error){return{error:error.name,trace};}
}
for(const[name,options]of Object.entries({normal:{},mobile:{navigator:{...nav,userAgentData:{...nav.userAgentData,mobile:true,platform:'Android'}}},
  legacyNavigator:{navigator:{userAgent:'fixture legacy',language:''}},emptyBrands:{navigator:{...nav,userAgentData:{}}},
  noUa:{evaluation:'noUa'},null:{evaluation:'null'},reject:{evaluation:'reject'},throw:{evaluation:'throw'},nonPromise:{evaluation:'nonPromise'},noPage:{noPage:true},
  cached:{cached:{ua:'fixture-cached'}},cachedPrimitive:{cached:'fixture-cached'},
}))test('client hints match recovered evaluation, fallback and cache semantics: '+name,async()=>assert.deepEqual(await hintRun(true,options),await hintRun(false,options)));
async function gatewayRun(native,hints,cached){
  let reads=0;const actor={desktopHints:cached,async clientHints(){reads++;return hints;}};
  try{const fn=fixture(native,'f1662'),first=await fn.call(actor),second=await fn.call(actor);assert.equal(first,second);assert.equal(first,actor.desktopHints);return{value:first,reads};}
  catch(error){return{error:error.name,reads};}
}
for(const[name,hints]of Object.entries({uaWins:{ua:'Chrome/135.0',secChUa:'"Chromium";v="130"'},brandWins:{ua:'Chrome/130.0',secChUa:'"Google Chrome";v="136"'},
  default:{ua:'fixture',secChUa:''},empty:{},zero:{ua:'Chrome/0',secChUa:'"Chromium";v="0"'},lowercase:{ua:'chrome/139',secChUa:'"chromium";v="139"'},null:null,
}))test('gateway hints preserve recovered version selection and cache: '+name,async()=>assert.deepEqual(await gatewayRun(true,hints),await gatewayRun(false,hints)));
test('cached gateway hints return before inspecting the browser',async()=>{
  assert.deepEqual(await gatewayRun(true,null,{ua:'fixture-cache'}),await gatewayRun(false,null,{ua:'fixture-cache'}));
});
function originRun(native,id,input,options={}){
  const trace=[],actor={gatewayPageOrigin:options.existing,hosts:{providerOrigin:'https://fallback.invalid',wps:'https://wps.invalid',qrGateway:'https://qr.invalid',paytm:'https://paytm.invalid',phonepeMercury:options.phonepe,razorpay:options.razorpay},
    page:{url(){trace.push(['url']);if(options.throwPage)throw Error('synthetic url');return options.pageUrl??'https://provider.invalid/path';}},
    liveProviderOrigin(){trace.push(['provider-origin']);return 'https://live.invalid';},
  };
  if(options.noHosts)delete actor.hosts;
  if(options.hostGetter)Object.defineProperty(actor.hosts,'qrGateway',{get(){trace.push(['qr-host']);return'https://qr.invalid';}});
  try{return{value:fixture(native,id).call(actor,input),origin:actor.gatewayPageOrigin,trace};}catch(error){return{error:error.name,origin:actor.gatewayPageOrigin,trace};}
}
for(const [name,options]of Object.entries({http:{},https:{pageUrl:'https://provider.invalid:443/route'},opaque:{pageUrl:'data:text/plain,fixture'},invalid:{pageUrl:'fixture invalid'},throwing:{throwPage:true},fallbackError:{noHosts:true,throwPage:true},validWithoutHosts:{noHosts:true}}))
  test('live provider origin matches recovered URL/fallback behavior: '+name,()=>assert.deepEqual(originRun(true,'f1659',undefined,options),originRun(false,'f1659',undefined,options)));
for(const url of ['https://gateway.invalid/path','data:text/plain,fixture','invalid','',null,0])
  test('gateway page origin update preserves existing value on rejected URL: '+String(url),()=>assert.deepEqual(originRun(true,'f1663',url,{existing:'https://existing.invalid'}),originRun(false,'f1663',url,{existing:'https://existing.invalid'})));
for(const existing of [undefined,'','https://gateway.invalid','null'])test('gateway page referrer matches recovered optional result: '+String(existing),()=>assert.deepEqual(originRun(true,'f1664',undefined,{existing}),originRun(false,'f1664',undefined,{existing})));
test('gateway origin mapping matches recovered host aliases, missing values and property reads',()=>{
  for(const host of ['wps','qr','paytm','phonepe','mercury','razorpay','unknown',0])for(const options of [{},{phonepe:'https://phone.invalid',razorpay:'https://razor.invalid'},{phonepe:'',razorpay:''},{noHosts:true},{hostGetter:true}])
    assert.deepEqual(originRun(true,'f1665',host,options),originRun(false,'f1665',host,options));
});

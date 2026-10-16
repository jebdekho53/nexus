'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
function fixture(native,id,globals={atob,Buffer}){
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{globals}}):{},globals:{String,Number,URL,JSON,...globals}}),root=engine.context(785,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[777]=engine.makeFunction('f1602',root);root[782]=engine.makeFunction('f1608',root);
  return engine.makeFunction(id,id==='f1668'?engine.context(2,root):root);
}
function config(value){return '<textarea id="app-config-data">'+Buffer.from(JSON.stringify(value),'utf8').toString('base64')+'</textarea>';}
test('provider config parser matches recovered base64, whitespace, errors and decoder preference',()=>{
  const values=[config({responseParams:{rid:'fixture'}}),config(null),config('fixture'),config({text:'é'}),'<TEXTAREA ID="app-config-data">\n'+Buffer.from('{"fixture":true}').toString('base64')+'\n</TEXTAREA>',
    '<textarea id="app-config-data">%%%invalid%%%</textarea>','<textarea id="app-config-data">aW52YWxpZA==</textarea>','',null,undefined,0];
  for(const globals of [{atob,Buffer},{atob:null,Buffer},{atob(){throw Error('synthetic decoding');},Buffer},{atob:null,Buffer:null}])for(const value of values)
    assert.deepEqual(fixture(true,'f1602',globals)(value),fixture(false,'f1602',globals)(value));
});
test('QR amount parser preserves original positive finite matching/coercion',()=>{
  for(const value of ['',null,undefined,false,0,'upi://pay?am=1.25','upi://pay?AM=2','upi://pay?am=0','upi://pay?am=-1','upi://pay?am=1e3','upi://pay?am=1.2.3','upi://pay?x=1&am=123','upi://pay?am='+'9'.repeat(400)])
    assert.equal(fixture(true,'f1608')(value),fixture(false,'f1608')(value));
});
const params={rid:'fixture-rid',merchantId:'fixture-merchant',merchantTxnNo:'fixture-transaction',isCallFromPaymentOptionsPage:'fixture-page-token'};
async function run(native,options={}){
  const trace=[],rawLogs=[],cfg=options.params===undefined?params:options.params;
  const html=options.html??('<!-- fixture-sensitive-auth-marker -->'+config({responseParams:cfg}));
  const action=options.action===undefined?'https://pg.invalid/sale':options.action;
  const body=options.body===undefined?{upiQR:'upi://pay?am=99.50',errorcode:'fixture-code'}:options.body;
  const actor={hosts:{wps:options.wps===undefined?'https://wps.invalid///':options.wps,qrGateway:options.pg===undefined?'https://fallback.invalid///':options.pg},
    async reqRetry(name,operation){trace.push(['retry',name]);if(options.retryThrow===name)throw Error('synthetic retry');return operation();},
    async gwHeaders(host,settings){trace.push(['headers',host,settings]);if(options.headersThrow)throw Error('synthetic headers');return{'fixture-header':'fixture-value'};},
    req:{async post(url,settings){assert.equal(this,actor.req);trace.push(['post',url,settings]);if(options.postThrow)throw Error('synthetic post');
      if(settings.maxRedirects===0)return{
        headers(){trace.push(['sale-headers']);if(options.saleHeadersThrow)throw Error('synthetic headers');return options.saleHeaders??{location:'/auth?tranCtx=fixture-transaction-context'};},
        status:()=>302,
      };
      return{status:()=>200,json(){trace.push(['generate-json']);if(options.json==='throw')throw Error('synthetic json');if(options.json==='reject')return Promise.reject(Error('synthetic json'));return Promise.resolve(body);}};
    },async get(url,settings){assert.equal(this,actor.req);trace.push(['get',url,settings]);if(options.getThrow)throw Error('synthetic get');return{status:()=>200,async text(){trace.push(['auth-text']);if(options.textThrow)throw Error('synthetic text');return html;}};}},
    log(message,...rest){rawLogs.push(message);if(/^providerQr: authRedirect page missing ids/.test(message))message='providerQr: authRedirect page missing ids';trace.push(['log',message,...rest]);if(options.logThrow)throw Error('synthetic log');},
  };
  try{
    const value=await fixture(native,'f1668').call(actor,action,'fixture-encdata');
    if(native)assert.equal(rawLogs.some(message=>message.includes('fixture-sensitive-auth-marker')),false,'Authentication HTML must not be logged');
    return{value,trace};
  }catch(error){return{error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{}),trace};}
}
const cases={success:{},relativeAction:{action:'/sale'},noOrigin:{action:'invalid',pg:''},opaqueAction:{action:'data:text/plain,fixture'},emptyWps:{wps:''},
  relativeAuth:{saleHeaders:{location:'auth?tranCtx=fixture-context'}},absoluteAuth:{saleHeaders:{location:'https://other.invalid/auth?tranCtx=fixture-context'}},missingLocation:{saleHeaders:{}},invalidLocation:{saleHeaders:{location:'http://['}},
  missingConfig:{html:'<!-- fixture-sensitive-auth-marker --> no config'},missingIds:{params:{}},ridFallback:{params:{merchantId:'fixture',merchantTxnNo:'fixture'}},zeroRid:{params:{...params,rid:0}},
  orderAlias:{params:{rid:'fixture',merchantId:'fixture',orderId:'fixture-order'}},invoiceAlias:{params:{rid:'fixture',merchantId:'fixture',invoiceNo:'fixture-invoice'}},
  customGenerateUrl:{params:{...params,internalGenerateQRApiUrl:'https://custom.invalid/generate'}},relativeGenerateUrl:{params:{...params,internalGenerateQRApiUrl:'/generate'}},
  intentAlias:{body:{intent:'upi://pay?am=123'}},emptyUpiNoAlias:{body:{upiQR:'',intent:'fixture-intent'}},nullBody:{body:null},emptyBody:{body:{}},
  jsonReject:{json:'reject'},jsonThrow:{json:'throw'},headersFail:{headersThrow:true},postFail:{postThrow:true},getFail:{getThrow:true},textFail:{textThrow:true},saleHeadersFail:{saleHeadersThrow:true},logFail:{logThrow:true},
  saleRetryFail:{retryThrow:'providerQr sale'},authRetryFail:{retryThrow:'providerQr authRedirect'},generateRetryFail:{retryThrow:'providerQr generateAndShowQR'}};
for(const[name,options]of Object.entries(cases))test('provider QR request matches recovered flow: '+name,async()=>assert.deepEqual(await run(true,options),await run(false,options)));
test('provider QR sends only rid in generation data after sale and authentication GET',async()=>{
  const result=await run(true);assert.deepEqual(result.trace.filter(row=>row[0]==='retry').map(row=>row[1]),['providerQr sale','providerQr authRedirect','providerQr generateAndShowQR']);
  const posts=result.trace.filter(row=>row[0]==='post');assert.equal(posts.length,2);assert.deepEqual(posts[0][2].form,{encdata:'fixture-encdata'});assert.equal(posts[0][2].maxRedirects,0);
  assert.equal(posts[1][2].data,JSON.stringify({rid:'fixture-rid'}));assert.equal(result.value.qrAmount,99.5);
});

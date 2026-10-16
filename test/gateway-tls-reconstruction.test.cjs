'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
async function run(native,options={}){
  const trace=[],response={status:options.status??201,url:options.responseUrl,body:options.body===undefined?'[1,2]':options.body,headers:options.responseHeaders===undefined?{'X-Fixture':['first','second'],'Set-Cookie':['fixture=one','excluded=two']}:options.responseHeaders};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{Object,URLSearchParams,String,Number,JSON,Buffer}}),root=engine.context(769,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  const context={synthetic:'context'};
  root[764]=function(ctx,url){assert.equal(this,undefined);assert.equal(ctx,context);trace.push(['cookie-header',url]);if(options.cookieThrow)throw Error('synthetic cookies');if(options.cookieReject)return Promise.reject(Error('synthetic cookies'));return Promise.resolve(options.cookies===undefined?'fixture=one; excluded=two':options.cookies);};
  root[250]=function(value){trace.push(['filter-cookie-header',value]);return 'fixture=one';};
  root[252]=function(values){trace.push(['filter-set-cookies',values]);return values.filter(value=>!value.startsWith('excluded='));};
  root[768]=function(ctx,url,values){assert.equal(this,undefined);assert.equal(ctx,context);trace.push(['apply-cookies',url,values]);if(options.applyThrow)throw Error('synthetic import');if(options.applyReject)return Promise.reject(Error('synthetic import'));return Promise.resolve();};
  const actor={stripF5:!!options.filter,
    page:{context(){trace.push(['context']);if(options.contextThrow)throw Error('synthetic context');return context;}},
    webTlsGateway:function(url,settings){assert.equal(this,undefined);trace.push(['gateway',url,settings]);if(options.gatewayThrow)throw Error('synthetic gateway');if(options.gatewayReject)return Promise.reject(Error('synthetic gateway'));return Promise.resolve(response);},
  };
  let input=options.input===undefined?{headers:{'X-Fixture':'fixture-header'}}:options.input;
  if(options.circular){const data={};data.self=data;input={data};}
  try{
    const facade=await engine.makeFunction('f1633',engine.context(2,root)).call(actor,options.method??'post','https://example.invalid/path',input);
    const keys=Object.keys(facade),status=facade.status(),ok=facade.ok(),url=facade.url(),headers=facade.headers(),array=facade.headersArray();
    assert.equal(facade.headers(),headers,'Flattened headers retain their captured object');
    const text=await facade.text();let json,jsonError,body,bodyError;
    try{json=await facade.json();}catch(error){jsonError=error.name;}
    try{body=(await facade.body()).toString('hex');}catch(error){bodyError=error.name;}
    if(options.mutateResponse){response.status=503;response.url='https://changed.invalid';response.body='changed';response.headers['X-Fixture'].push('third');}
    const later={status:facade.status(),url:facade.url(),text:await facade.text(),headers:facade.headers(),array:facade.headersArray()};
    if(options.mutateResponse){assert.equal(later.status,status);assert.equal(later.text,text);assert.equal(later.url,'https://changed.invalid');}
    return{keys,status,statusText:facade.statusText(),ok,url,headers,array,text,json,jsonError,body,bodyError,later,fetchUid:facade.fetchUid(),disposed:await facade.dispose(),trace};
  }catch(error){return{error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{}),trace};}
}
const cases={success:{},get:{method:'get'},otherMethod:{method:'POST'},nullInput:{input:null},form:{input:{form:{space:'a b',nullValue:null,missing:undefined,number:12}}},
  arrayForm:{input:{form:['one','two']}},stringForm:{input:{form:'fixture'}},emptyForm:{input:{form:{}}},json:{input:{data:{fixture:'value'}}},
  text:{input:{data:'fixture body'}},nullData:{input:{data:null}},zeroData:{input:{data:0}},falseData:{input:{data:false}},circular:{circular:true},
  contentType:{input:{form:{x:1},headers:{'CONTENT-TYPE':'fixture/type'}}},falseContentType:{input:{data:'fixture',headers:{'Content-Type':''}}},
  emptyCookies:{cookies:''},rejectedCookies:{cookieReject:true},thrownCookies:{cookieThrow:true},filterCookies:{filter:true},
  suppliedCookie:{cookies:'',input:{headers:{Cookie:'supplied=fixture'}}},overrideSuppliedCookie:{input:{headers:{Cookie:'supplied=fixture'}}},
  timeout:{input:{timeout:1234}},stringTimeout:{input:{timeout:'1234'}},negativeTimeout:{input:{timeout:-1}},invalidTimeout:{input:{timeout:'invalid'}},
  manualRedirect:{input:{maxRedirects:0}},stringRedirect:{input:{maxRedirects:'0'}},defaultRedirect:{input:{maxRedirects:null}},
  gatewayThrow:{gatewayThrow:true},gatewayReject:{gatewayReject:true},contextThrow:{contextThrow:true},applyReject:{applyReject:true},applyThrow:{applyThrow:true},
  noResponseHeaders:{responseHeaders:null},invalidResponseHeaders:{responseHeaders:{fixture:'string'}},nullBody:{body:null},invalidJson:{body:'invalid json'},
  numericBody:{body:12},statusTextIgnored:{status:503},stringStatus:{status:'202'},responseUrl:{responseUrl:'https://response.invalid'},mutableFacade:{mutateResponse:true},
};
for(const[name,options]of Object.entries(cases))test('configured TLS transport and response facade match recovered behavior: '+name,async()=>assert.deepEqual(await run(true,structuredClone(options)),await run(false,structuredClone(options))));
test('configured TLS transport retains form serialization, cookie policy and manual redirect contract',async()=>{
  const result=await run(true,{filter:true,input:{form:{fixture:'a b'},maxRedirects:0,timeout:1234}}),request=result.trace.find(row=>row[0]==='gateway')[2];
  assert.equal(request.data,'fixture=a+b');assert.equal(request.headers.cookie,'fixture=one');assert.equal(request.headers['content-type'],'application/x-www-form-urlencoded');assert.equal(request.manualRedirect,true);assert.equal(request.timeoutMs,1234);
  assert.deepEqual(result.trace.find(row=>row[0]==='apply-cookies')[2],['fixture=one']);
});

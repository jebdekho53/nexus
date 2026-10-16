'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
function fixture(native,id){
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{URL}}),root=engine.context(2133,null);
  root[5]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined);return table[n+'|'+key];};
  root[2132]=source=>vm.runInNewContext('('+source+')');
  return engine.makeFunction(id,engine.context(2,root));
}
async function request(native,options={}) {
  const trace=[];
  const actor={hosts:{paytm:'https://gateway.invalid'},async paytmOriginPage(){trace.push(['page']);if(options.pageError)throw Error('synthetic page');return options.noPage?null:page;}};
  const page={evaluate(fn,args){
    trace.push(['evaluate',args]);if(options.evaluateSync)throw Error('synthetic evaluate');if(options.evaluateReject)return Promise.reject(Error('synthetic evaluate rejection'));
    const run=vm.runInNewContext('('+fn.toString()+')',{fetch:async(url,settings)=>{trace.push(['fetch',url,JSON.parse(JSON.stringify(settings))]);if(options.fetchError)throw Error('synthetic fetch');return{status:201,async text(){trace.push(['text']);if(options.textError)throw Error('synthetic text');return 'synthetic-response';}};}});
    return run(args);
  }};
  try{const value=await fixture(native,'f1708').call(actor,'/synthetic-path',options.nullOptions?null:{method:options.method??'POST',body:options.body,referer:options.referer});return{value:value===undefined?undefined:JSON.parse(JSON.stringify(value)),trace};}
  catch(error){return{error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{}),trace};}
}
const cases={post:{body:'synthetic=body',referer:'https://gateway.invalid/start'},emptyPost:{},falseBody:{body:false},get:{method:'GET',body:'ignored',referer:'synthetic-referer'},lowercasePost:{method:'post',body:'ignored'},pageAbsent:{noPage:true},pageError:{pageError:true},evaluateSync:{evaluateSync:true},evaluateReject:{evaluateReject:true},fetchError:{fetchError:true},textError:{textError:true},nullOptions:{nullOptions:true}};
for(const[name,options]of Object.entries(cases))test('PayTM browser request preserves recovered evaluation/credential/error behavior: '+name,async()=>assert.deepEqual(await request(true,options),await request(false,options)));

async function dispose(native,options={}) {
  const trace=[],replacement={syntheticReplacement:true};let release;
  const page={isClosed(){trace.push(['closed']);if(options.closedThrows)throw Error('synthetic closed');return !!options.closed;},close(){trace.push(['close']);if(options.closeThrows)throw Error('synthetic close');if(options.reject)return Promise.reject(Error('synthetic reject'));if(options.pending)return new Promise(resolve=>{release=resolve;});return Promise.resolve();}};
  const actor={paytmPage:options.absent?undefined:page};
  const promise=fixture(native,'f1710').call(actor);const clearedBeforeAwait=actor.paytmPage===undefined;
  if(options.pending){actor.paytmPage=replacement;release();}
  try{const value=await promise;return{value,trace,clearedBeforeAwait,retainedReplacement:actor.paytmPage===replacement};}
  catch(error){return{error:error.message,trace,clearedBeforeAwait,retainedReplacement:actor.paytmPage===replacement};}
}
for(const[name,options]of Object.entries({ordinary:{},absent:{absent:true},alreadyClosed:{closed:true},closedThrows:{closedThrows:true},syncCloseError:{closeThrows:true},asyncCloseError:{reject:true},replacementWhileClosing:{pending:true}}))test('PayTM page cleanup preserves actor ownership and errors: '+name,async()=>assert.deepEqual(await dispose(true,options),await dispose(false,options)));
test('PayTM browser fetch retains credentials and exact uppercase POST rules',async()=>{
  const post=await request(true,{body:'synthetic=body'});assert.deepEqual(post.trace.find(row=>row[0]==='fetch')[2],{method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'synthetic=body'});
  const get=await request(true,{method:'GET',body:'ignored'});assert.deepEqual(get.trace.find(row=>row[0]==='fetch')[2],{method:'GET',credentials:'include'});
  const replacement=await dispose(true,{pending:true});assert.equal(replacement.clearedBeforeAwait,true);assert.equal(replacement.retainedReplacement,true);
});

async function originPage(native,options={}) {
  const trace=[],document={title:'initial',body:{innerHTML:'initial',style:{}}};
  const page={isClosed(){trace.push(['closed']);if(options.fail==='closed')throw Error('synthetic closed');return !!options.closed;},
    goto(url,settings){trace.push(['goto',url,settings]);if(options.fail==='gotoSync')throw Error('synthetic goto');return options.fail==='gotoReject'?Promise.reject(Error('synthetic goto rejection')):Promise.resolve();},
    url(){trace.push(['url']);if(options.fail==='url')throw Error('synthetic url');return options.wrongOrigin?'https://other.invalid/':options.invalidUrl?'bad-url':'https://gateway.invalid/path';},
    close(){trace.push(['close']);if(options.fail==='closeSync')throw Error('synthetic close');return options.fail==='closeReject'?Promise.reject(Error('synthetic close rejection')):Promise.resolve();},
    evaluate(fn){trace.push(['evaluate']);if(options.fail==='evaluateSync')throw Error('synthetic evaluate');if(options.fail==='evaluateReject')return Promise.reject(Error('synthetic evaluate rejection'));vm.runInNewContext('('+fn.toString()+')',{document:options.noDocument?undefined:document})();return Promise.resolve();},
  };
  const actor={hosts:{paytm:'https://gateway.invalid'},paytmPage:options.cached?page:undefined,
    page:{context(){trace.push(['context']);if(options.fail==='context')throw Error('synthetic context');return{async newPage(){trace.push(['new']);if(options.fail==='new')throw Error('synthetic new');return page;}};}},
  };
  try{const value=await fixture(native,'f1704').call(actor);return{result:value===page?'page':value,ownsPage:actor.paytmPage===page,trace,document};}
  catch(error){return{error:error.message,trace};}
}
const originCases={ordinary:{},cached:{cached:true},closedCache:{cached:true,closed:true},cacheError:{cached:true,fail:'closed'},wrongOrigin:{wrongOrigin:true},invalidUrl:{invalidUrl:true},noDocument:{noDocument:true},closeReject:{wrongOrigin:true,fail:'closeReject'},closeSync:{wrongOrigin:true,fail:'closeSync'}};
for(const fail of ['context','new','gotoSync','gotoReject','url','evaluateSync','evaluateReject'])originCases[fail]={fail};
for(const[name,options]of Object.entries(originCases))test('PayTM origin page preserves cached ownership, origin validation and errors: '+name,async()=>assert.deepEqual(await originPage(true,options),await originPage(false,options)));

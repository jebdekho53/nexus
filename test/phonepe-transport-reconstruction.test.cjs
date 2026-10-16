'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

function harness(native,options={}) {
  const random=()=>options.randomValue??0.25,math=Object.create(Math);math.random=random;
  const trace=[];
  const crypto=options.noCrypto?undefined:{getRandomValues(array){trace.push(['crypto',array.length]);array.forEach((_,i)=>{array[i]=(i*17+3)%256;});return options.cryptoReturn??array;}};
  const globals={Uint8Array,Array,Math:math,Promise,String,RegExp,JSON,Object,URL,encodeURIComponent,crypto};
  globals.globalThis=globals;
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{globals,random}}):{},globals});
  const root=engine.context(1842,null);
  root[5]=root[1841]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined,'missing fixture '+n+'|'+key);return table[n+'|'+key];};
  for(const[slot,id]of [[783,'f1609'],[784,'f1610']])root[slot]=engine.makeFunction(id,root);
  return{engine,root,context:engine.context(2,root),trace};
}
const outcome=async promise=>{try{return{value:await promise};}catch(error){return{error:error.message.startsWith('synthetic')?error.message:error.name,detail:process.env.DBG?error.message:undefined};}};

for(const[name,options]of Object.entries({crypto:{},noCrypto:{noCrypto:true},cachedLater:{},cryptoThrows:{cryptoReturn:null},lowRandom:{noCrypto:true,randomValue:0},highRandom:{noCrypto:true,randomValue:0.999}}))
  test('PhonePe fingerprint matches recovered generation and caching: '+name,async()=>{
    const run=native=>{
      const{engine,context,trace}=harness(native,options),actor={};
      const method=engine.makeFunction('f1730',context);
      const first=method.call(actor);const second=method.call(actor);
      actor.fp='cached-value';const third=method.call(actor);
      return{first,second,third,trace,stored:actor.fp};
    };
    assert.deepEqual(run(true),run(false));
  });
test('PhonePe fingerprint is 32 lowercase hexadecimal characters',()=>{
  for(const noCrypto of [false,true]){const{engine,context}=harness(true,{noCrypto});assert.match(engine.makeFunction('f1730',context).call({}),/^[0-9a-f]{32}$/);}
});

async function headers(native,options={}) {
  const{engine,context,trace}=harness(native);
  const actor={fingerprint(){trace.push(['fingerprint']);return 'synthetic-fingerprint';},peRoutingKey:options.routing,
    async gatewayHints(){trace.push(['hints']);if(options.fail==='hints')throw Error('synthetic hints');return{ua:options.ua};},
    async gwHeaders(host,settings){trace.push(['headers',host,settings]);if(options.fail==='headers')throw Error('synthetic headers');return{host,settings};}};
  const args=options.args??['synthetic-token',options.options];
  return{...await outcome(engine.makeFunction('f1733',context).apply(actor,args)),trace};
}
const headerCases={
  token:{ua:'synthetic-agent'},noToken:{args:[undefined,undefined]},noBearer:{args:['synthetic-token',{bearer:false}],ua:'ignored'},
  routing:{routing:'synthetic-route',ua:'synthetic-agent'},extraOverrides:{args:['synthetic-token',{extra:{Accept:'override',custom:'value'}}],ua:'x'},
  nullExtra:{args:['synthetic-token',{extra:null}]},emptyUserAgent:{ua:''},nullOptions:{args:['synthetic-token',null]},bearerNull:{args:['t',{bearer:null}],ua:'u'},
  hintsFail:{fail:'hints'},headersFail:{fail:'headers'},
};
for(const[name,options]of Object.entries(headerCases))test('PhonePe headers match recovered ordering and overrides: '+name,async()=>{
  const actual=await headers(true,options),expected=await headers(false,options);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)));
  assert.deepEqual(Object.keys(actual.value?.settings?.extra??{}),Object.keys(expected.value?.settings?.extra??{}));
});

async function redirect(native,options={}) {
  const{engine,context,trace}=harness(native),logs=[];
  const page=options.html??'<form action="/pay"><input name="token" value="synthetic-token"><input name="encdata" value="synthetic-enc"></form>';
  const actor={hosts:{wps:'https://provider.invalid'},
    async reqRetry(label,operation){trace.push(['retry',label]);if(options.fail==='retry')throw Error('synthetic retry');return operation();},
    async gwHeaders(host){trace.push(['headers',host]);if(options.fail==='headers')throw Error('synthetic headers');return{synthetic:'header'};},
    req:{post(url,settings){trace.push(['post',url,settings]);assert.equal(this,actor.req);if(options.fail==='post')throw Error('synthetic post');
      return Promise.resolve({status(){trace.push(['status']);return 202;},text(){trace.push(['text']);if(options.fail==='text')return Promise.reject(Error('synthetic text'));return Promise.resolve(page);}});}},
    log(value){trace.push(['log']);logs.push(value);},snip(text){trace.push(['snip',text]);if(options.fail==='snip')throw Error('synthetic snip');return text;}};
  const input={username:'synthetic-user',clientTxnId:'synthetic-txn',accessToken:'synthetic-access',rand8:'12345678',csrf:'synthetic-csrf'};
  return{...await outcome(engine.makeFunction('f1734',context).call(actor,options.input??input)),trace,logs:logs.map(v=>v.split(' :: ')[0]),rawLogs:logs};
}
const redirectCases={ordinary:{},encdataToken:{html:'<form action="/pay"><input name="encdata" value="synthetic-enc"></form>'},noToken:{html:'<form action="/pay"></form>'},noAction:{html:'<input name="token" value="synthetic-token">'},empty:{html:''},
  retryFail:{fail:'retry'},headersFail:{fail:'headers'},postFail:{fail:'post'},textFail:{fail:'text'},snipFail:{fail:'snip'},missingInput:{input:{}}};
for(const[name,options]of Object.entries(redirectCases))test('PhonePe redirect matches recovered retry/form/result flow: '+name,async()=>{
  const actual=await redirect(true,options),expected=await redirect(false,options);
  const normalize=value=>JSON.parse(JSON.stringify({...value,rawLogs:undefined,logs:value.logs.map(line=>line.replace(/action=.*/,'')) }));
  assert.deepEqual(normalize(actual),normalize(expected));
});
test('PhonePe redirect form key, retry name and private diagnostics',async()=>{
  const value=await redirect(true);const post=value.trace.find(row=>row[0]==='post');
  assert.equal(post[1],'https://provider.invalid/eticketing/PaymentRedirect');
  assert.deepEqual(post[2].form,{token:'synthetic-access',txn:'synthetic-user:synthetic-txn','synthetic-user:synthetic-txn':'12345678.synthetic-csrf'});
  assert.deepEqual(value.value,{action:'https://provider.invalid/pay'.replace('https://provider.invalid',''),token:'synthetic-token'});
  assert.equal(value.rawLogs[0],'phonePeRedirect → 202 action=y token=y');assert.doesNotMatch(value.rawLogs.join(' '),/synthetic|pay/);
});

// Full PhonePe QR sequence with synthetic transports; every call is traced in order.
async function qr(native,options={}) {
  const{engine,context,trace}=harness(native),logs=[];
  const bodies={exchange:'{"token":"synthetic-session"}',pay:'{"qrData":"data:image/png;base64,SYNTHETICIMAGE"}',routing:{routingKey:'synthetic-key'},...options.bodies};
  const response=(name,statusCode=200,ok=true)=>({
    status(){trace.push(['status',name]);return statusCode;},ok(){trace.push(['ok',name]);return ok;},
    json(){trace.push(['json',name]);if(options.fail==='json')return Promise.reject(Error('synthetic json'));return Promise.resolve(bodies.routing);},
    text(){trace.push(['text',name]);if(options.fail===name+'Text')return Promise.reject(Error('synthetic '+name+' text'));return Promise.resolve(typeof bodies[name]==='string'?bodies[name]:'plain-'+name);},
  });
  const choose=(name,fallbackStatus=200)=>{
    if(options.fail===name)throw Error('synthetic '+name);
    if(options.fail===name+'Reject')return Promise.reject(Error('synthetic '+name+' rejection'));
    if(options.missing===name)return Promise.resolve(undefined);
    return Promise.resolve(response(name,options.statuses?.[name]??fallbackStatus,!(options.notOk||[]).includes(name)));
  };
  const actor={hosts:{phonepeMercury:'https://mercury.invalid/base/',phonepeApi:'https://api.invalid',wps:'https://provider.invalid',...options.hosts},peRoutingKey:'previous',
    async reqRetry(label,operation){trace.push(['retry',label]);if(options.fail==='retry:'+label)throw Error('synthetic retry '+label);return operation();},
    async gwHeaders(host,settings){trace.push(['gw',host,settings]);return{synthetic:'gw'};},
    async phonePeHeaders(token,settings){trace.push(['ppHeaders',token,settings]);return{'content-type':'x','x-synthetic':'h'};},
    async clientHints(){trace.push(['hints']);return{ua:options.ua??'Chrome/131 synthetic'};},
    req:{
      get(url,settings){trace.push(['get',url,settings]);assert.equal(this,actor.req);return url.includes('routing-key')?choose('routing'):choose('exchange');},
      post(url,settings){trace.push(['post',url,settings]);assert.equal(this,actor.req);
        if(url.includes('base')||url.includes('mercury'))return choose('mercury');
        if(url.endsWith('/transaction/details'))return choose('details');
        if(url.endsWith('/instrument/validate'))return choose('validate');
        return choose('pay');},
    },
    log(value){trace.push(['log']);logs.push(value);},snip(text){trace.push(['snip',text]);return text;}};
  const result=await outcome(engine.makeFunction('f1736',context).call(actor,options.action,'synthetic-token'));
  return{...result,routingKey:actor.peRoutingKey,trace,logs:logs.map(v=>v.split(' :: ')[0].replace(/ key=.*/,'')),rawLogs:logs};
}
const qrCases={
  ordinary:{action:'/pay-page'},defaultAction:{},absoluteAction:{action:'https://other.invalid/x'},badAction:{action:'http://[bad'},
  noMercuryHost:{hosts:{phonepeMercury:undefined,phonepeApi:undefined},action:'https://mercury.invalid/start'},
  mercuryFails:{fail:'mercury'},mercuryRejects:{fail:'mercuryReject'},mercuryRetryFails:{fail:'retry:phonePe mercury'},
  routingMissing:{missing:'routing'},routingNotOk:{notOk:['routing']},routingJsonFails:{fail:'json'},routingNoKey:{bodies:{routing:{}}},routingNumeric:{bodies:{routing:{routingKey:42}}},routingNullBody:{bodies:{routing:null}},
  routingRejects:{fail:'routingReject'},
  exchangeNoToken:{bodies:{exchange:'{}'}},exchangeBadJson:{bodies:{exchange:'not-json'}},exchangeNumericToken:{bodies:{exchange:'{"token":7}'}},exchangeNullToken:{bodies:{exchange:'{"token":null}'}},exchangeNotOk:{notOk:['exchange'],bodies:{exchange:'{}'}},
  exchangeRetryFails:{fail:'retry:phonePe token/exchange'},exchangeTextFails:{fail:'exchangeText'},
  noChromeHint:{ua:'Firefox'},nullHint:{ua:undefined},
  detailsMissing:{missing:'details'},detailsNotOk:{notOk:['details']},detailsTextFails:{notOk:['details'],fail:'detailsText'},detailsRejects:{fail:'detailsReject'},
  validateMissing:{missing:'validate'},validateNotOk:{notOk:['validate']},validateRejects:{fail:'validateReject'},
  payAlternate:{bodies:{pay:'{"qrCode":"data:image/png;base64,ALT"}'}},payNoQr:{bodies:{pay:'{}'}},payBadJson:{bodies:{pay:'broken'}},payRawImage:{bodies:{pay:'{"qrData":"RAWIMAGE"}'}},payNotOk:{notOk:['pay']},
  payRetryFails:{fail:'retry:phonePe pay'},payTextFails:{fail:'payText'},payStatus:{statuses:{pay:429},notOk:['pay']},
};
for(const[name,options]of Object.entries(qrCases))test('PhonePe QR sequence matches recovered request/result flow: '+name,async()=>{
  const actual=await qr(true,options),expected=await qr(false,options);
  const normalize=value=>JSON.parse(JSON.stringify({...value,rawLogs:undefined}));
  assert.deepEqual(normalize(actual),normalize(expected));
});
test('PhonePe QR request sequence, headers and private diagnostics',async()=>{
  const value=await qr(true,{action:'/pay-page'});
  assert.deepEqual(value.value,{qrBase64:'SYNTHETICIMAGE',phonePeToken:'synthetic-session'});
  assert.equal(value.routingKey,'synthetic-key');
  const urls=value.trace.filter(row=>row[0]==='get'||row[0]==='post').map(row=>row[0]+' '+row[1]);
  assert.deepEqual(urls,['post https://mercury.invalid/pay-page','get https://api.invalid/apis/pg/checkout/ui/v2/routing-key','get https://api.invalid/apis/pg/checkout/ui/v2/token/exchange',
    'post https://api.invalid/apis/pg/checkout/ui/v2/transaction/details','post https://api.invalid/apis/pg/checkout/ui/v2/instrument/validate','post https://api.invalid/apis/pg/checkout/ui/v2/pay']);
  const details=value.trace.find(row=>row[0]==='ppHeaders'&&row[2].extra?.['X-Client-Version']);
  assert.equal(details[2].extra['X-Client-Version'],'131.0.0.0');assert.equal(details[2].extra['X-Merchant-Domain'],'https://provider.invalid/');
  assert.doesNotMatch(value.rawLogs.join(' '),/synthetic-(key|session|token)|SYNTHETICIMAGE|invalid/);
});

async function poll(native,options={}) {
  const{engine,context,trace}=harness(native),logs=[];
  let calls=0;
  const queue=[...(options.states??['COMPLETED'])];
  const response=(body,ok=true,json)=>({ok(){trace.push(['ok']);return ok;},json(){trace.push(['json']);return json?json():Promise.resolve(body);}});
  const actor={hosts:{phonepeApi:options.api??'https://api.invalid'},
    async sleep(ms){trace.push(['sleep',ms]);if(options.fail==='sleep')throw Error('synthetic sleep');},
    async phonePeHeaders(token){trace.push(['headers',token]);if(options.fail==='headers')throw Error('synthetic headers');return{synthetic:'header'};},
    log(value){trace.push(['log']);logs.push(value);},
    req:{get(url,settings){trace.push(['get',url,settings]);assert.equal(this,actor.req);calls++;
      if(options.fail==='getSync')throw Error('synthetic get');
      if(url.endsWith('/status')) {
        const next=queue.length>1?queue.shift():queue[0];
        if(next==='reject')return Promise.reject(Error('synthetic status rejection'));
        if(next==='missing')return Promise.resolve(undefined);
        if(next==='notOk')return Promise.resolve(response({},false));
        if(next==='badJson')return Promise.resolve(response(undefined,true,()=>Promise.reject(Error('synthetic json'))));
        if(next==='noState')return Promise.resolve(response({}));
        if(next==='lower')return Promise.resolve(response({state:'completed'}));
        return Promise.resolve(response({state:next}));
      }
      if(options.redirect==='reject')return Promise.reject(Error('synthetic redirect'));
      if(options.redirect==='missing')return Promise.resolve(undefined);
      if(options.redirect==='badJson')return Promise.resolve(response(undefined,true,()=>Promise.reject(Error('synthetic json'))));
      return Promise.resolve(response(options.redirectBody??{notificationResponse:{response:'synthetic-encdata'}}));}}};
  let stopCount=0;
  const stopped=options.noStop?(()=>false):()=>{stopCount++;trace.push(['stopped?']);return options.stopAt!==undefined&&stopCount>options.stopAt;};
  const onWait=options.noWait?undefined:()=>{trace.push(['wait']);if(options.fail==='wait')throw Error('synthetic wait');};
  return{...await outcome(engine.makeFunction('f1751',context).call(actor,'synthetic-token',stopped,onWait,options.useDefault?undefined:options.max)),trace,logs:logs.map(v=>v.replace(/\(poll \d+\)/,'(poll n)')),rawLogs:logs};
}
const pollCases={
  completed:{max:3},completedLower:{states:['lower'],max:3},pendingThenPaid:{states:['PENDING','PENDING','COMPLETED'],max:5},failed:{states:['FAILED'],max:2},declined:{states:['DECLINED'],max:2},cancelled:{states:['CANCELLED'],max:2},expired:{states:['EXPIRED'],max:2},
  timeout:{states:['PENDING'],max:3},zeroMax:{max:0},nullMax:{max:null},defaultMax:{useDefault:true,stopAt:1,states:['PENDING']},stoppedFirst:{stopAt:0,max:3},stoppedLater:{stopAt:2,states:['PENDING'],max:5},
  missingStatus:{states:['missing','COMPLETED'],max:3},notOk:{states:['notOk','COMPLETED'],max:3},rejected:{states:['reject','COMPLETED'],max:3},badJson:{states:['badJson','COMPLETED'],max:3},noState:{states:['noState','COMPLETED'],max:3},
  noWait:{noWait:true,max:2},noRedirect:{redirect:'missing',max:2},redirectRejects:{redirect:'reject',max:2},redirectBadJson:{redirect:'badJson',max:2},noNotification:{redirectBody:{},max:2},nullNotification:{redirectBody:{notificationResponse:null},max:2},
  numericResponse:{redirectBody:{notificationResponse:{response:12}},max:2},noApiHost:{api:null,max:2},
  sleepFails:{fail:'sleep',max:2},headersFails:{fail:'headers',max:2},getFails:{fail:'getSync',max:2},waitFails:{fail:'wait',max:2},
};
for(const[name,options]of Object.entries(pollCases))test('PhonePe payment polling matches recovered waits, states and results: '+name,async()=>{
  const actual=await poll(true,options),expected=await poll(false,options);
  const normalize=value=>JSON.parse(JSON.stringify({...value,rawLogs:undefined}));
  assert.deepEqual(normalize(actual),normalize(expected));
});
test('PhonePe polling retains the 2000ms wait before every request',async()=>{
  const value=await poll(true,{states:['PENDING','PENDING','COMPLETED'],max:5});
  assert.deepEqual(value.trace.filter(row=>row[0]==='sleep').map(row=>row[1]),[2000,2000,2000]);
  assert.deepEqual(value.value,{kind:'paid',encdata:'synthetic-encdata'});
  assert.doesNotMatch(value.rawLogs.join(' '),/synthetic/);
});

async function razorRedirect(native,options={}) {
  const{engine,context,trace}=harness(native),logs=[];
  const page=options.html??'<form action="/pay"><input name="encdata" value="synthetic-enc"><input name="token" value="synthetic-token"></form>';
  const actor={hosts:{wps:'https://provider.invalid'},
    async reqRetry(label,operation){trace.push(['retry',label]);if(options.fail==='retry')throw Error('synthetic retry');return operation();},
    async gwHeaders(host){trace.push(['headers',host]);return{synthetic:'header'};},
    req:{post(url,settings){trace.push(['post',url,settings]);assert.equal(this,actor.req);if(options.fail==='post')throw Error('synthetic post');
      return Promise.resolve({status(){trace.push(['status']);return 302;},text(){trace.push(['text']);if(options.fail==='text')return Promise.reject(Error('synthetic text'));return Promise.resolve(page);}});}},
    log(value){trace.push(['log']);logs.push(value);},snip(){trace.push(['snip']);throw Error('snip must not run');}};
  const input={username:'synthetic-user',clientTxnId:'synthetic-txn',accessToken:'synthetic-access',rand8:'12345678',csrf:'synthetic-csrf'};
  return{...await outcome(engine.makeFunction('f1758',context).call(actor,options.input??input)),trace,logs:logs.map(v=>v.replace(/action=.*/,'')),rawLogs:logs};
}
for(const[name,options]of Object.entries({ordinary:{},noEncdata:{html:'<form action="/pay"><input name="token" value="t"></form>'},noAction:{html:'<input name="encdata" value="e">'},empty:{html:''},retryFail:{fail:'retry'},postFail:{fail:'post'},textFail:{fail:'text'},missingInput:{input:{}}}))
  test('Razorpay redirect matches recovered form/result flow: '+name,async()=>{
    const actual=await razorRedirect(true,options),expected=await razorRedirect(false,options);
    const normalize=value=>JSON.parse(JSON.stringify({...value,rawLogs:undefined}));assert.deepEqual(normalize(actual),normalize(expected));
  });
test('Razorpay redirect keeps its form shape and private diagnostics',async()=>{
  const value=await razorRedirect(true);
  assert.deepEqual(value.trace.find(row=>row[0]==='post')[2].form,{token:'synthetic-access',txn:'synthetic-user:synthetic-txn','synthetic-user:synthetic-txn':'12345678.synthetic-csrf'});
  assert.equal(value.rawLogs[0],'razorpayRedirect → 302 action=y encdata=y');
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const load=name=>[require('./fixtures/legacy/'+name+'.legacy.cjs'),require('../src/main/payment/'+name+'.cjs')];

// TypeScript migrations of the small payment helpers versus their previous JavaScript (kept as fixtures).
const values=[undefined,null,0,1,'',' ','x','  text  ',true,false,NaN,[],['a'],{},{a:1}];

test('payment-error',async()=>{
  const[legacy,migrated]=load('payment-error');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const messages=['Unable to process payment','ISSUE AT BANK END','unable to process the request due to issue at bank','other','',null,undefined];
  const fields=['errorMessage','error','message','errorMsg','error_description'];
  const responses=[...values,...messages];
  for(const field of fields)for(const message of[...messages,5,{},['x'],'  padded  ','   ']) responses.push({[field]:message});
  responses.push({errorMessage:'',error:'Unable to process payment'},{errorMessage:null,error:undefined,message:'issue at bank end'},{error_description:'  d ',error:'e'},{errorMsg:'',error_description:'second'},{errorMessage:'  ',errorMsg:'third'});
  for(const response of responses) {
    await check('bank '+String(response)+JSON.stringify(response),m=>m.isBankProcessingError(response));
    await check('error '+JSON.stringify(response),m=>m.paymentResponseError(response));
  }
  const errors=[...values,new Error('Request context disposed'),new Error('Target page, context or browser has been closed'),new Error('Target closed'),new Error('browser has been closed'),new Error('page has been closed'),new Error('Execution context was destroyed, most likely because of a navigation'),new Error('Protocol error (Page.navigate): Session closed'),new Error('Protocol error: Target closed.'),new Error('ECONNRESET'),new Error(''),'Target closed','random',{message:'Target closed'},new TypeError('has been closed')];
  for(const error of errors)await check('closed '+String(error),m=>m.isBrowserClosedError(error));
  assert.equal(migrated.isBrowserClosedError(new Error('Target closed')),true);
  assert.equal(migrated.paymentResponseError({error:'  e '}),'e');
});

const makeActor=(overrides={})=>({stopped:false,terminal:false,securityQuarantined:false,session:{page:{isClosed:()=>false}},isSettlingPayment:()=>false,canRequestPnr(){return module_.canRequestPnr(this);},...overrides});
let module_;
test('pnr-lifecycle: canRequestPnr',async()=>{
  const[legacy,migrated]=load('pnr-lifecycle');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const flags=[false,true,0,1,'',undefined,null,'x'];
  for(const stopped of[false,true])for(const terminal of[false,'done'])for(const securityQuarantined of[false,true])
    for(const closed of[undefined,false,true])for(const settling of[false,true])
      await check('can '+[stopped,terminal,securityQuarantined,closed,settling],(m,trace)=>{
        const page=closed===undefined?undefined:{isClosed:()=>{trace.push('isClosed');return closed;}};
        return m.canRequestPnr({stopped,terminal,securityQuarantined,session:{page},isSettlingPayment:()=>{trace.push('settling');return settling;}});
      });
  void flags;
});

function fakeTimers(trace) {
  let next=1;const pending=new Map();
  return{pending,timers:{setTimeout(callback,ms){const id=next++;trace.push(['set',ms]);pending.set(id,callback);return id;},clearTimeout(id){trace.push(['clear',id]);pending.delete(id);}}};
}
test('pnr-lifecycle: waitForPnrRetry',async()=>{
  const[legacy,migrated]=load('pnr-lifecycle');
  const check=differential(legacy,migrated);
  for(const mode of['elapse','cancel','elapse-then-blocked','blocked-at-start','cancel-twice','replaced-cancel']) {
    await check(mode,async(m,trace)=>{
      module_=m;
      const{timers,pending}=fakeTimers(trace);
      const actor=makeActor({canRequestPnr(){trace.push('can');return mode==='blocked-at-start'?false:mode==='elapse-then-blocked'&&pending.size===0?false:true;}});
      const waiting=m.waitForPnrRetry(actor,1500,timers);
      trace.push(['cancelSet',typeof actor.cancelPnrWait]);
      if(mode==='elapse'||mode==='elapse-then-blocked')[...pending.values()][0]?.();
      if(mode==='cancel'||mode==='cancel-twice')actor.cancelPnrWait?.();
      if(mode==='cancel-twice')actor.cancelPnrWait?.();
      if(mode==='replaced-cancel'){const original=actor.cancelPnrWait;actor.cancelPnrWait=()=>{};original();trace.push(['replacedKept',typeof actor.cancelPnrWait]);}
      if(mode==='blocked-at-start')return[await waiting,typeof actor.cancelPnrWait];
      return[await waiting,typeof actor.cancelPnrWait];
    });
  }
  const real=await migrated.waitForPnrRetry(makeActor({canRequestPnr(){return true;}}),5);
  assert.equal(real,true);
});

test('print-ticket',async()=>{
  const[legacy,migrated]=load('print-ticket');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const details=[{pdf:'x'},'text',null,undefined,0,[],['t'],{}];
  for(const gateway of[true,false])for(const wps of['host',undefined,''])for(const pnr of['1234567890','',undefined])for(const csrf of[undefined,'api-csrf'])for(const detail of[...details,new Error('boom'),'reject-undefined']) {
    await check(JSON.stringify([gateway,wps,pnr,csrf,String(detail)]),async(m,trace)=>{
      const booking={pnr,keep:1};
      const actor={
        gateway:gateway?{printTicket:request=>{trace.push(['print',request]);return detail instanceof Error?Promise.reject(detail):detail==='reject-undefined'?Promise.reject({message:undefined}):Promise.resolve(detail);}}:undefined,
        opts:{gatewayHosts:{wps}},api:csrf===undefined?null:{currentCsrf:csrf},
        tok:()=>{trace.push('tok');return{accessToken:'A',greq:'G',bmiyek:'B'};},spaCsrf:()=>{trace.push('spaCsrf');return'spa';},
        log:(...args)=>trace.push(['log',...args]),
      };
      const result=await m.attachPrintTicket(actor,booking);
      return{result,booking};
    });
  }
  await check('no gatewayHosts',async(m,trace)=>m.attachPrintTicket({gateway:{printTicket:()=>trace.push('x')},opts:{},tok:()=>({}),log(){}},{pnr:'1'}));
});

test('session-context',async()=>{
  const[legacy,migrated]=load('session-context');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const tokens=[undefined,null,{a:1}];
  for(const t of tokens)await check('tokens',m=>m.sessionTokens({session:{tokens:t}}));
  const pages=[undefined,null,{url:()=>'https://www.example.test/a/b?c=1'},{url:()=>''},{url:()=>'not a url'},{url:()=>{throw new Error('closed');}},{url:()=>'http://host:8080/x'}];
  for(const page of pages)for(const providerUrl of[undefined,'',null,'https://provider.test/path','bad url'])
    await check('referrer '+String(page&&page.url)+providerUrl,(m,trace)=>m.paymentPageReferrer({session:{page:page&&{url:()=>{trace.push('url');return page.url();}}},opts:{providerUrl}}));
  for(const globals of[{crypto:{randomUUID:()=>'uuid-1'}},{crypto:{}},{crypto:null},{}])for(const random of[()=>0.123456789,()=>0,()=>0.5])
    await check('requestId',(m,trace)=>m.paymentRequestId({now:()=>{trace.push('now');return 1234;}},{globals,random}));
  const id=migrated.paymentRequestId({now:()=>5});
  assert.match(id,/^5:[0-9a-f-]{36}$/);
});

test('request-body, request-url, retry-delay',async()=>{
  const body=load('request-body'),url=load('request-url'),delay=load('retry-delay');
  sameExports(...body);sameExports(...url);sameExports(...delay);
  const checkBody=differential(...body),checkUrl=differential(...url),checkDelay=differential(...delay);
  for(const method of['wallet','upi','card','',undefined])for(const amount of[0,10,'12.50',null,undefined,1e21,{toString:()=>'obj'}])for(const override of[undefined,null,0,'',55,'bank'])
    await checkBody('body '+String(method)+String(amount)+String(override),(m,trace)=>m.bookingPaymentBody(method,amount,override,id=>{trace.push(['default',id]);return 99;}));
  for(const base of['https://api.test','','x'])for(const txn of[1,'abc',0,'',null,undefined])for(const insured of[true,false,undefined,0,'x']) {
    await checkUrl('payUrl',m=>m.bookingPaymentUrl(base,txn,insured));
    await checkUrl('dataUrl',m=>m.bookingDataUrl(base,txn));
  }
  const responses=['{"retryAfterMili":"5000"}','{"retryAfterMilis":2500}','"retryAfterMili":0','retryAfterMili: 100',{retryAfterMilis:500},{retryAfterMili:'99999'},{retryAfterMili:1000},{retryAfterMili:1},{retryAfterMili:20000},{retryAfterMili:20001},{x:1},'',null,undefined,0,'RETRYAFTERMILI":"3000','{"retryAfterMili":"abc"}',{retryAfterMili:-5},[],{nested:{retryAfterMilis:'4000'}},'"retryAfterMili" : "7000"',{retryAfterMili:'12345678901234567890'}];
  for(const response of responses)await checkDelay('delay '+JSON.stringify(response),m=>m.bookingRetryDelay(response));
  const circular={};circular.self=circular;
  await checkDelay('circular',m=>m.bookingRetryDelay(circular));
  assert.equal(delay[1].bookingRetryDelay({retryAfterMili:1}),1000);
});

test('qr-response',async()=>{
  const[legacy,migrated]=load('qr-response');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const encode=object=>Buffer.from(JSON.stringify(object)).toString('base64');
  const page=text=>'<html><textarea class="x" id="app-config-data" hidden>'+text+'</textarea></html>';
  const htmls=[page(encode({a:1})),page('\n  '+encode({upi:'upi://pay?am=5'})+'  \n'),page('not base64!!'),page(encode('str')),page('QUJD'),'<textarea id=\'app-config-data\'>'+encode([1])+'</textarea>','<p>none</p>','',page(''),page(' ')];
  for(const html of htmls)for(const globals of[undefined,{atob:text=>Buffer.from(text,'base64').toString('utf8')},{atob:()=>{throw new Error('bad');},Buffer},{Buffer}])
    await check('appConfig '+html.slice(0,30),(m,trace)=>m.appConfig(html,globals&&{...globals,atob:globals.atob&&(t=>{trace.push('atob');return globals.atob(t);})}));
  for(const payload of[undefined,null,'','upi://pay?pa=a&am=12.50&cu=INR','am=5','?am=0','?am=0.00','&AM=7','?am=abc','?am=1e3','x?am=3.','?am=.5','?am=10&am=20','upi://pay?tam=5'])
    await check('qrAmount '+payload,m=>m.qrAmount(payload));
  const bodies=[{},{txnStatus:'SUC'},{txnStatus:'success'},{txnResponseCode:'0000'},{txnResponseCode:0},{responseCode:'P0030'},{respDescription:'Awaiting'},{txnStatus:'pending'},{txnRespDescription:'in progress'},{respDescription:'IN_PROGRESS'},{txnStatus:'INITIATED'},{txnStatus:'FAILED'},{respDescription:'declined by bank'},{txnRespDescription:'Cancelled'},{txnStatus:'expired'},{respDescription:'time out'},{respDescription:'TIMEDOUT'},{respDescription:'unsuccessful'},{txnStatus:'??'},{txnStatus:null,respDescription:undefined},{txnStatus:5},{txnStatus:'SUC',respDescription:'FAILED'},{responseCode:'p0030',respDescription:'failed'},{txnStatus:'PROCESSING FAIL'},{txnResponseCode:'0000',txnStatus:'FAIL'}];
  for(const body of bodies)await check('commandStatus '+JSON.stringify(body),m=>m.commandStatus(body));
  await check('commandStatus null body',m=>m.commandStatus(null));
});

test('http-record',async()=>{
  const[legacy,migrated]=load('http-record');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const response=(overrides={})=>({status:()=>201,headers:()=>({h:1}),text:()=>Promise.resolve('B'.repeat(20000)),...overrides});
  const optionsList=[undefined,null,{},{form:{a:'x'.repeat(700),b:2,c:null}},{data:'d'.repeat(3000)},{data:{k:'v'.repeat(3000)}},{data:{k:1},headers:{h:1}},{data:0},{data:''},{form:{}},{data:()=>1},{data:{toJSON(){throw new Error('x');}}},{data:10n}];
  const responses=[undefined,null,response(),response({text:()=>Promise.reject(new Error('t'))}),response({status:()=>{throw new Error('s');}}),response({headers:()=>{throw new Error('h');}}),response({text:()=>'sync not promise'})];
  const errors=[undefined,null,0,'plain string',new Error('E'.repeat(300)),{message:undefined},{message:'m'},12];
  for(const withCallback of[false,true])for(const options of optionsList)for(const res of responses)for(const error of errors)
    await check('record '+JSON.stringify([withCallback,options&&Object.keys(options),!!res,String(error)].map(String)),async(m,trace)=>{
      const actor={};
      if(withCallback)actor.onHttpRecord=record=>trace.push(['record',record]);
      const result=await m.recordHttp(actor,'post','https://x.test/p',options,res,error,{clock:{now:()=>{trace.push('now');return 42;}}});
      return result;
    });
  await check('throwing callback is swallowed',async(m,trace)=>m.recordHttp({onHttpRecord:()=>{trace.push('cb');throw new Error('cb');}},'get','u',{},null,null));
  const before=Date.now();
  let seen;
  await migrated.recordHttp({onHttpRecord:record=>{seen=record;}},'get','u',{},null,null);
  assert.ok(seen.ts>=before);
  assert.equal(seen.method,'GET*');
});

test('gateway-retry',async()=>{
  const[legacy,migrated]=load('gateway-retry');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const closed=error=>/closed/.test(String(error&&error.message));
  const failures=[new Error('net'),new Error('browser closed'),'string failure',{message:'obj'},undefined,null,new TypeError('')];
  for(const maxAttempts of[undefined,1,2,4])for(const failAt of[0,1,2,3,99])for(const failure of failures)for(const stop of['never','always','afterFirst','afterWait']) {
    await check(JSON.stringify([maxAttempts,failAt,String(failure),stop]),async(m,trace)=>{
      let attempt=0,stopCalls=0;
      const timers={setTimeout:(callback,ms)=>{trace.push(['wait',ms]);callback();return 1;}};
      const stopRetry=stop==='never'?undefined:()=>{stopCalls++;trace.push(['stop?',stopCalls]);return stop==='always'||(stop==='afterFirst'&&stopCalls>=1)||(stop==='afterWait'&&stopCalls>=2);};
      return m.retryGatewayRequest({log:(...args)=>trace.push(['log',...args])},'label',async()=>{trace.push(['attempt',attempt]);if(attempt++>=failAt)return'ok:'+attempt;throw failure;},maxAttempts,stopRetry,{isBrowserClosed:closed,timers});
    });
  }
  assert.equal(await migrated.retryGatewayRequest({log(){}},'l',async()=>7,4,undefined,{isBrowserClosed:()=>false}),7);
});

test('gateway-selection',async()=>{
  const[legacy,migrated]=load('gateway-selection');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const orders=[[],['paytm','phonepay'],['phonepay','paytm','razorpayqr','paytm'],['wallet']];
  const available=[()=>true,()=>false,(t,m)=>m==='paytm',(t,m)=>m!=='paytm'];
  for(const selected of[undefined,null,'','wallet','paytm','phonepay','irctcqr','razorpayqr','paytmupi','netbanking'])for(const order of orders)for(let index=0;index<available.length;index++)
    await check(JSON.stringify([selected,order,index]),(m,trace)=>m.paymentCandidates(selected,'T',{getOrder:()=>{trace.push('order');return order;},isAvailable:(t,method)=>{trace.push(['avail',t,method]);return available[index](t,method);}}));
  const idMaps=[{},{paytm:['b1','b2']},{paytm:[]},{wallet:['w']},{paytm:['b2']}];
  for(const method of['paytm','wallet','card'])for(const ids of idMaps)for(const have of[()=>true,()=>false,(t,id)=>id==='b2',(t,id)=>id==='w'])
    await check(JSON.stringify([method,ids]),(m,trace)=>m.choosePaymentBank('T',method,{getIds:()=>ids,defaultBankId:name=>{trace.push(['default',name]);return'dflt';},hasBank:(t,id)=>{trace.push(['has',id]);return have(t,id);}}));
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const {hooks}=require('../src/main/runtime/legacy-services.cjs');
const table=Object.assign({},...Object.values(strings));
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};

async function run(native,options={}){
  const trace=[],timed=[],booking=options.booking===undefined?{pnr:'synthetic-pnr',amount:123,allConfirmed:true,passengers:[{confirmed:true}]}:structuredClone(options.booking);
  let now=0,reportResolve,ticketResolve,finished=false,outcome;
  const timers={setTimeout(fn,delay){trace.push(['timer',delay]);const item={fn,at:now+delay};timed.push(item);return item;}};
  const overridden=hooks(event=>trace.push(['legacy',event])).overrides;
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{timers}}):{},functionOverrides:options.vendorGuard?overridden:{},globals:{Number,Promise,setTimeout:timers.setTimeout}});
  const root=engine.context(6,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing '+n+'|'+key);return value;};
  const captured=engine.context(2,root);
  const actor={
    paidQrAmount:options.paidQrAmount,paymentCancelled:!!options.cancelled,
    gateway:{disposeSurvivor(){return dispose('survivor');},disposeDirectContext(){return dispose('direct');}},
    gatewayReqCtx:{dispose(){return dispose('request');}},
    stoppedResult(){trace.push(['stopped']);return{success:false,message:'synthetic stopped'};},
    attachPrintTicket(value){assert.equal(value,booking);trace.push(['ticket',value.amount]);
      if(options.ticket==='throw')throw Error('synthetic ticket');
      if(options.ticket==='reject')return Promise.reject(Error('synthetic ticket'));
      if(options.ticket==='pending')return new Promise(resolve=>{ticketResolve=resolve;});
      if(options.ticket==='nonPromise')return 42;
      return Promise.resolve();
    },
    opts:{onBooked(value){assert.equal(value,booking);trace.push(['booked']);if(options.callback==='throw')throw Error('synthetic booked');if(options.callback==='pending')return new Promise(()=>{});}},
    onProgress(...args){trace.push(['progress',...args]);if(options.progress==='throw')throw Error('synthetic progress');},
    reportClientUpdate(value){assert.equal(value,booking);trace.push(['report']);
      if(options.report==='throw')throw Error('synthetic report');
      if(options.report==='reject')return Promise.reject(Error('synthetic report'));
      if(options.report==='pending')return new Promise(resolve=>{reportResolve=resolve;});
      return Promise.resolve({ok:true});
    },
    log(...args){trace.push(['log',...args]);if(options.log==='throw')throw Error('synthetic log');},
    endFinalPnrRequest(){trace.push(['end-pnr']);},endSettling(){trace.push(['end-settling']);},
  };
  function dispose(name){trace.push(['dispose',name]);if(options.dispose===name+'-throw')throw Error('synthetic dispose '+name);if(options.dispose===name+'-reject')return Promise.reject(Error('synthetic dispose '+name));if(options.dispose==='pending')return new Promise(()=>{});return Promise.resolve();}
  if(options.noGateway)delete actor.gateway;
  if(options.noRequestContext)delete actor.gatewayReqCtx;
  if(options.noCallback)delete actor.opts.onBooked;
  if(options.vendorGuard)actor.reportClientUpdate=engine.makeFunction('f2009',captured);
  actor.finishBookingCore=engine.makeFunction('f2233',captured);
  const method=options.wrapper?engine.makeFunction('f2243',captured):actor.finishBookingCore;
  const pending=method.call(actor,booking).then(value=>{finished=true;outcome={value};},error=>{finished=true;outcome={error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{})};});
  await flush();
  let reportWaitObserved=false;
  for(let i=0;!finished&&i<4;i++){
    timed.sort((a,b)=>a.at-b.at);const next=timed.shift();assert.ok(next,'Unresolved finalization without a timer');now=next.at;next.fn();await flush();
    if(reportResolve&&now>=5000){
      assert.equal(finished,false,'Recovered report remains awaited after timeout');reportWaitObserved=true;reportResolve({ok:true});await flush();
    }
  }
  assert.ok(finished,'Finalization did not settle');await pending;
  if(ticketResolve){ticketResolve();await flush();}
  // Timers are retained by the recovered code. A completed report must not
  // produce a false warning when its outstanding timer fires later.
  for(const item of timed){item.fn();await flush();}
  return{...outcome,trace,booking,requestContextCleared:actor.gatewayReqCtx===undefined,reportWaitObserved};
}

const cases={confirmed:{},waitlist:{booking:{pnr:'synthetic-wl',amount:10,allConfirmed:false,passengers:[{confirmed:false}]}},
  mixed:{booking:{pnr:'synthetic-mixed',amount:10,passengers:[{confirmed:false},{confirmed:true}]}},emptyPassengers:{booking:{pnr:'synthetic-empty',passengers:[]}},
  cancelled:{cancelled:true},cancelledDisposed:{cancelled:true,dispose:'direct-reject'},nullBooking:{booking:null},error:{booking:{errorMessage:'synthetic failure'}},noPnr:{booking:{}},
  noGateway:{noGateway:true},noContext:{noRequestContext:true},noCallback:{noCallback:true},callbackPending:{callback:'pending'},callbackThrow:{callback:'throw'},progressThrow:{progress:'throw'},
  ticketReject:{ticket:'reject'},ticketThrow:{ticket:'throw'},ticketTimeout:{ticket:'pending'},ticketValue:{ticket:'nonPromise'},
  reportReject:{report:'reject'},reportThrow:{report:'throw'},reportTimeout:{report:'pending'},vendorGuard:{vendorGuard:true},
  wrapper:{wrapper:true},wrapperReject:{wrapper:true,report:'reject'},wrapperCancelled:{wrapper:true,cancelled:true},
  missingPassengers:{booking:{pnr:'synthetic-missing'}},logThrow:{paidQrAmount:100,log:'throw'},disposalPending:{dispose:'pending'},
};
for(const name of ['survivor','direct','request'])for(const mode of ['reject','throw'])cases['dispose-'+name+'-'+mode]={dispose:name+'-'+mode};
for(const [name,value]of Object.entries({same:123,lower:100,higher:200,zero:0,negative:-1,infinity:Infinity,nan:NaN,string:'100'}))cases['amount-'+name]={paidQrAmount:value};
for(const[name,options]of Object.entries(cases))test('finalization core matches actual recovered behavior: '+name,async()=>{
  const before=await run(false,options),after=await run(true,options);assert.deepEqual(after,before);
  if(name==='confirmed')assert.equal(after.value.success,true);
  if(name==='reportTimeout')assert.equal(after.reportWaitObserved,true);
  if(name==='vendorGuard')assert.ok(after.trace.some(row=>row[0]==='legacy'&&row[1]==='matrix-vendor-reporting-disabled'));
});
test('finalization publishes ticket before reporting and keeps cleanup ordered on report failure',async()=>{
  const result=await run(true,{wrapper:true,report:'reject'});
  assert.deepEqual(result.trace.filter(row=>['ticket','booked','report','end-pnr','end-settling'].includes(row[0])).map(row=>row[0]),['ticket','booked','report','end-pnr','end-settling']);
  assert.equal(result.error,'Error');
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const ROOM='synthetic&mid_synthetic/order';

// Runs a page-side program in a sandbox with a scripted socket and records its effects.
function runPageProgram(fn,args,script,trace) {
  const timeouts=[],doc={nodes:{},body:{appendChild(node){doc.nodes[node.id]=node;}},title:'',getElementById(id){return doc.nodes[id]||null;},createElement(){return{style:{}};}};
  class FakeSocket {
    constructor(url){trace.push(['socket',url]);if(script.constructorThrows)throw Error('synthetic socket');FakeSocket.current=this;}
    send(data){trace.push(['send',data]);if(script.sendThrows)throw Error('synthetic send');}
    close(){trace.push(['close-socket']);if(script.closeThrows)throw Error('synthetic close');}
  }
  const sandbox={document:doc,WebSocket:FakeSocket,JSON,setTimeout(callback,ms){timeouts.push(callback);trace.push(['timeout',ms]);return timeouts.length;},clearTimeout(id){trace.push(['clearTimeout',id]);}};
  const promise=vm.runInNewContext('('+fn.toString()+')',sandbox)(args);
  const socket=FakeSocket.current;
  for(const event of script.events??[]) {
    if(event==='open')socket.onopen();else if(event==='error')socket.onerror();else if(event==='timeout')timeouts[0]();
    else socket.onmessage({data:event});
  }
  return promise.then(value=>{trace.push(['page-result',value,doc.nodes.__pwslog?.textContent]);return value;});
}

async function run(native,options={}) {
  const trace=[],logs=[],intervals=[];
  const timers={setInterval(fn,ms){trace.push(['interval',ms]);intervals.push({fn,ms});return intervals.length;},clearInterval(id){trace.push(['clearInterval',id]);}};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{timers}}):{},
    globals:{Promise,JSON,URL,encodeURIComponent,setInterval:timers.setInterval,clearInterval:timers.clearInterval}});
  const root=engine.context(2133,null);
  root[5]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined);return table[n+'|'+key];};
  root[2132]=source=>vm.runInNewContext('('+source+')');
  const socketResult=deferred(),logRead=[];
  const evaluateOn=(owner,fn,args)=>{
    if(args){
      trace.push(['socket-eval',owner,args]);
      if(options.fail==='evaluateSync')throw Error('synthetic evaluate');
      return options.pageScript?runPageProgram(fn,args,options.pageScript,trace):socketResult.promise;
    }
    if(String(fn).includes('__pwslog')){trace.push(['log-eval',owner]);const next=logRead.shift();return next===undefined?Promise.reject(Error('synthetic log read')):Promise.resolve(next);}
    trace.push(['progress',owner]);
    if(options.fail==='progressReject')return Promise.reject(Error('synthetic progress'));
    const doc={title:'',body:{innerHTML:'',style:{}}};vm.runInNewContext('('+fn.toString()+')',{document:doc})();
    trace.push(['progress-dom',doc.title,doc.body.style.background]);return Promise.resolve();
  };
  const background={
    goto(url,settings){trace.push(['goto',url,settings]);if(options.fail==='gotoSync')throw Error('synthetic goto');return options.fail==='gotoReject'?Promise.reject(Error('synthetic goto rejection')):Promise.resolve();},
    url(){trace.push(['url']);if(options.fail==='url')throw Error('synthetic url');return options.wrongOrigin?'https://other.invalid/x':'https://gateway.invalid/';},
    evaluate:(fn,args)=>evaluateOn('background',fn,args),
    close(){trace.push(['close']);if(options.fail==='closeSync')throw Error('synthetic close');return options.fail==='closeReject'?Promise.reject(Error('synthetic close rejection')):Promise.resolve();},
  };
  const booking={evaluate:(fn,args)=>evaluateOn('booking',fn,args),context(){trace.push(['context']);if(options.fail==='context')throw Error('synthetic context');
    return{newPage(){trace.push(['new']);if(options.fail==='newSync')throw Error('synthetic new');return options.fail==='newReject'?Promise.reject(Error('synthetic new rejection')):Promise.resolve(background);}};}};
  const actor={hosts:{paytm:'https://gateway.invalid'},page:booking,
    log(value){trace.push(['log']);logs.push(value);if(options.fail==='log')throw Error('synthetic log');},
    snip(text){trace.push(['snip',text]);return text;}};
  let stopFlag=false;
  const stopped=options.noStop?undefined:()=>{trace.push(['stopped?']);return stopFlag;};
  const method=engine.makeFunction('f1693',engine.context(2,root));
  const promise=method.call(actor,'synthetic&mid','synthetic/order',options.timeout,stopped);
  let outcome;promise.then(value=>outcome={value},error=>outcome={error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{})});
  await flush();
  for(const step of options.steps??[]) {
    if(step==='pollTick'){intervals.filter(i=>i.ms===2000).forEach(i=>i.fn());}
    else if(step[0]==='frames'){logRead.push(step[1]);intervals.filter(i=>i.ms===2000).forEach(i=>i.fn());}
    else if(step==='stop'){stopFlag=true;intervals.filter(i=>i.ms===400).forEach(i=>i.fn());}
    else if(step[0]==='resolve')socketResult.resolve(step[1]);
    else if(step[0]==='reject')socketResult.reject(Error('synthetic socket rejection'));
    await flush();
  }
  const normalize=value=>value.replace(/^PayTM WS connecting.*/,'PayTM WS connecting').replace(/^PayTM WS: background page did not land.*/,'PayTM WS: background page did not land')
    .replace(/^PayTM WS frames: .*/,'PayTM WS frames').replace(/^PayTM WS success: .*/,'PayTM WS success');
  return{outcome,trace,logs:logs.map(normalize),rawLogs:logs};
}
const payload=JSON.stringify({merchantId:'synthetic-room-mid',orderId:'synthetic-room-order',paymentMode:'synthetic-mode',topicName:'synthetic-topic',acquirementId:'synthetic-acq',cashierRequestId:'synthetic-cashier',_id:'synthetic-id',status:'synthetic-status'});
const cases={
  success:{steps:[['resolve',payload]]},
  defaultsOnly:{steps:[['resolve','{}']]},
  nonJson:{steps:[['resolve','not-json']]},
  jsonNull:{steps:[['resolve','null']]},
  timeoutNull:{steps:[['resolve',null]]},
  emptyString:{steps:[['resolve','']]},
  customTimeout:{timeout:12345,steps:[['resolve',payload]]},
  nullTimeout:{timeout:null,steps:[['resolve',payload]]},
  socketRejects:{steps:[['reject']]},
  cancelled:{steps:['stop']},
  cancelWithoutCallback:{noStop:true,steps:[['resolve',null]]},
  framesLogged:{steps:[['frames','[open]'],['frames','[open]'],['frames','[open][msg]#1'],['resolve',payload]]},
  framePollFails:{steps:['pollTick',['resolve',payload]]},
  wrongOrigin:{wrongOrigin:true,steps:[['resolve',payload]]},
  noResultYet:{},
};
for(const fail of ['context','newSync','newReject','gotoSync','gotoReject','url','progressReject','evaluateSync','closeSync','closeReject','log'])cases['failure-'+fail]={fail,steps:[['resolve',payload]]};
for(const[name,options]of Object.entries(cases))test('PayTM WebSocket watcher matches recovered flow: '+name,async()=>{
  const actual=await run(true,options),expected=await run(false,options);delete actual.rawLogs;delete expected.rawLogs;assert.deepEqual(actual,expected);
});
const hit=data=>JSON.stringify({event:ROOM,data});
const pageScripts={
  handshakeJoinHit:{events:['open','#1',JSON.stringify({rid:1}),hit({ok:1})]},
  stringHit:{events:['open',JSON.stringify({rid:1}),JSON.stringify({rid:1}),hit('plain')]},
  ignoredFrames:{events:['{bad','null',JSON.stringify({event:'other',data:1}),JSON.stringify({event:ROOM}),'error']},
  errorFrame:{events:['error','timeout']},
  timeoutOnly:{events:['timeout']},
  sendFails:{sendThrows:true,events:['open','#1',JSON.stringify({rid:1}),hit('x')],closeThrows:true},
  constructorFails:{constructorThrows:true},
};
for(const[name,pageScript]of Object.entries(pageScripts))test('PayTM page-side socket program matches recovered program: '+name,async()=>{
  const actual=await run(true,{pageScript}),expected=await run(false,{pageScript});delete actual.rawLogs;delete expected.rawLogs;assert.deepEqual(actual,expected);
});
test('PayTM WebSocket watcher keeps provider room routing and private diagnostics',async()=>{
  const value=await run(true,{steps:[['resolve',payload]]});
  const args=value.trace.find(row=>row[0]==='socket-eval')[2];
  assert.deepEqual(args,{wsUrl:'wss://gateway.invalid/websocket/?DEVICE=web&ID=synthetic%26mid_synthetic%2Forder',roomId:ROOM,timeoutMs:1800000});
  assert.deepEqual(value.outcome.value,{merchantId:'synthetic-room-mid',orderId:'synthetic-room-order',paymentMode:'synthetic-mode',topicName:'synthetic-topic',acquirementId:'synthetic-acq',cashierRequestId:'synthetic-cashier',_id:'synthetic-id',status:'synthetic-status'});
  assert.doesNotMatch(value.rawLogs.join(' '),/synthetic|gateway\.invalid/);
  assert.equal(value.trace.filter(row=>row[0]==='close').length,1);
});

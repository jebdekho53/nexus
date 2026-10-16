'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {startPaytmWatch}=require('../src/main/payment/paytm-watch.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function scenario(original,events){
  const trace=[],ws=deferred(),poll=deferred();let tick,stop,progress;
  const timers={setInterval(fn,ms){trace.push(['interval',ms]);tick=fn;return 123;},clearInterval(id){trace.push(['clear',id]);}};
  const actor={stopped:false,pnrSeen:false,onProgress(...args){trace.push(['progress',...args]);}};
  const gateway={
    waitForPaytmWs(mid,order,unused,isStopped){trace.push(['ws',mid,order,unused]);stop=isStopped;return ws.promise;},
    pollPaytmStatus(mid,order,isStopped,onWait){trace.push(['poll',mid,order]);progress=onWait;return poll.promise;},
  };
  let result,settles=0;
  const resolve=value=>{result=value;settles++;trace.push(['resolved',value]);};
  if(original){
    const table=Object.assign({},...Object.values(strings)),engine=createEngine(definitions,{globals:{...globalThis,...timers}});
    const root=engine.context(1842,null),decode=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
    root[5]=root[1841]=decode;
    const parent=engine.context(7,engine.context(2,root));
    parent[2]=actor;parent[3]=decode;parent[4]=gateway;parent[5]={mid:'fixture-merchant'};parent[6]='fixture-order';
    engine.makeFunction('f2196',parent)(resolve);
  }else startPaytmWatch(resolve,actor,gateway,{mid:'fixture-merchant'},'fixture-order',timers);
  for(const event of events){
    if(event==='progress')progress();
    else if(event==='cancel'){actor.stopped=true;tick();}
    else if(event==='pnr'){actor.pnrSeen=true;trace.push(['stopped?',stop()]);}
    else if(event==='stop?')trace.push(['stopped?',stop()]);
    else{const [channel,kind,value]=event;(channel==='ws'?ws:poll)[kind](value);}
    await flush();
  }
  return{trace,result,settles};
}
for(const [name,events]of Object.entries({
  wsWins:[['ws','resolve',{paid:'ws'}],'stop?',['poll','resolve',{paid:'poll'}]],
  pollWins:[['poll','resolve',{paid:'poll'}],['ws','resolve',{paid:'ws'}]],
  falseWsThenPaid:[['ws','resolve',false],'progress',['poll','resolve',{paid:'poll'}]],
  falseBoth:[['ws','resolve',false],['poll','resolve',null]],
  errors:[['ws','reject',Error('ws down')],['poll','reject',Error('poll down')]],
  errorThenPaid:[['ws','reject',Error('ws down')],['poll','resolve',{paid:'poll'}]],
  cancellation:['progress','cancel','stop?','progress',['ws','resolve',{paid:'late'}],['poll','resolve',null]],
  pnrSeen:['pnr','progress',['ws','resolve',false],['poll','resolve',false]],
}))test('PayTM watcher matches recovered executor: '+name,async()=>{
  assert.deepEqual(await scenario(false,events),await scenario(true,events));
});

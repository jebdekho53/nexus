'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');

// Each scenario builds a fresh actor, runs the method on the recovered or native side and records every effect.
function recorder(options={}) {
  const trace=[];
  const actor={
    pnrSeen:options.pnrSeen,settlingPayment:options.settling,paymentCancelled:options.cancelled,opts:{...options.opts},
    session:options.noSession?{}:{page:options.page},
    cancelPnrWait:options.noWaiter?undefined:function(){assert.equal(this,actor);trace.push(['cancelPnrWait']);},
    endSettling(){trace.push(['endSettling']);},endFinalPnrRequest(){trace.push(['endFinal']);},
    onProgress(...args){trace.push(['progress',...args]);},
    log(...args){trace.push(['log',...args]);},
  };
  return{trace,actor};
}
const snapshot=actor=>({paymentCancelled:actor.paymentCancelled,stopped:actor.stopped});

for(const[name,options]of Object.entries({fresh:{},noWaiter:{noWaiter:true},pnrSeen:{pnrSeen:true},settling:{settling:true},truthyOne:{pnrSeen:1}}))
  test('cancelPayment matches recovered cancellation rules: '+name,async()=>compare(async native=>{
    const{method}=harness({native}),{trace,actor}=recorder(options);
    const value=await outcome(async()=>method('f2046').call(actor,'operator reason'));
    return{value,trace,state:snapshot(actor)};
  }));

for(const[name,options]of Object.entries({generic:{},cancelled:{cancelled:'Cancelled by operator'},emptyReason:{cancelled:''}}))
  test('stoppedResult matches recovered cancellation/default result: '+name,async()=>compare(async native=>{
    const calls=[];
    const{method}=harness({native,slots:{940:()=>{calls.push('default');return{success:false,stopped:true};}}}),{trace,actor}=recorder(options);
    const value=await outcome(async()=>method('f2047').call(actor));
    return{value,trace,calls};
  }));

for(const[name,options]of Object.entries({configured:{opts:{highLoadDelayMs(){return 777;}}},fallback:{},zeroConfigured:{opts:{highLoadDelayMs:0}}}))
  for(const randomValue of [0,0.5,0.9999])
    test('highLoadDelay matches recovered bounds: '+name+' '+randomValue,async()=>compare(async native=>{
      const math=Object.create(Math);math.random=()=>randomValue;
      const{method}=harness({native,globals:{Math:math},dependencies:{random:math.random}}),{trace,actor}=recorder(options);
      return outcome(async()=>method('f2063').call(actor));
    }));

const fakePage=(trace,options={})=>({
  context(){trace.push(['context']);if(options.contextThrows)throw Error('synthetic context');return{async newCDPSession(page){trace.push(['cdp',page===fakePage.last]);if(options.cdpFails)throw Error('synthetic cdp');return{
    async send(method,args){trace.push(['send',method,args]);if(options.sendFails===method)throw Error('synthetic send');return method==='Browser.getWindowForTarget'?{windowId:options.windowId??7}:undefined;},
    detach(){trace.push(['detach']);if(options.detachSync)throw Error('synthetic detach');return options.detachFails?Promise.reject(Error('synthetic detach rejection')):Promise.resolve();},
  };}};},
});
for(const[name,pageOptions]of Object.entries({ordinary:{},contextThrows:{contextThrows:true},cdpFails:{cdpFails:true},windowFails:{sendFails:'Browser.getWindowForTarget'},boundsFail:{sendFails:'Browser.setWindowBounds'},detachRejects:{detachFails:true},detachThrows:{detachSync:true},missing:{missing:true}}))
  test('minimizeBrowser matches recovered CDP sequence and swallowed errors: '+name,async()=>compare(async native=>{
    const{method}=harness({native}),{trace,actor}=recorder({});
    if(!pageOptions.missing){actor.session.page=fakePage(trace,pageOptions);fakePage.last=actor.session.page;}
    const value=await outcome(async()=>method('f2049').call(actor));
    return{value,trace};
  }));

for(const[name,options]of Object.entries({withPage:{},noPage:{noSession:true},rejects:{rejects:true},throws:{throws:true}}))
  test('focusBrowser matches recovered call and error handling: '+name,async()=>compare(async native=>{
    const trace=[];
    const{method}=harness({native,slots:{123:page=>{trace.push(['front',page]);if(options.throws)throw Error('synthetic front');return options.rejects?Promise.reject(Error('synthetic rejection')):Promise.resolve();}}});
    const{actor}=recorder({page:'page-a',noSession:options.noSession});
    return{value:await outcome(async()=>method('f2055').call(actor)),trace};
  }));

for(const[name,options]of Object.entries({local:{},vendor:{opts:{vendorBrowser:true}},noPage:{noSession:true},rejects:{rejects:true},throws:{throws:true}}))
  test('hideBrowser matches recovered off-screen rules: '+name,async()=>compare(async native=>{
    const calls=[];
    const{method}=harness({native,slots:{122:(page,hidden)=>{calls.push(['hide',page,hidden]);if(options.throws)throw Error('synthetic hide');return options.rejects?Promise.reject(Error('synthetic rejection')):Promise.resolve();}}});
    const{trace,actor}=recorder({page:'page-a',noSession:options.noSession,opts:options.opts});
    return{value:await outcome(async()=>method('f2057').call(actor)),trace,calls};
  }));

test('highLoadDelay returns 2000-3999 ms without a configured callback',async()=>{
  const{method}=harness({native:true,dependencies:{random:()=>0.9999}});
  assert.equal(method('f2063').call({opts:{}}),3999);
});

// controlProxyContext (f2051)
for(const[name,scenario]of Object.entries({
  noProxy:{proxy:undefined},blankServer:{proxy:{server:'   '}},ordinary:{proxy:{server:'host:1',username:'u',password:'p'}},noCredentials:{proxy:{server:'host:1'}},
  cachedSame:{proxy:{server:'host:1',username:'u',password:'p'},cached:{key:'host:1|u|p',value:'ctx'}},cachedOther:{proxy:{server:'host:2'},cached:{key:'host:1||',value:'ctx'}},
  createFails:{proxy:{server:'host:1'},fail:true},createRejects:{proxy:{server:'host:1'},reject:true},paddedServer:{proxy:{server:' host:1 '}},
}))test('controlProxyContext matches recovered caching and failure rules: '+name,async()=>compare(async native=>{
  const calls=[];
  const{method}=harness({native,slots:{562:value=>{calls.push(['create',value]);if(scenario.fail)throw Error('synthetic create');return scenario.reject?Promise.reject(Error('synthetic rejection')):Promise.resolve('new-context');}}});
  const{actor}=recorder({});
  if(scenario.cached){actor.controlReqCtx=scenario.cached.value;actor.controlReqCtxKey=scenario.cached.key;}
  const value=await outcome(async()=>method('f2051').call(actor,scenario.proxy));
  return{value,calls,state:{ctx:actor.controlReqCtx,key:actor.controlReqCtxKey}};
}));

// routeGatewayThroughFormProxy (f2052)
const proxySlots=(trace,options={})=>({
  247:name=>{trace.push(['filtered?',name]);return name.startsWith('f5_');},
  561:server=>{trace.push(['normalize',server]);return 'http://'+server;},
  133:'*.invalid',
  2132:source=>require('node:vm').runInNewContext('('+source+')',{navigator:{userAgent:'synthetic-agent'}}),
  15:{request:{async newContext(settings){trace.push(['newContext',settings]);if(options.contextFails)throw Error('synthetic context failure');return{synthetic:'request-context'};}}},
});
for(const[name,scenario]of Object.entries({
  gologin:{provider:'gologin'},cdp:{cdpAttached:true,provider:'other'},notProxied:{provider:'other'},noPage:{provider:'gologin',noPage:true},blankProxy:{provider:'gologin',proxy:{server:' '}},noProxy:{provider:'gologin',proxy:null},
  alreadyRouted:{provider:'gologin',routed:true},noGateway:{provider:'gologin',noGateway:true},cookieFilter:{provider:'gologin',cookieF5:true},withCredentials:{provider:'gologin',proxy:{server:'h:1',username:'u',password:'p'}},
  noAgent:{provider:'gologin',agent:''},agentFails:{provider:'gologin',agentFails:true},cookiesFail:{provider:'gologin',cookiesFail:true},contextFails:{provider:'gologin',contextFails:true},useProxyFails:{provider:'gologin',useProxyFails:true},
}))test('routeGatewayThroughFormProxy matches recovered routing rules: '+name,async()=>compare(async native=>{
  const trace=[];
  const{method}=harness({native,slots:proxySlots(trace,scenario)});
  const{actor,trace:logTrace}=recorder({opts:{cookieF5:scenario.cookieF5}});
  actor.session={provider:scenario.provider,cdpAttached:scenario.cdpAttached,proxy:scenario.proxy===undefined?{server:'h:1'}:scenario.proxy,
    page:scenario.noPage?undefined:{
      context(){return{async cookies(){trace.push(['cookies']);if(scenario.cookiesFail)throw Error('synthetic cookies');return[{name:'f5_a'},{name:'sid'}];}};},
      evaluate(fn){const agent=require('node:vm').runInNewContext('('+fn.toString()+')',{navigator:{userAgent:'synthetic-agent'}})();trace.push(['evaluate',agent]);if(scenario.agentFails)return Promise.reject(Error('synthetic agent'));return Promise.resolve(scenario.agent===undefined?agent:scenario.agent);},
    }};
  actor.gateway=scenario.noGateway?undefined:{useProxiedRequest(context){trace.push(['use',context]);if(scenario.useProxyFails)throw Error('synthetic use');}};
  actor.gatewayReqCtx=scenario.routed?'existing':undefined;
  const value=await outcome(async()=>method('f2052').call(actor));
  return{value,trace,logs:logTrace,state:actor.gatewayReqCtx};
}));

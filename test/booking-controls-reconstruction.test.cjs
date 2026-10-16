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

// Missing session objects fail the same way (outer failures are rejections, not swallowed)
for(const id of ['f2049','f2052','f2055','f2057','f2059'])
  test('missing session rejects like the recovered method: '+id,async()=>compare(async native=>{
    const{method}=harness({native,slots:{123:()=>Promise.resolve(),122:()=>Promise.resolve()}});
    const{actor}=recorder({});delete actor.session;actor.gateway={};
    return outcome(async()=>method(id).call(actor));
  }));

// printTicketInBrowser (f2059)
for(const[name,scenario]of Object.entries({
  clicked:{},notUiLogin:{mode:'api'},noPage:{noPage:true},noControl:{count:0},clickRejects:{clickRejects:true},clickThrows:{clickThrows:true},
  frontFails:{frontFails:true},popupFails:{popupFails:true},countFails:{countFails:true},locatorFails:{locatorFails:true},
}))test('printTicketInBrowser matches recovered print flow: '+name,async()=>compare(async native=>{
  const trace=[];
  const{method}=harness({native,slots:{123:page=>{trace.push(['front']);if(scenario.frontFails)throw Error('synthetic front');return Promise.resolve();}}});
  const{actor,trace:logs}=recorder({});
  const control={count(){trace.push(['count']);if(scenario.countFails)throw Error('synthetic count');return Promise.resolve(scenario.count??1);},
    click(options){trace.push(['click',options]);if(scenario.clickThrows)throw Error('synthetic click');return scenario.clickRejects?Promise.reject(Error('synthetic click rejection')):Promise.resolve();}};
  const page={locator(selector){trace.push(['locator',selector]);if(scenario.locatorFails)throw Error('synthetic locator');return{filter(options){trace.push(['filter',options]);return{first(){trace.push(['first']);return control;}};}};}};
  actor.session={mode:scenario.mode??'uilogin',page:scenario.noPage?undefined:page};
  actor.dismissPostBookingPopup=function(p){assert.equal(this,actor);trace.push(['popup',p===page]);if(scenario.popupFails)return Promise.reject(Error('synthetic popup'));return Promise.resolve();};
  return{value:await outcome(async()=>method('f2059').call(actor)),trace,logs};
}));

// dumpAuthState (f2061): the page-side collector is executed in a sandbox with fake storage
const storage=entries=>({get length(){return Object.keys(entries).length;},key(index){return Object.keys(entries)[index];},getItem(key){return entries[key];}});
for(const[name,scenario]of Object.entries({
  mixed:{local:{accessToken:'abcdefghijklmnopqrstuvwxyz',theme:'dark',id:'0a1b2c3d-1111-2222-3333-444455556666',empty:''},session:{csrf_Token:'1234567890123456789012345'},win:{accessToken:'abcdefghijklmnopqrstuvwxyz',greq:'g',other:'x',token:5}},
  empty:{local:{},session:{},win:{}},evaluateFails:{fail:true},storageBlocked:{blocked:true},
}))test('dumpAuthState matches recovered storage summary and logs: '+name,async()=>compare(async native=>{
  const{method}=harness({native,slots:{2132:source=>require('node:vm').runInNewContext('('+source+')',{
    localStorage:scenario.blocked?{get length(){throw Error('blocked');}}:storage(scenario.local),sessionStorage:storage(scenario.session??{}),window:scenario.win??{}})}});
  const{actor,trace}=recorder({});
  const page={evaluate(fn){if(scenario.fail)return Promise.reject(Error('synthetic evaluate'));return Promise.resolve(require('node:vm').runInNewContext('('+fn.toString()+')',{
    localStorage:scenario.blocked?{get length(){throw Error('blocked');}}:storage(scenario.local),sessionStorage:storage(scenario.session??{}),window:scenario.win??{}})());}};
  return{value:await outcome(async()=>method('f2061').call(actor,page)),trace};
}));

// stopWith (f2079)
for(const[name,scenario]of Object.entries({
  plain:{},stuck:{stuck:true},alreadyStopped:{stopped:true},recoverRelaunch:{recover:true,relaunch:true},recoverNoRelaunch:{recover:true},aiPresent:{ai:{}, recover:true},noRelaunchOption:{options:{noRelaunch:true}},
  nullOptions:{options:null},keepBrowser:{opts:{hideBrowser:false}},hideUndefined:{opts:{}},hideZero:{opts:{hideBrowser:0}},focusRejects:{focus:'reject'},focusThrows:{focus:'throw'},
  recoverFails:{recover:true,aiFails:true},endSettlingFails:{endFails:true},
}))test('stopWith matches recovered recovery and stop handling: '+name,async()=>compare(async native=>{
  const calls=[];
  const{method}=harness({native,slots:{619:(reason,hasAi,noRelaunch)=>{calls.push(['recover?',reason,hasAi,noRelaunch]);return !!scenario.recover;}}});
  const{actor,trace}=recorder({opts:scenario.opts??{}});
  actor.stuck=scenario.stuck;actor.stopped=scenario.stopped;actor.ai=scenario.ai;actor.relaunch=scenario.relaunch;
  if(scenario.endFails)actor.endSettling=()=>{throw Error('synthetic end');};
  actor.aiResolve=function(goal,reason){assert.equal(this,actor);trace.push(['aiResolve',goal,reason]);return scenario.aiFails?Promise.reject(Error('synthetic ai')):Promise.resolve();};
  actor.focusBrowser=function(){assert.equal(this,actor);trace.push(['focus']);if(scenario.focus==='throw')throw Error('synthetic focus');return scenario.focus==='reject'?Promise.reject(Error('synthetic focus rejection')):Promise.resolve();};
  const value=await outcome(async()=>method('f2079').call(actor,'dead session',Object.hasOwn(scenario,'options')?scenario.options:undefined));
  return{value,trace,calls};
}));

// updateLiveForm (f2081)
for(const[name,scenario]of Object.entries({
  noLiveForm:{noForm:true,patch:{date:'2026-10-20'}},date:{patch:{date:'2026-10-20'}},sameDate:{patch:{date:'2026-10-16'}},allFields:{patch:{date:'d',classCode:'3A',quota:'TQ',paymentMethod:'upi',paymentMethodDisplay:'UPI QR',upiId:'x@upi'}},
  nullValues:{patch:{date:null,classCode:null}},emptyPatch:{patch:{}},displayOnly:{patch:{paymentMethodDisplay:'Card'}},methodOnly:{patch:{paymentMethod:'wallet'}},upiOnly:{patch:{upiId:'a@b'}},
  clearDisplay:{patch:{paymentMethodDisplay:'',paymentMethod:undefined},form:{paymentMethod:'wallet'}},nullPatch:{patch:null},
}))test('updateLiveForm matches recovered change tracking: '+name,async()=>compare(async native=>{
  const{method}=harness({native});
  const{actor,trace}=recorder({});
  actor.liveForm=scenario.noForm?undefined:{date:'2026-10-16',classCode:'SL',quota:'GN',paymentMethod:'card',paymentMethodDisplay:'Card',upiId:'',...scenario.form};
  const value=await outcome(async()=>method('f2081').call(actor,scenario.patch));
  return{value,trace,form:actor.liveForm,chosen:actor.chosenPaymentMethod};
}));

// ensureAuthToken (f2083)
for(const[name,scenario]of Object.entries({
  hasToken:{token:'abc'},blankToken:{token:'   ',tokenAfter:3},noPage:{noPage:true},tokenAfter1:{tokenAfter:1},tokenAfter25:{tokenAfter:25},neverWithTimeout:{},closedImmediately:{closedAfter:0},closedLater:{closedAfter:5},
  stoppedDuringWait:{stopAfter:4},stoppedBeforeLoop:{alreadyStopped:true},waitRejects:{tokenAfter:2,waitRejects:true},frontRejects:{frontRejects:true},frontThrows:{frontThrows:true},tokensObjectMissing:{noTokens:true,tokenAfter:2},
}))test('ensureAuthToken matches recovered wait loop: '+name,async()=>compare(async native=>{
  const trace=[];let clock=1000000,waits=0;
  const{method}=harness({native,slots:{123:page=>{trace.push(['front']);if(scenario.frontThrows)throw Error('synthetic front');return scenario.frontRejects?Promise.reject(Error('synthetic rejection')):Promise.resolve();},603:'closed-terminal',604:'no-token-terminal'}});
  const{actor,trace:logs}=recorder({});
  actor.stopped=scenario.alreadyStopped;
  actor.now=()=>clock;
  actor.session={tokens:scenario.noTokens?undefined:{accessToken:scenario.token},page:scenario.noPage?undefined:{
    isClosed(){trace.push(['closed?',waits]);return scenario.closedAfter!==undefined&&waits>=scenario.closedAfter;},
    waitForTimeout(ms){waits++;clock+=ms;trace.push(['wait',ms]);if(scenario.tokenAfter!==undefined&&waits>=scenario.tokenAfter){(actor.session.tokens??(actor.session.tokens={})).accessToken='captured';}
      if(scenario.stopAfter!==undefined&&waits>=scenario.stopAfter)actor.stopped=true;return scenario.waitRejects?Promise.reject(Error('synthetic wait')):Promise.resolve();},
  }};
  const value=await outcome(async()=>method('f2083').call(actor));
  return{value,trace:trace.slice(0,400),logs:logs.slice(0,40),terminal:actor.terminal,waits,logCount:logs.length};
}));

// relaunchIfLoggedOut (f2087)
for(const[name,scenario]of Object.entries({
  noPage:{noPage:true},noLoginButton:{button:[false]},loginButtonFails:{button:['reject']},positive:{button:[true],positive:[true]},positiveFails:{button:[true],positive:['reject'],token:false},
  noToken:{button:[true],positive:[false]},tokenTransient:{token:true,button:[true,false],positive:[false,false]},tokenPositiveAfterWait:{token:true,button:[true,true],positive:[false,true]},
  tokenStillLoggedOut:{token:true,button:[true,true],positive:[false,false]},hydrateFails:{token:true,hydrateFails:true,button:[true,true],positive:[false,false]},waitRejects:{token:true,waitRejects:true,button:[true,true],positive:[false,false]},
  buttonFailsSecond:{token:true,button:[true,'reject'],positive:[false,false]},
}))test('relaunchIfLoggedOut matches recovered login-state decisions: '+name,async()=>compare(async native=>{
  const trace=[];
  const queue=(name,values)=>{const list=[...(values??[false])];return page=>{trace.push([name]);const next=list.length>1?list.shift():list[0];if(next==='reject')return Promise.reject(Error('synthetic '+name));return Promise.resolve(next);};};
  const{method}=harness({native,slots:{431:queue('button',scenario.button),755:queue('positive',scenario.positive),474:page=>{trace.push(['hydrate']);if(scenario.hydrateFails)throw Error('synthetic hydrate');return Promise.resolve();}}});
  const{actor,trace:logs}=recorder({});
  actor.session={tokens:scenario.token?{accessToken:'abc'}:undefined,page:scenario.noPage?undefined:{waitForTimeout(ms){trace.push(['wait',ms]);return scenario.waitRejects?Promise.reject(Error('synthetic wait')):Promise.resolve();}}};
  const value=await outcome(async()=>method('f2087').call(actor));
  return{value,trace,logs,relaunch:actor.relaunch,stopped:actor.stopped};
}));

// attachDuplicateLoginWatch (f2094/f2095)
const responseFor=(url,status,options={})=>({url(){if(options.urlFails)throw Error('synthetic url');return url;},status(){if(options.statusFails)throw Error('synthetic status');return status;}});
for(const[name,scenario]of Object.entries({
  attachedOnce:{responses:[]},alreadyAttached:{attached:true},
  journeyContext:{responses:[['https://x.invalid/eticketing/dispatch/tc',200]],tc:true},journeyTwice:{responses:[['https://x.invalid/tc',200],['https://x.invalid/tc',200]],tc:true},
  duplicate:{responses:[['https://x.invalid/eticketing/protected/mapps1/book?x=1',409]]},duplicateTwice:{responses:[['https://x.invalid/eticketing/protected/a',409],['https://x.invalid/eticketing/protected/b',409]]},
  otherStatus:{responses:[['https://x.invalid/eticketing/protected/a',500]]},unprotected409:{responses:[['https://x.invalid/other/a',409]]},duplicateAlreadyFlagged:{responses:[['https://x.invalid/eticketing/protected/a',409]],flagged:true},
  statusFails:{responses:[['https://x.invalid/tc',200,{statusFails:true}]],tc:true},urlFails:{responses:[['u',409,{urlFails:true}]]},
}))test('attachDuplicateLoginWatch matches recovered response handling: '+name,async()=>compare(async native=>{
  const calls=[];
  const{method}=harness({native,slots:{635:(url,primed)=>{calls.push(['isTc',url,primed]);return !!scenario.tc;}}});
  const{actor,trace}=recorder({});
  actor.duplicateWatchAttached=scenario.attached;actor.duplicateLogin=scenario.flagged;actor.tcPrimed='primed-marker';
  const handlers=[];
  const page={on(event,handler){handlers.push([event,handler]);}};
  const first=await outcome(async()=>method('f2094').call(actor,page));
  const second=await outcome(async()=>method('f2094').call(actor,page));
  const results=[];
  for(const[url,status,options]of scenario.responses??[])for(const[,handler]of handlers)results.push(await outcome(async()=>handler(responseFor(url,status,options))));
  return{first,second,events:handlers.map(row=>row[0]),results,calls,trace,state:{spa:actor.spaFiredTc,dup:actor.duplicateLogin,attached:actor.duplicateWatchAttached}};
}));

// aiResolve (f2128)
for(const[name,scenario]of Object.entries({
  resolved:{result:true},unresolved:{result:false},rejects:{rejects:true},noAi:{noAi:true},noPage:{noPage:true},extra:{extra:'context-text',result:true},
  relogin:{callback:'relogin',result:false},switchBrowser:{callback:'switch',result:false},switchWithoutHook:{callback:'switch',noHook:true},resolveThrows:{throws:true},
}))test('aiResolve matches recovered AI fallback flow: '+name,async()=>compare(async native=>{
  const calls=[];
  class Snapshot{constructor(page){calls.push(['snapshot',page]);this.page=page;}}
  const{method}=harness({native,slots:{230:Snapshot}});
  const{actor,trace}=recorder({opts:scenario.noHook?{}:{onSwitchBrowser(){calls.push(['switch-hook']);}}});
  actor.session={page:scenario.noPage?undefined:'page-a'};
  actor.stop=function(){assert.equal(this,actor);calls.push(['stop']);};
  actor.ai=scenario.noAi?undefined:{resolve(page,snapshot,goal,extra,hooks){
    calls.push(['resolve',page,snapshot instanceof Snapshot,goal,extra,Object.keys(hooks)]);
    if(scenario.throws)throw Error('synthetic resolve');
    const pending=[];
    if(scenario.callback==='relogin')pending.push(hooks.onRelogin());
    if(scenario.callback==='switch')hooks.onSwitchBrowser();
    return Promise.all(pending).then(values=>{calls.push(['relogin-result',values]);if(scenario.rejects)throw Error('synthetic rejection');return scenario.result;});}};
  const value=await outcome(async()=>method('f2128').call(actor,'fix the form',scenario.extra));
  return{value,trace,calls,state:{relaunch:actor.relaunch,terminal:actor.terminal}};
}));

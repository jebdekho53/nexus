'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const legacy=require('./fixtures/legacy/controls.legacy.cjs');
const migrated=require('../src/main/booking/controls.cjs');

// Run controls (src/ts/main/booking/run-controls.ts, re-exported by controls.cjs) versus the previous JavaScript.
const check=differential(legacy,migrated);
const actorWith=(trace,o={})=>{
  const page=o.noPage?null:{
    isClosed:()=>{trace.push('isClosed');return !!o.pageClosed;},waitForTimeout:ms=>{trace.push(['wait',ms]);o.onWait?.();return o.waitRejects?Promise.reject(new Error('w')):Promise.resolve();},
    context:()=>({newCDPSession:async()=>{trace.push('cdp');if(o.cdpFails)throw new Error('cdp');return{send:async(method,params)=>{trace.push(['send',method,params]);return{windowId:7};},detach:()=>{trace.push('detach');return o.detachRejects?Promise.reject(new Error('d')):Promise.resolve();}};}}),
    locator:selector=>{trace.push(['locator',selector]);const control={filter:f=>{trace.push(['filter',f]);return control;},first:()=>control,count:async()=>o.controls??0,click:opts=>{trace.push(['click',opts]);return o.clickRejects?Promise.reject(new Error('c')):Promise.resolve();}};return control;},
    on:(event,listener)=>{trace.push(['on',event]);o.listeners?.push(listener);},
  };
  let clock=0;
  const actor={
    pnrSeen:o.pnrSeen,settlingPayment:o.settling,paymentCancelled:o.cancelled,stopped:o.stopped,stuck:o.stuck,terminal:o.terminal,relaunch:o.relaunch,ai:o.ai,liveForm:o.liveForm,
    opts:{hideBrowser:o.hide,vendorBrowser:o.vendor,onSwitchBrowser:o.noSwitch?undefined:()=>trace.push('switchBrowser')},session:{page,tokens:o.tokens,mode:o.mode},
    cancelPnrWait:o.noCancelWait?undefined:()=>trace.push('cancelPnrWait'),now:()=>{const v=clock;clock+=o.clockStep??1000;return v;},stop:()=>{trace.push('stop');},
    endSettling:()=>trace.push('endSettling'),endFinalPnrRequest:()=>trace.push('endFinal'),onProgress:(...a)=>trace.push(['progress',...a]),log:(...a)=>trace.push(['log',...a]),
    focusBrowser:()=>{trace.push('focusBrowser');return o.focusRejects?Promise.reject(new Error('f')):Promise.resolve();},aiResolve:(...a)=>{trace.push(['aiResolve',...a]);if(o.aiSetsRelaunch)actor.relaunch=true;return Promise.resolve();},
    dismissPostBookingPopup:()=>{trace.push('dismiss');return o.dismissRejects?Promise.reject(new Error('x')):Promise.resolve();},
  };
  return actor;
};
const state=actor=>({paymentCancelled:actor.paymentCancelled,stopped:actor.stopped,terminal:actor.terminal,relaunch:actor.relaunch,chosen:actor.chosenPaymentMethod,form:actor.liveForm&&{...actor.liveForm},dup:[actor.duplicateWatchAttached,actor.duplicateLogin,actor.spaFiredTc]});

test('exports',()=>sameExports(legacy,migrated));

test('cancelPayment and stoppedResult',async()=>{
  for(const o of[{},{pnrSeen:true},{settling:true},{noCancelWait:true},{stopped:true}])
    await check('cancel '+JSON.stringify(o),(m,trace)=>{const a=actorWith(trace,o);m.cancelPayment(a,'Operator cancelled');return state(a);});
  for(const cancelled of[undefined,'','Operator cancelled'])
    await check('stoppedResult '+cancelled,(m,trace)=>m.stoppedResult(actorWith(trace,{cancelled}),{defaultResult:()=>{trace.push('default');return{success:false,message:'Stopped'};}}));
});

test('browser window helpers',async()=>{
  for(const o of[{},{noPage:true},{vendor:true},{focusRejects:true}]) {
    await check('focus '+JSON.stringify(o),(m,trace)=>m.focusBrowser(actorWith(trace,o),{bringToFront:p=>{trace.push('front');return o.focusRejects?Promise.reject(new Error('f')):Promise.resolve();}}));
    await check('hide '+JSON.stringify(o),(m,trace)=>m.hideBrowser(actorWith(trace,o),{moveOffScreen:(p,flag)=>{trace.push(['off',flag]);return o.focusRejects?Promise.reject(new Error('h')):Promise.resolve();}}));
  }
  for(const o of[{},{noPage:true},{cdpFails:true},{detachRejects:true}])await check('minimize '+JSON.stringify(o),(m,trace)=>m.minimizeBrowser(actorWith(trace,o)));
  for(const o of[{mode:'uilogin',controls:1},{mode:'uilogin',controls:0},{mode:'uilogin',controls:1,clickRejects:true},{mode:'uilogin',dismissRejects:true},{mode:'api',controls:1},{noPage:true,mode:'uilogin'}])
    await check('print '+JSON.stringify(o),(m,trace)=>m.printTicketInBrowser(actorWith(trace,o),{bringToFront:p=>{trace.push('front');return Promise.resolve();}}));
  await check('print front rejects',(m,trace)=>m.printTicketInBrowser(actorWith(trace,{mode:'uilogin'}),{bringToFront:()=>Promise.reject(new Error('front'))}));
});

test('stopWith',async()=>{
  const scenarios={stuck:{stuck:true},plain:{},stopped:{stopped:true},recoverNoRelaunch:{ai:{}},recoverRelaunch:{ai:{},aiSetsRelaunch:true},hideFalse:{hide:false},hideTrue:{hide:true},focusRejects:{focusRejects:true}};
  for(const[name,o]of Object.entries(scenarios))for(const recover of[true,false])for(const options of[undefined,{noRelaunch:true}])
    await check(name+recover+JSON.stringify(options),async(m,trace)=>{const a=actorWith(trace,o);const result=await m.stopWith(a,'Session lost',options,{shouldRecover:(...args)=>{trace.push(['shouldRecover',...args]);return recover;}});return[result,state(a)];});
});

test('updateLiveForm',async()=>{
  const patches=[{},{date:'2024-05-01'},{classCode:'3A',quota:'TQ'},{paymentMethod:'wallet'},{paymentMethodDisplay:'Wallet'},{upiId:'a@b'},{paymentMethod:'x',paymentMethodDisplay:''},{date:undefined,quota:undefined},{date:'same'},{paymentMethodDisplay:null},{paymentMethod:null}];
  for(const liveForm of[undefined,{date:'same',quota:'GN'},{}])for(const patch of patches)
    await check('live '+JSON.stringify([liveForm,patch]),(m,trace)=>{const a=actorWith(trace,{liveForm:liveForm&&{...liveForm}});const result=m.updateLiveForm(a,patch);return[result,state(a)];});
});

test('ensureAuthToken waits for sign-in',async()=>{
  const scenarios={noPage:{noPage:true},hasToken:{tokens:{accessToken:' tok '}},closed:{pageClosed:true},tokenAfterWait:{tokenAfter:2},timesOut:{clockStep:20000},stoppedFirst:{stopped:true},reports:{clockStep:4000,tokenAfter:8},stoppedDuring:{stopAfter:1},blankToken:{tokens:{accessToken:'  '},clockStep:60000},nullToken:{tokens:{accessToken:null},clockStep:60000},waitRejects:{waitRejects:true,tokenAfter:2}};
  for(const[name,o]of Object.entries(scenarios))for(const bringRejects of[false,true])
    await check(name+bringRejects,async(m,trace)=>{
      let waits=0;
      const a=actorWith(trace,{...o,tokens:o.tokens??{},onWait:()=>{waits++;if(o.tokenAfter&&waits>=o.tokenAfter)a.session.tokens={accessToken:'T'};if(o.stopAfter&&waits>=o.stopAfter)a.stopped=true;}});
      const result=await m.ensureAuthToken(a,{bringToFront:()=>{trace.push('front');return bringRejects?Promise.reject(new Error('b')):Promise.resolve();},terminalClosed:()=>'closed!',terminalNoToken:()=>'no token!'});
      return[result,state(a)];
    });
});

test('relaunchIfLoggedOut',async()=>{
  const bools=[true,false,'throw'];
  for(const loginVisible of bools)for(const positive of bools)for(const tokenOpt of[undefined,'tok'])for(const afterWaitPositive of bools)for(const afterWaitVisible of bools)
    await check(JSON.stringify([loginVisible,positive,tokenOpt,afterWaitPositive,afterWaitVisible]),async(m,trace)=>{
      const a=actorWith(trace,{tokens:tokenOpt?{accessToken:tokenOpt}:{}});
      let positiveCalls=0,visibleCalls=0;
      const pick=(v)=>v==='throw'?Promise.reject(new Error('x')):Promise.resolve(v);
      const result=await m.relaunchIfLoggedOut(a,{loginButtonVisible:()=>{visibleCalls++;trace.push(['visible',visibleCalls]);return pick(visibleCalls===1?loginVisible:afterWaitVisible);},positivelyLoggedIn:()=>{positiveCalls++;trace.push(['positive',positiveCalls]);return pick(positiveCalls===1?positive:afterWaitPositive);},waitForHydration:()=>{trace.push('hydrate');return Promise.resolve();}});
      return[result,state(a)];
    });
  await check('no page',(m,trace)=>m.relaunchIfLoggedOut(actorWith(trace,{noPage:true}),{loginButtonVisible:()=>Promise.resolve(true),positivelyLoggedIn:()=>Promise.resolve(false),waitForHydration:()=>Promise.resolve()}));
});

test('attachDuplicateLoginWatch',async()=>{
  const responses=[{url:'https://x.test/eticketing/protected/mapps1/a?x=1',status:409},{url:'https://x.test/eticketing/protected/mapps1/a',status:200},{url:'https://x.test/other',status:409},{url:'https://x.test/journey',status:200,journey:true},{url:'https://x.test/eticketing/protected/b',status:409,journey:true}];
  for(const attachedBefore of[false,true])for(const dupBefore of[false,true])for(const tcBefore of[false,true])
    await check(JSON.stringify([attachedBefore,dupBefore,tcBefore]),(m,trace)=>{
      const listeners=[];const a=actorWith(trace,{listeners});
      a.duplicateWatchAttached=attachedBefore;a.duplicateLogin=dupBefore;a.spaFiredTc=tcBefore;a.tcPrimed='primed';
      const page=a.session.page;
      const first=m.attachDuplicateLoginWatch(a,page,{isJourneyContextUrl:(url,primed)=>{trace.push(['isJourney',url,primed]);return url.endsWith('/journey')||url.endsWith('/b');}});
      const second=m.attachDuplicateLoginWatch(a,page,{isJourneyContextUrl:()=>false});
      for(const r of responses)for(const listener of listeners)listener({url:()=>r.url,status:()=>r.status});
      for(const listener of listeners)listener({url:()=>{throw new Error('bad');},status:()=>200});
      return[first,second,listeners.length,state(a)];
    });
});

test('aiResolve',async()=>{
  const scenarios={noAi:{},noPage:{ai:{},noPage:true},resolves:{ai:{},aiResult:true},fails:{ai:{},aiResult:false},rejects:{ai:{},aiRejects:true},relogin:{ai:{},hook:'relogin'},switchBrowser:{ai:{},hook:'switch'},switchNoCallback:{ai:{},hook:'switch',noSwitch:true}};
  for(const[name,o]of Object.entries(scenarios))for(const extra of[undefined,'why'])
    await check(name+extra,async(m,trace)=>{
      const a=actorWith(trace,o);
      if(o.ai)a.ai={resolve:async(page,snapshot,goal,extraArg,hooks)=>{trace.push(['resolve',snapshot,goal,extraArg]);if(o.hook==='relogin')trace.push(['reloginResult',await hooks.onRelogin()]);if(o.hook==='switch')hooks.onSwitchBrowser();if(o.aiRejects)throw new Error('ai');return o.aiResult;}};
      const result=await m.aiResolve(a,'Recover',extra,{createSnapshot:()=>{trace.push('snapshot');return'SNAP';}});
      return[result,state(a)];
    });
});

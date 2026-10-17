'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');
const {passengerFields,RESUME_URL}=require('../src/main/booking/ui-booking.cjs');

// f2102 runUiBooking: every scenario runs the actual recovered function and the native module against a fresh
// synthetic actor/page/driver and compares the result, the full effect trace (order included) and the hook surface.

class Cursor {constructor(page){this.page=page;Cursor.trace.push(['cursor',page&&page.name]);}async dwell(a,b){Cursor.trace.push(['dwell',a,b]);}}

function scenario(options={}) {
  return async native=>{
    const trace=[];
    Cursor.trace=trace;
    const page={
      name:'page-a',
      url:()=>{trace.push(['url']);return options.url??'https://example.invalid/home';},
      waitForLoadState(state){trace.push(['load',state]);const promise=options.loadFails?Promise.reject(Error('synthetic load')):Promise.resolve();return promise;},
    };
    const opts={
      ui:options.ui,hideBrowser:options.hideBrowser,fastAmz:options.fastAmz,fastAkamaiPreSubmit:options.fastAkamaiPreSubmit,
      serverTimeSync:options.serverTimeSync,optimizeSpace:options.optimizeSpace,
      onProxyOutcome:options.noProxyOutcome?undefined:function onProxyOutcome(){},
      onQr:options.noOnQr?undefined:function(payload){trace.push(['onQr',this===opts,payload]);return'qr-result';},
      onQrPrepare:options.noOnQrPrepare?undefined:function(){trace.push(['onQrPrepare',this===opts]);return'prep';},
      onUpiCollect:options.noUpi?undefined:function(payload){trace.push(['onUpi',this===opts,payload]);return'upi-result';},
      licenseCheck:options.noLicense?undefined:function(){trace.push(['licenseCheck',this===opts]);return'lic';},
      beforeBooking:options.noBefore?undefined:function(){trace.push(['beforeBooking',this===opts]);return options.beforeResult;},
      onKillPair:options.noKill?undefined:function(){trace.push(['onKillPair',this===opts]);},
      onClaimPayment:options.claim===undefined?undefined:async function(){trace.push(['claim',this===opts]);if(options.stopDuringClaim)actor.stopped=true;return options.claim;},
    };
    const record=(name,result)=>function(...args){trace.push([name,this===actor,...args]);return typeof result==='function'?result.call(this,...args):result;};
    const actor={
      session:{page,proxy:options.proxy},opts,stopped:false,duplicateLogin:false,akamai:options.akamai,
      captureLocationEarly:record('captureLocationEarly'),
      onProgress:function(...args){trace.push(['progress',this===actor,...args]);},
      log:record('log'),
      relaunchIfLoggedOut:async function(){trace.push(['relaunch',this===actor]);return options.relaunch;},
      searchTrains:async function(job){trace.push(['search',this===actor,job.trainNumber]);options.afterSearch?.(actor);},
      ensureServerTimeSynced:async function(){trace.push(['ensureSynced']);},
      syncServerTime:async function(){trace.push(['syncServerTime']);return'synced';},
      resolveTarget:function(job){trace.push(['resolveTarget',this===actor,job.classCode]);return options.target;},
      serverNow:function(){trace.push(['serverNow']);return options.serverNow[Math.min(actor.nowCalls++,options.serverNow.length-1)];},
      nowCalls:0,
      preTargetProbe:async function(job,ms){trace.push(['probe',this===actor,ms]);options.afterProbe?.(actor);return options.probe;},
      waitUntilTarget:async function(target){trace.push(['waitUntilTarget',this===actor,target]);},
      stopWith:function(...args){trace.push(['stopWith',this===actor,...args]);return{stopWith:args};},
      captchaHook:function(){trace.push(['captchaHook',this===actor]);return'captcha-solver';},
      aiResolve:function(...args){trace.push(['aiResolve',this===actor,...args]);return'ai';},
      focusBrowser:function(...args){trace.push(['focusBrowser',this===actor,args.length]);return'focused';},
      awaitUiPayment:async function(...args){trace.push(['awaitUiPayment',this===actor,...args]);return'paid';},
    };
    options.prepare?.(actor);
    const driverCalls=[];
    const driver=async function(...args){
      trace.push(['driver',this===undefined,args.length]);
      const[drivenPage,human,request,hooks,refresh,selectors,extra]=args;
      driverCalls.push({samePage:drivenPage===page,human:human instanceof Cursor,request,refresh,selectors,extra,hookKeys:Object.keys(hooks)});
      const hookSummary={};
      for(const key of Object.keys(hooks))hookSummary[key]=typeof hooks[key];
      driverCalls.push(hookSummary,{proxyActive:hooks.proxyActive,fastAmz:hooks.fastAmz,pruneBmso:hooks.pruneBmso,highLoadDelayMs:hooks.highLoadDelayMs,solveCaptcha:hooks.solveCaptcha});
      if(options.exerciseHooks) {
        hooks.onProgress('stage','message');
        hooks.log('area','text','level');
        driverCalls.push({isStopped:hooks.isStopped(),aiResolve:hooks.aiResolve('goal','extra')});
        if(hooks.surface)driverCalls.push({surface:hooks.surface()});
        if(hooks.fastAkamai)driverCalls.push({fastAkamai:await hooks.fastAkamai()});
        for(const name of['onQr','onUpiCollect'])for(const payload of[{image:1},{caption:'given'},{caption:''},{caption:null}])
          driverCalls.push({[name]:await outcome(async()=>hooks[name](payload))});
        driverCalls.push({onQrPrepare:hooks.onQrPrepare(),licenseCheck:hooks.licenseCheck(),beforeBooking:hooks.beforeBooking()});
        driverCalls.push({qrNoPayload:await outcome(async()=>hooks.onQr())});
      }
      options.duringDriver?.(actor);
      return options.driverResult??{ok:true,message:'payment ready'};
    };
    const gate=options.gate??{};
    const slots={
      230:Cursor,
      940:()=>{trace.push(['stopped940']);return{success:false,stopped:true};},
      602:'DUPLICATE-LOGIN',
      466:(drivenPage,on)=>{trace.push(['optimizeSpace',drivenPage===page,on]);},
      666:driver,
      941:()=>{trace.push(['reference941']);return'REF-001';},
    };
    if(options.noCursor)delete slots[230];
    const{method}=harness({native,slots});
    const job={
      trainNumber:options.trainNumber===undefined?' 12951 ':options.trainNumber,classCode:'3A',date:'2026-10-20',quota:'GN',
      origin:'NDLS',destination:'BCT',bookOnlyIfCnf:true,paymentMethod:options.paymentMethod,upiId:'user@bank',
      passengers:options.passengers??[{name:'A',age:30,gender:'M',berthPreference:'LB',foodChoice:'V',childBerth:false,extra:'dropped'},{name:'B',age:5}],
    };
    const value=await outcome(async()=>method('f2102').call(actor,job));
    return{value,trace,driverCalls,state:{stopped:actor.stopped,duplicateLogin:actor.duplicateLogin}};
  };
}
const run=(name,options)=>test('runUiBooking matches the recovered controller: '+name,async()=>compare(scenario(options)));

// ---- early exits ----------------------------------------------------------------------------------------------
run('recording mode',{ui:{recordMode:true}});
run('recording mode wins over a missing train',{ui:{recordMode:1},trainNumber:''});
for(const[name,trainNumber]of Object.entries({missing:undefined,empty:'',spaces:'   ',nullTrain:null}))
  run('no train number: '+name,{trainNumber:name==='missing'?null:trainNumber});
run('relaunch after logout stops the run',{relaunch:true});
run('relaunch resolves falsy',{relaunch:0,serverNow:[0],afterSearch:undefined});
run('cursor binding still uninitialised',{noCursor:true});

// ---- search, resume and duplicate-login handling ---------------------------------------------------------------
for(const[name,url]of Object.entries({trainList:'https://x.invalid/booking/train-list',passenger:'https://x.invalid/booking/psgninput',review:'https://x.invalid/booking/review',payment:'https://x.invalid/payment',paymentWord:'https://x.invalid/payments',bank:'https://x.invalid/bkgPaymentOptions',upper:'HTTPS://X.INVALID/BOOKING/REVIEW',home:'https://x.invalid/home'}))
  run('resume detection: '+name,{url,serverNow:[0],target:undefined});
run('stopped by the train search',{afterSearch:actor=>{actor.stopped=true;}});
run('duplicate login detected after the search',{afterSearch:actor=>{actor.duplicateLogin=true;}});
run('stopped has priority over duplicate login',{afterSearch:actor=>{actor.stopped=true;actor.duplicateLogin=true;}});
run('page load failure is ignored',{loadFails:true,target:undefined});

// ---- server time and the slot gate -----------------------------------------------------------------------------
for(const sync of[true,false,0])run('server time sync flag '+sync,{serverTimeSync:sync,target:undefined});
run('no target slot gating logs the refresh note',{target:undefined});
run('target already passed',{target:{ms:5000,label:'Tatkal AC'},serverNow:[4000]});
run('target exactly at the gate',{target:{ms:5000,label:'Tatkal AC'},serverNow:[4000]});
run('target in the future waits when the probe is not early',{target:{ms:90000,label:'Tatkal AC'},serverNow:[1000,1000],probe:'late'});
run('target in the future, probe says early',{target:{ms:90000,label:'Tatkal AC'},serverNow:[1000,1000],probe:'early'});
run('probe reports not early but the gate passed meanwhile',{target:{ms:90000,label:'Tatkal AC'},serverNow:[1000,95000],probe:'late'});
run('stopped during the probe',{target:{ms:90000,label:'Tatkal AC'},serverNow:[1000],probe:'late',afterProbe:actor=>{actor.stopped=true;}});
run('target with zero ms',{target:{ms:0,label:'Now'},serverNow:[0]});

// ---- request and hooks given to the shared driver --------------------------------------------------------------
const hookOptions={target:undefined,exerciseHooks:true,driverResult:{ok:true,message:'ready'}};
run('default hook surface',hookOptions);
run('hideBrowser false',{...hookOptions,hideBrowser:false});
run('hideBrowser true',{...hookOptions,hideBrowser:true});
run('hideBrowser zero',{...hookOptions,hideBrowser:0});
run('fastAmz set',{...hookOptions,fastAmz:true,fastAkamaiPreSubmit:true});
run('fastAkamaiPreSubmit true without akamai',{...hookOptions,fastAkamaiPreSubmit:true});
run('fastAkamaiPreSubmit true with akamai',{...hookOptions,fastAkamaiPreSubmit:true,akamai:{fastRefresh:()=>Promise.resolve('fast')}});
run('fastAkamaiPreSubmit true, refresh rejects',{...hookOptions,fastAkamaiPreSubmit:true,akamai:{fastRefresh:()=>Promise.reject(Error('synthetic'))}});
run('fastAkamaiPreSubmit true, refresh returns a thenable-less value',{...hookOptions,fastAkamaiPreSubmit:true,akamai:{fastRefresh:()=>({catch:()=>undefined})}});
run('fastAkamaiPreSubmit truthy but not true',{...hookOptions,fastAkamaiPreSubmit:1,akamai:{fastRefresh:()=>Promise.resolve('fast')}});
for(const[name,proxy]of Object.entries({none:undefined,nullProxy:null,noServer:{},blank:{server:'  '},server:{server:' http://p.invalid:8080 '}}))
  run('proxy '+name,{...hookOptions,proxy});
run('operator callbacks missing',{...hookOptions,noProxyOutcome:true,noOnQr:true,noOnQrPrepare:true,noUpi:true,noLicense:true,noBefore:true});
run('beforeBooking returns a value',{...hookOptions,beforeResult:'proceed'});
run('beforeBooking returns zero',{...hookOptions,beforeResult:0});
run('beforeBooking returns null',{...hookOptions,beforeResult:null});
run('ui refresh options configured',{...hookOptions,ui:{refreshMinMs:10,refreshMaxMs:20,refreshBudgetMs:30,selectors:{a:1},recordStopAt:'step',highLoadDelayMs:777}});
run('ui refresh options zero and false-y',{...hookOptions,ui:{refreshMinMs:0,refreshMaxMs:0,refreshBudgetMs:0,selectors:null,recordStopAt:0,highLoadDelayMs:0}});
run('payment method and passengers are passed through',{...hookOptions,paymentMethod:'UPI',passengers:[{name:'C',age:41,gender:'F',berthPreference:'',foodChoice:undefined,childBerth:true}]});
run('empty payment method becomes undefined',{...hookOptions,paymentMethod:''});
run('no passengers',{...hookOptions,passengers:[]});
run('passengers is not an array',{...hookOptions,passengers:{map:undefined}});
run('optimizeSpace brackets the driver',{...hookOptions,optimizeSpace:true});
run('driver rejection skips the optimizeSpace restore',{...hookOptions,optimizeSpace:true,driverResult:Promise.reject(Object.assign(Error('synthetic driver'),{}))});

// ---- results ---------------------------------------------------------------------------------------------------
run('driver ok with message',{target:undefined,driverResult:{ok:true,message:'ready'}});
run('driver ok without message',{target:undefined,driverResult:{ok:true}});
run('driver ok, reached continue',{target:undefined,driverResult:{ok:true,message:'ready',reachedContinue:true},paymentMethod:'CARD'});
run('driver not ok',{target:undefined,driverResult:{ok:false,message:'bank declined'}});
run('driver kill with callback',{target:undefined,driverResult:{kill:true,ok:true}});
run('driver kill without callback',{target:undefined,driverResult:{kill:true},noKill:true});
run('driver kill beats not ok',{target:undefined,driverResult:{kill:true,ok:false,message:'x'}});
run('stopped while the driver ran',{target:undefined,driverResult:{ok:true},duringDriver:actor=>{actor.stopped=true;}});
run('duplicate login while the driver ran',{target:undefined,driverResult:{ok:true},duringDriver:actor=>{actor.duplicateLogin=true;}});
for(const claim of['stop','backup','other',undefined])
  run('claim payment answer '+claim,{target:undefined,claim,driverResult:{ok:true,message:'ready',reachedContinue:true}});
run('stopped while claiming',{target:undefined,claim:'backup',stopDuringClaim:true});

// ---- the small helpers -----------------------------------------------------------------------------------------
test('passengerFields keeps exactly the fields the UI driver reads',()=>{
  assert.deepEqual(Object.keys(passengerFields({name:'A',age:1,gender:'M',berthPreference:'LB',foodChoice:'V',childBerth:true,other:1})),
    ['name','age','gender','berthPreference','foodChoice','childBerth']);
});
test('resume pattern matches the recovered regular expression source and flags',()=>{
  assert.equal(RESUME_URL.source,'\\/booking\\/(train-list|psgninput|review)|\\/payment\\b|bkgPaymentOptions');
  assert.equal(RESUME_URL.flags,'i');
  assert.equal(RESUME_URL.global,false);
});

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const electron = require('electron');
const {createEngine} = require('./runtime/engine.cjs');
const {createCompiledRuntime} = require('./runtime/compiled-runtime.cjs');

const projectRoot = path.resolve(__dirname, '../..');
if(process.argv.includes('--booking-window-check'))require(path.join(projectRoot,'test/booking-window-qa.cjs')).install(electron);
require('./runtime/window-size-audit.cjs').install(electron,projectRoot);
require('./runtime/desktop-rendering.cjs').configure(electron.app);
require('./runtime/trial-access.cjs').installStateHandler(electron,projectRoot);
require('./runtime/matrix-brand.cjs').install(electron,projectRoot);
const vendorRequire = createRequire(path.join(projectRoot, 'vendor', 'package.json'));
const isSmoke = process.argv.includes('--smoke-test');
const managedRelease=!isSmoke&&(process.argv.includes('--release')||!process.argv.includes('--development'));
// This reconstructed project always uses its key-free source-build policy.
const isDevelopment = true;
const diagnostics = path.join(projectRoot, 'diagnostics');
fs.mkdirSync(diagnostics, {recursive:true});
let testSecrets=[];
let activity=null;
try {const account=JSON.parse(fs.readFileSync(path.join(diagnostics,'test-account.json'),'utf8'));testSecrets=[account.password].filter(Boolean);} catch {}
const log = (event, details = {}) => {
  let text=JSON.stringify({time:new Date().toISOString(),pid:process.pid,event,...details});
  for(const secret of testSecrets)text=text.replaceAll(secret,'[redacted]');
  if(activity)text=activity.redact(text);
  fs.appendFileSync(path.join(diagnostics,'startup.jsonl'),text+'\n');
  activity?.record(event,details);
};
process.on('uncaughtExceptionMonitor',error=>log('matrix-uncaught-error',{error:String(error?.stack||error)}));
try { require('./runtime/mobile-bridge.cjs').createMobileBridge(electron, projectRoot, log); } catch (e) { log('mobile-bridge-init-error', { error: String(e.message) }); }
if (isDevelopment && !isSmoke) {
  const profile=process.argv.includes('--booking-window-check')?path.join(diagnostics,'booking-window-check-profile'):process.argv.includes('--release-activation-test')?path.join(diagnostics,'release-qa-profile'):process.argv.includes('--isolated-live-test')?path.join(diagnostics,'live-e2e-profile'):managedRelease?require('./runtime/profile.cjs').releaseProfile(electron.app,projectRoot):path.join(diagnostics,'development-profile');
  fs.mkdirSync(profile,{recursive:true});
  const setPath=electron.app.setPath.bind(electron.app);
  setPath('userData',profile);
  electron.app.setPath=(name,value)=>setPath(name,name==='userData'?profile:value);
  log('development-profile',{profile});
  electron.app.on('browser-window-created',(_event,win)=>{
    win.webContents.on('did-fail-load',(_event,code,description)=>log('renderer-load-error',{code,description}));
    win.webContents.on('render-process-gone',(_event,details)=>log('renderer-process-gone',details));
    win.webContents.on('console-message',(_event,level,message)=>{if(level>=2)log('renderer-console',{level,message});});
    win.on('show',()=>log('matrix-window-visible',{page:path.basename(win.webContents.getURL().split('?')[0])}));
    // E2E stages are recorded at f3720 below. Keep native send untouched:
    // the recovered progress broadcaster also wraps it during initialization.
    win.webContents.on('did-finish-load',()=>log('development-window-loaded',{
      title:win.getTitle(),page:path.basename(win.webContents.getURL().split('?')[0]),
      ...(win.webContents.getURL().includes('/security-error.html')?{detail:new URL(win.webContents.getURL()).searchParams.get('detail')} : {}),
    }));
    if(process.argv.includes('--isolated-live-test'))win.webContents.on('did-finish-load',()=>{
      if(!win.webContents.getURL().includes('/booking-box.html'))return;
      win.webContents.executeJavaScript(`window.__matrixQrProbe=null;window.api.onQr(payload=>{if(payload.closed||!payload.dataUrl)return;const image=new Image();image.onload=()=>{window.__matrixQrProbe={at:Date.now(),formId:payload.formId,ready:true,width:image.naturalWidth,height:image.naturalHeight};};image.src=payload.dataUrl;});true;`).catch(error=>log('e2e-qr-probe-error',{error:String(error.message)}));
    });
  });
}
const Module=require('node:module');
const nativeLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(typeof request==='string'&&/\.jsc$/i.test(request)) {
    log('native-bytecode-load-rejected',{file:path.basename(request)});
    throw new Error('This source project executes JavaScript definitions and does not load .jsc code');
  }
  return Reflect.apply(nativeLoad,this,[request,parent,isMain]);
};
const errorDetails = error => ({message:String(error?.message || error),stack:error?.stack,frames:error?.recoveredFrames});
process.on('uncaughtException',error=>{log('uncaughtException',errorDetails(error));if(isSmoke)electron.app.exit(1);});
process.on('unhandledRejection',error=>log('unhandledRejection',errorDetails(error)));

globalThis.__esmImport = specifier => {
  if (/^(node:|data:|file:|https?:)/.test(specifier)) return import(specifier);
  return import(pathToFileURL(vendorRequire.resolve(specifier)).href);
};

const baseElectron = isSmoke ? require('./runtime/offline-smoke.cjs').install(electron,projectRoot,log) : electron;
const appElectron=require('./runtime/window-readiness.cjs').install(baseElectron,projectRoot,log);
require('./runtime/ticket-docking.cjs').install(appElectron,projectRoot);
require('./runtime/booking-window-controls.cjs').install(appElectron,projectRoot);
const successDownloads=require('./runtime/success-download.cjs').install(appElectron,projectRoot,log);
if(!isSmoke)require('./runtime/legacy-services.cjs').install(appElectron,log);
require('./runtime/portal-links.cjs').install(appElectron,projectRoot);
require('./runtime/browser-downloads.cjs').install(appElectron,projectRoot);
activity=require('./runtime/activity-log.cjs').install(appElectron,projectRoot);
for(const secret of testSecrets)activity.learn({password:secret});
const actionTrace={active:false,calls:new Map()};
const specialTrainSelection=require('./runtime/special-train-selection.cjs').install(appElectron,projectRoot);
const developmentPolicy = isDevelopment ? require('./runtime/development-policy.cjs').install(appElectron,projectRoot,log,{managedRelease,generalApiCandidate:!managedRelease&&process.argv.includes('--general-api-candidate'),trace:actionTrace,learnSecrets:value=>activity.learn(value),registerTicketExporter:handler=>successDownloads.setExporter(handler),withTicketExport:invoke=>successDownloads.withExport(invoke),observeSuccess:(...args)=>successDownloads.observe(...args),observePayment:(...args)=>activity.observePayment(...args),stopActivity:id=>activity.stop(id)}) : null;
const matrixUpdates=require('./runtime/updates.cjs').install(appElectron,projectRoot,{managedRelease,finish:code=>developmentPolicy?developmentPolicy.finishSmoke(code):electron.app.exit(code)});
const appRequire = new Proxy(vendorRequire,{apply(target,that,args){return args[0]==='electron'?appElectron:Reflect.apply(target,that,args);}});

function bootRecovered(){try {
  // The compiled bundle (src/main/compiled) is the default runtime and never loads the archived instruction definitions.
  // --interpreter-runtime selects the archived instruction interpreter (src/main/generated + runtime/engine.cjs) as a
  // migration switch; --compiled-runtime is still accepted and is the default.
  const compiledRuntime = !process.argv.includes('--interpreter-runtime');
  const definitions = compiledRuntime ? null : require('./generated/index.cjs');
  log('definitions-loaded',{functions:compiledRuntime ? Object.keys(require('./compiled/meta.cjs')).length : Object.keys(definitions).length,compiledRuntime});
  const matrixServices=require('./runtime/matrix-services.cjs').create({log});
  require('./runtime/matrix-services.cjs').install(appElectron,projectRoot,matrixServices);
  if(!isSmoke)void matrixServices.refresh();
  const legacyServices=require('./runtime/legacy-services.cjs').hooks(log);
  const functionOverrides = {...(isDevelopment ? require('./runtime/development.cjs').developmentOverrides(log) : {}),...legacyServices.overrides};
  const functionFactories=require('./runtime/reconstructed-payment.cjs').reconstructedPayment({development:isDevelopment,managedRelease,enabled:process.argv.includes('--reconstructed-payment')});
  Object.assign(functionFactories,require('./runtime/web-booking-upgrades.cjs').webBookingUpgrades({dependencies:{onResponse:require('./runtime/api-diagnostics.cjs').create(projectRoot)}}));
  if(Object.keys(functionFactories).length)log('matrix-reconstructed-payment',{functions:Object.keys(functionFactories)});
  log('development-mode', {enabled:isDevelopment, overrides:Object.keys(functionOverrides)});
  const privateOptions=process.argv.includes('--private-access-probe')||process.argv.includes('--private-flow-probe')?{onCreated:session=>require(path.join(projectRoot,'test/private-access-probe.cjs')).run(session,projectRoot,code=>developmentPolicy.finishSmoke(code))}:{};
  const functionInterceptors={...legacyServices.interceptors,...require('./runtime/general-api-candidate.cjs').interceptors(),...require('./runtime/private-browser.cjs').privateBrowser(log,privateOptions),...require('./runtime/login-performance.cjs').loginPerformance(log),...require('./runtime/booking-timing.cjs').bookingTiming(),...require('./runtime/qr-delivery.cjs').qrDelivery(appElectron,projectRoot,log)};
  Object.assign(functionInterceptors,require('./runtime/payment-timing.cjs').paymentTiming(log));
  Object.assign(functionInterceptors,require('./runtime/warmup-timing.cjs').warmupTiming(log));
  Object.assign(functionInterceptors,require('./runtime/csrf-timing.cjs').csrfTiming(log));
  Object.assign(functionInterceptors,specialTrainSelection.interceptors);
  Object.assign(functionInterceptors,require('./runtime/trial-access.cjs').hooks());
  for(const [id,hook]of Object.entries(require('./runtime/booking-report.cjs').hooks())){
    const previous=functionInterceptors[id];
    functionInterceptors[id]=(original,args,actor)=>hook((...next)=>previous?previous(original,next,actor):original(...next),args,actor);
  }
  const engineOptions = {functionOverrides,functionInterceptors,functionFactories,onInvoke:(id,args,captured)=>{
    if(id==='f3740'&&process.argv.includes('--isolated-live-test'))log('e2e-qr-publisher',{keys:Object.keys(args[0]||{}),imageBase64Length:args[0]?.imageBase64?.length||0,payloadLength:typeof args[0]?.payload==='string'?args[0].payload.length:0});
    if(actionTrace.active)actionTrace.calls.set(id,(actionTrace.calls.get(id)||0)+1);
    if(id==='f3720') {
      activity.recovered(args);
    }
    if(id==='f3720'&&process.argv.includes('--live-booking-test')) {
      (globalThis.__matrixE2eStages??=[]).push({at:new Date().toISOString(),stage:String(args[0]||'')});
      if(String(args[0])==='booking:qr'&&/Scan.*QR/i.test(String(args[1]||'')))globalThis.__matrixActualQrAt=performance.now();
      log('matrix-live-raw-stage',{stage:String(args[0]||''),message:String(args[1]||'').slice(0,600)});
      if(/Browser Check-Up reached the QR page/.test(String(args[1]||''))) {
        globalThis.__matrixWarmupQrReady=true;
        globalThis.__matrixWarmupQrAt=performance.now();
      }
    }
    if(process.argv.includes('--live-booking-test')||process.argv.includes('--live-login-test')) {
      const page=args.find(value=>value&&typeof value.url==='function'&&typeof value.screenshot==='function'&&typeof value.evaluate==='function');
      if(page)globalThis.__matrixDiagnosticPage=page;
    }
  }};
  const engine = compiledRuntime ? createCompiledRuntime(engineOptions) : createEngine(definitions, engineOptions);
  const wrapper = engine.makeFunction('f0')();
  const appModule = {exports:{},filename:__filename,id:__filename,paths:[path.join(projectRoot,'vendor/node_modules')]};
  wrapper.call(appModule.exports,appModule.exports,appRequire,appModule,__filename,__dirname);
  module.exports = appModule.exports;
  log('main-module-initialized');
  if(process.argv.includes('--booking-window-check'))void require(path.join(projectRoot,'test/booking-window-qa.cjs')).run(electron,projectRoot).then(()=>developmentPolicy.finishSmoke(0)).catch(error=>{log('booking-window-qa-error',{error:String(error.message)});developmentPolicy.finishSmoke(1);});
} catch(error) {
  log('main-module-error',errorDetails(error));
  console.error(error.stack || error);
  if(isSmoke&&developmentPolicy)developmentPolicy.finishSmoke(1);else electron.app.exit(1);
}}
const startMatrix=()=>{if(managedRelease)require('./runtime/activation.cjs').requireActivation(appElectron,projectRoot,{shutdown:()=>developmentPolicy.finishSmoke(0)}).then(bootRecovered).catch(error=>log('matrix-activation-start-error',{error:String(error.message)}));else bootRecovered();};
if(managedRelease&&!isSmoke&&!process.argv.includes('--release-activation-test'))appElectron.app.whenReady().then(async()=>{if(!await matrixUpdates.applyOnStartup())startMatrix();});else startMatrix();
if(managedRelease&&process.argv.includes('--release-activation-test'))setTimeout(()=>require(path.join(projectRoot,'test/release-activation-runner.cjs')).run(electron,projectRoot,code=>{if(code||!process.argv.includes('--live-booking-test'))developmentPolicy.finishSmoke(code);}),1000);

if (isSmoke) {
  if(process.argv.includes('--smoke-activity')) {
    setTimeout(()=>activity.stage('weblogin:diagnostic','Synthetic wait test — no real login','diagnostic'),25000);
    setTimeout(()=>activity.stage('weblogin:done','Synthetic log test complete','diagnostic'),31000);
  }
  const durationArg=process.argv.find(arg=>arg.startsWith('--smoke-duration='));
  const duration=durationArg?Number(durationArg.split('=')[1]):18000;
  if(!Number.isFinite(duration)||duration<18000||duration>300000)throw new Error('Smoke duration must be 18000..300000 milliseconds');
  let screenResult,screenError;
  if(process.argv.includes('--smoke-screens'))setTimeout(async()=>{
    try {
      const controller=electron.BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().endsWith('/controller.html'));
      if(!controller)throw new Error('Controller unavailable for screen test');
      const actions=require(path.join(projectRoot,'test/offline-screens.cjs'));
      screenResult=await controller.webContents.executeJavaScript('('+actions.toString()+')()');
      log('screen-actions-complete',{actions:screenResult.actions});
    } catch(error){screenError=errorDetails(error);log('screen-actions-error',screenError);}
  },20000);
  setTimeout(async()=>{
    try {
      let windows = electron.BrowserWindow.getAllWindows();
      const report = {windows:[],nativeBytecodeLoaded:false,developmentMode:isDevelopment,durationMs:duration,policy:developmentPolicy?.stats};
      if(process.argv.includes('--smoke-panel'))report.panel=await require(path.join(projectRoot,'test/packaged-panel.cjs')).run(electron,projectRoot);
      if(process.argv.includes('--smoke-login')) {
        const diagnosticWindow=windows.find(win=>win.webContents.getURL().endsWith('/controller.html'));
        const diagnostic=require(path.join(projectRoot,'test/offline-login.cjs'));
        report.loginDiagnostic=await Promise.race([
          diagnosticWindow.webContents.executeJavaScript('('+diagnostic.toString()+')()'),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('Login diagnostic timed out')),8000)),
        ]);
      }
      if(process.argv.includes('--smoke-screens')) {
        if(screenError||!screenResult)throw new Error('Screen actions did not complete: '+JSON.stringify(screenError));
        report.screenActions=screenResult;
      }
      if(process.argv.includes('--smoke-storage')) {
        const testWindow=windows.find(win=>win.webContents.getURL().endsWith('/form.html'));
        if(!testWindow)throw new Error('Form window unavailable for storage test');
        const storage=require(path.join(projectRoot,'test/offline-storage.cjs'));
        report.storage=await Promise.race([
          testWindow.webContents.executeJavaScript('('+storage.toString()+')()'),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('Storage diagnostic timed out')),8000)),
        ]);
        windows=electron.BrowserWindow.getAllWindows();
      }
      for(const win of windows) {
        const info={url:win.webContents.getURL(),title:win.getTitle(),destroyed:win.isDestroyed()};
        const deadline=promise=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Renderer diagnostic timed out')),4000))]);
        try {info.dom=await deadline(win.webContents.executeJavaScript('({ready:document.readyState,text:document.body?.innerText?.slice(0,1200),elements:document.querySelectorAll("*").length,apiAvailable:typeof window.api,font:getComputedStyle(document.body).fontFamily,background:getComputedStyle(document.body).backgroundColor,brandTheme:!!document.querySelector("link[href*=matrix-theme]"),licensePromptVisible:!!document.getElementById("licOverlay")&&!document.getElementById("licOverlay").classList.contains("hidden")})'));}
        catch(error){info.domError=String(error.message);}
        if(process.argv.includes('--smoke-activity')&&info.url.split('?')[0].endsWith('/logs.html')) {
          info.activity=await win.webContents.executeJavaScript('window.matrixLogs.snapshot().then(rows=>({rows:rows.length,heartbeats:rows.filter(row=>row.kind==="heartbeat"&&row.runId==="diagnostic").length,redacted:!rows.some(row=>row.message.includes("synthetic-secret"))}))');
        }
        try {
          const image=await deadline(win.webContents.capturePage());
          const file=path.join(diagnostics,`window-${report.windows.length+1}.png`);
          fs.writeFileSync(file,image.toPNG()); info.screenshot=file;
        } catch(error) { info.captureError=String(error.message); }
        report.windows.push(info);
      }
      if(isDevelopment&&windows.some(win=>win.webContents.getURL().includes('/security-error.html')))throw new Error('Security Check returned during the development stability test');
      if(report.windows.some(win=>win.dom?.licensePromptVisible))throw new Error('Vendor license prompt is visible in the local workspace');
      fs.writeFileSync(path.join(diagnostics,'smoke-result.json'),JSON.stringify(report,null,2));
      log('smoke-complete',{windows:report.windows.length});
      if(developmentPolicy)developmentPolicy.finishSmoke(windows.length ? 0 : 2);else electron.app.exit(windows.length ? 0 : 2);
    } catch(error) {log('smoke-error',errorDetails(error));if(developmentPolicy)developmentPolicy.finishSmoke(1);else electron.app.exit(1);}
  },duration);
}
if((process.argv.includes('--live-login-test')||process.argv.includes('--live-booking-test'))&&!isSmoke) {
  setTimeout(async()=>{
    await require(path.join(projectRoot,'test/live-login-runner.cjs')).run(electron,projectRoot,log);
    if(process.argv.includes('--isolated-live-test'))developmentPolicy.finishSmoke(0);
  },12000);
}
if(process.argv.includes('--brand-check')&&!isSmoke) {
  setTimeout(()=>require(path.join(projectRoot,'test/brand-profile-check.cjs')).run(electron,projectRoot,log),12000);
}
if(process.argv.includes('--ui-diagnostic')&&!isSmoke) {
  setTimeout(()=>require(path.join(projectRoot,'test/ui-diagnostic.cjs')).run(electron,projectRoot,log),25000);
}
if(process.argv.includes('--dev-check')) {
  setTimeout(async () => {
    try {
      const res = await require(path.join(projectRoot,'test/developer-mode-check.cjs')).run(electron,projectRoot,log);
      log('developer-mode-check-done', { success: res.success });
      if (process.argv.includes('--exit-after-check')) electron.app.exit(res.success ? 0 : 1);
    } catch(err) {
      log('developer-mode-check-error', { error: String(err.message) });
      if (process.argv.includes('--exit-after-check')) electron.app.exit(1);
    }
  }, 12000);
}
if(process.argv.includes('--pair-check')) {
  setTimeout(async () => {
    try {
      await require(path.join(projectRoot,'test/live-pair-debug.cjs'))(electron,projectRoot,log);
    } catch(err) {
      log('pair-check-error', { error: String(err.message) });
      process.exit(1);
    }
  }, 5000);
}

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const electron = require('electron');
const {createEngine} = require('./runtime/engine.cjs');
const {createCompiledRuntime} = require('./runtime/compiled-runtime.cjs');

const projectRoot = path.resolve(__dirname, '../..');
require('./runtime/matrix-brand.cjs').install(electron,projectRoot);
const vendorRequire = createRequire(path.join(projectRoot, 'vendor', 'package.json'));
const isSmoke = process.argv.includes('--smoke-test');
const managedRelease=!isSmoke&&(process.argv.includes('--release')||!process.argv.includes('--development'));
// This reconstructed project always uses its key-free source-build policy.
const isDevelopment = true;
const diagnostics = path.join(projectRoot, 'diagnostics');
fs.mkdirSync(diagnostics, {recursive:true});
const startup=require('./runtime/startup-support.cjs');
let activity=null;
const testSecrets=startup.loadTestSecrets(diagnostics);
const log=startup.createStartupLog({diagnostics,secrets:()=>testSecrets,activity:()=>activity});
process.on('uncaughtExceptionMonitor',error=>log('matrix-uncaught-error',{error:String(error?.stack||error)}));
if (isDevelopment && !isSmoke) require('./runtime/development-windows.cjs').installDevelopmentWindows({electron,projectRoot,diagnostics,managedRelease,log});
const Module=require('node:module');
startup.installNativeBytecodeGuard(Module,log);
const errorDetails = startup.errorDetails;
process.on('uncaughtException',error=>{log('uncaughtException',errorDetails(error));if(isSmoke)electron.app.exit(1);});
process.on('unhandledRejection',error=>log('unhandledRejection',errorDetails(error)));

globalThis.__esmImport = startup.createEsmImport(vendorRequire,specifier=>import(specifier));

const baseElectron = isSmoke ? require('./runtime/offline-smoke.cjs').install(electron,projectRoot,log) : electron;
const appElectron=require('./runtime/window-readiness.cjs').install(baseElectron,projectRoot,log);
require('./runtime/ticket-docking.cjs').install(appElectron,projectRoot);
if(!isSmoke)require('./runtime/legacy-services.cjs').install(appElectron,log);
require('./runtime/portal-links.cjs').install(appElectron,projectRoot);
activity=require('./runtime/activity-log.cjs').install(appElectron,projectRoot);
for(const secret of testSecrets)activity.learn({password:secret});
const actionTrace={active:false,calls:new Map()};
const developmentPolicy = isDevelopment ? require('./runtime/development-policy.cjs').install(appElectron,projectRoot,log,{managedRelease,generalApiCandidate:!managedRelease&&process.argv.includes('--general-api-candidate'),trace:actionTrace,learnSecrets:value=>activity.learn(value),observePayment:(...args)=>activity.observePayment(...args),stopActivity:id=>activity.stop(id)}) : null;
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
  if(Object.keys(functionFactories).length)log('matrix-reconstructed-payment',{functions:Object.keys(functionFactories)});
  log('development-mode', {enabled:isDevelopment, overrides:Object.keys(functionOverrides)});
  const privateOptions=process.argv.includes('--private-access-probe')||process.argv.includes('--private-flow-probe')?{onCreated:session=>require(path.join(projectRoot,'test/private-access-probe.cjs')).run(session,projectRoot,code=>developmentPolicy.finishSmoke(code))}:{};
  const functionInterceptors={...legacyServices.interceptors,...require('./runtime/general-api-candidate.cjs').interceptors(),...require('./runtime/private-browser.cjs').privateBrowser(log,privateOptions),...require('./runtime/login-performance.cjs').loginPerformance(log),...require('./runtime/booking-timing.cjs').bookingTiming(),...require('./runtime/qr-delivery.cjs').qrDelivery(appElectron,projectRoot,log)};
  Object.assign(functionInterceptors,require('./runtime/payment-timing.cjs').paymentTiming(log));
  const engineOptions = {functionOverrides,functionInterceptors,functionFactories,onInvoke:require('./runtime/invoke-observer.cjs').createInvokeObserver({log,activity,actionTrace})};
  const engine = compiledRuntime ? createCompiledRuntime(engineOptions) : createEngine(definitions, engineOptions);
  const wrapper = engine.makeFunction('f0')();
  const appModule = {exports:{},filename:__filename,id:__filename,paths:[path.join(projectRoot,'vendor/node_modules')]};
  wrapper.call(appModule.exports,appModule.exports,appRequire,appModule,__filename,__dirname);
  module.exports = appModule.exports;
  log('main-module-initialized');
} catch(error) {
  log('main-module-error',errorDetails(error));
  console.error(error.stack || error);
  if(isSmoke&&developmentPolicy)developmentPolicy.finishSmoke(1);else electron.app.exit(1);
}}
const startMatrix=()=>{if(managedRelease)require('./runtime/activation.cjs').requireActivation(appElectron,projectRoot,{shutdown:()=>developmentPolicy.finishSmoke(0)}).then(bootRecovered).catch(error=>log('matrix-activation-start-error',{error:String(error.message)}));else bootRecovered();};
if(managedRelease&&!isSmoke&&!process.argv.includes('--release-activation-test'))appElectron.app.whenReady().then(async()=>{if(!await matrixUpdates.applyOnStartup())startMatrix();});else startMatrix();
if(managedRelease&&process.argv.includes('--release-activation-test'))setTimeout(()=>require(path.join(projectRoot,'test/release-activation-runner.cjs')).run(electron,projectRoot,code=>{if(code||!process.argv.includes('--live-booking-test'))developmentPolicy.finishSmoke(code);}),1000);

if (isSmoke) require('./runtime/smoke-run.cjs').scheduleSmoke({electron,projectRoot,diagnostics,isDevelopment,log,errorDetails,activity,developmentPolicy});
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

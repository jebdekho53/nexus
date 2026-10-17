'use strict';
// Legacy snapshot: the onInvoke callback of src/main/index.cjs before it moved to runtime/invoke-observer.ts.
module.exports=function createInvokeObserver({log,activity,actionTrace}){
  return (id,args,captured)=>{
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
  
  };
};

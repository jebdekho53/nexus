'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {differential}=require('./helpers/legacy-diff.cjs');
const legacyCreate=require('./fixtures/legacy/invoke-observer.legacy.cjs');
const migrated=require('../src/main/runtime/invoke-observer.cjs');
const legacy={createInvokeObserver:legacyCreate};

// src/ts/main/runtime/invoke-observer.ts versus the onInvoke callback of index.cjs it replaced.
const check=differential(legacy,migrated);
const KEYS=['__matrixE2eStages','__matrixActualQrAt','__matrixWarmupQrReady','__matrixWarmupQrAt','__matrixDiagnosticPage'];
const pageLike={url(){},screenshot(){},evaluate(){}};
test('observer per flag set and invocation',async()=>{
  const flagSets=[[],['--isolated-live-test'],['--live-booking-test'],['--live-login-test'],['--live-booking-test','--live-login-test'],['--isolated-live-test','--live-booking-test']];
  const invocations=[
    ['f1',[]],['f3740',[{imageBase64:'abc',payload:'p'}]],['f3740',[{payload:'xyz!'}]],['f3740',[{payload:5}]],['f3740',[null]],['f3740',[]],['f3720',['booking:qr','Scan the QR code to pay']],['f3720',['booking:qr','nothing']],['f3720',['booking:done',undefined]],
    ['f3720',['ui:step','Browser Check-Up reached the QR page now']],['f3720',[undefined,null]],['f3720',['x'.repeat(5),'y'.repeat(700)]],['f2',[1,pageLike]],['f2',[{url(){},screenshot(){}}]],['f2',[null,0,'s',{}]],['f3',[{url:1,screenshot:2,evaluate:3}]],
  ];
  for(const flags of flagSets)for(const active of[false,true])
    await check(JSON.stringify([flags,active]),(m,trace)=>{
      const argv=process.argv;process.argv=[...argv.slice(0,2),...flags];
      const saved=Object.fromEntries(KEYS.map(k=>[k,globalThis[k]]));
      for(const k of KEYS)delete globalThis[k];
      try{
        const actionTrace={active,calls:new Map([['f1',2]])};
        const observe=m.createInvokeObserver({log:(...a)=>trace.push(['log',...a]),activity:{recovered:args=>trace.push(['recovered',args.map(String)])},actionTrace});
        const results=invocations.map(([id,args])=>[observe(id,args,'captured'),KEYS.map(k=>globalThis[k]===undefined?'-':typeof globalThis[k])]);
        const snapshot={...Object.fromEntries(KEYS.map(k=>[k,globalThis[k]===undefined?undefined:k==='__matrixDiagnosticPage'?'page':k==='__matrixE2eStages'?globalThis[k].map(s=>s.stage):typeof globalThis[k]])),calls:[...actionTrace.calls]};
        return[results,snapshot];
      }finally{process.argv=argv;for(const k of KEYS){if(saved[k]===undefined)delete globalThis[k];else globalThis[k]=saved[k];}}
    });
});

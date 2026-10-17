'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const legacySchedule=require('./fixtures/legacy/smoke-run.legacy.cjs');
const migrated=require('../src/main/runtime/smoke-run.cjs');
const legacy={scheduleSmoke:legacySchedule};

// src/ts/main/runtime/smoke-run.ts versus the isSmoke block of index.cjs it replaced. Timers are faked and driven by hand;
// windows, diagnostics and the project root are synthetic; the report, exit code and log order are compared.
const check=differential(legacy,migrated);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('exports',()=>assert.deepEqual(Object.keys(migrated).filter(k=>k!=='__esModule'),['scheduleSmoke']));

async function scenario(module,trace,o) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'smoke-run-'));
  const diagnostics=path.join(root,'diagnostics');fs.mkdirSync(diagnostics,{recursive:true});fs.mkdirSync(path.join(root,'test'));
  fs.writeFileSync(path.join(root,'test/offline-screens.cjs'),"module.exports=function(){return {actions:3};};");
  fs.writeFileSync(path.join(root,'test/offline-login.cjs'),"module.exports=function(){return {login:'ok'};};");
  fs.writeFileSync(path.join(root,'test/offline-storage.cjs'),"module.exports=function(){return {storage:'ok'};};");
  fs.writeFileSync(path.join(root,'test/packaged-panel.cjs'),"module.exports={run:async()=>({panel:'ok'})};");
  const argv=process.argv,realSetTimeout=globalThis.setTimeout;
  const timers=[];
  globalThis.setTimeout=(fn,ms)=>{timers.push({fn,ms,fired:false});return timers.length;};
  process.argv=[...argv.slice(0,2),'--smoke-test',...(o.args||[])];
  const clean=x=>JSON.parse(JSON.stringify(x===undefined?null:x,(k,v)=>typeof v==='string'?v.split(root).join('<root>'):v));
  const exits=[];
  try{
    const windowOf=(w,i)=>({
      webContents:{
        getURL:()=>w.url,
        executeJavaScript:code=>{trace.push(['js',i,code.slice(0,40)]);if(w.hang)return new Promise(()=>{});if(w.rejects)return Promise.reject(new Error('js failed'));
          if(code.startsWith('(({')||code.startsWith('({ready'))return Promise.resolve({ready:'complete',licensePromptVisible:!!w.licensePrompt});
          if(code.includes('matrixLogs'))return Promise.resolve({rows:4});
          return Promise.resolve({actions:3,from:code.slice(0,20)});},
        capturePage:()=>{if(w.captureHang)return new Promise(()=>{});return w.captureRejects?Promise.reject(new Error('capture failed')):Promise.resolve({toPNG:()=>Buffer.from('png'+i)});},
      },
      getTitle:()=>w.title||'T'+i,isDestroyed:()=>!!w.destroyed,
    });
    const windows=(o.windows||[]).map(windowOf);
    const electron={BrowserWindow:{getAllWindows:()=>{trace.push('getAllWindows');return windows;}},app:{exit:code=>exits.push(['app.exit',code])}};
    const policy=o.noPolicy?null:{stats:{checked:1},finishSmoke:code=>exits.push(['finishSmoke',code])};
    const log=(...a)=>trace.push(['log',...a.map(clean)]);
    const activity={stage:(...a)=>trace.push(['stage',...a])};
    let error;
    try{module.scheduleSmoke({electron,projectRoot:root,diagnostics,isDevelopment:o.dev!==false,isSmoke:true,log,errorDetails:e=>({message:String(e&&e.message)}),activity,developmentPolicy:policy});}
    catch(e){error=e.message;}
    // fire timers in delay order; after each, nudge pending deadline timers (4000/8000) so hung diagnostics time out
    const fired=[];
    for(let round=0;round<4;round++){
      const pending=timers.filter(t=>!t.fired&&t.ms>=18000||!t.fired&&(t.ms===20000||t.ms===25000||t.ms===31000)).sort((a,b)=>a.ms-b.ms);
      for(const t of pending){
        t.fired=true;fired.push(t.ms);t.fn();
        for(let i=0;i<6;i++){await tick();for(const inner of timers.filter(x=>!x.fired&&(x.ms===4000||x.ms===8000)&&o.fireDeadlines!==false)){inner.fired=true;inner.fn();}}
      }
      if(!pending.length)break;
    }
    await tick();await tick();
    const resultFile=path.join(diagnostics,'smoke-result.json');
    const shots=fs.readdirSync(diagnostics).filter(f=>f.endsWith('.png')).sort();
    return clean({error,fired,exits,report:fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile,'utf8')):null,shots,shotBytes:shots.map(f=>fs.readFileSync(path.join(diagnostics,f),'utf8'))});
  }finally{globalThis.setTimeout=realSetTimeout;process.argv=argv;fs.rmSync(root,{recursive:true,force:true});}
}
const win=(url,o={})=>({url,...o});
const scenarios={
  baseline:{windows:[win('file:///app/controller.html')]},
  noWindows:{windows:[]},noWindowsNoPolicy:{windows:[],noPolicy:true},noPolicyOk:{windows:[win('file:///a/controller.html')],noPolicy:true},
  durationOk:{args:['--smoke-duration=30000'],windows:[win('file:///a/controller.html')]},durationShort:{args:['--smoke-duration=1000']},durationLong:{args:['--smoke-duration=999999']},durationNaN:{args:['--smoke-duration=abc']},durationEmpty:{args:['--smoke-duration=']},
  twoWindows:{windows:[win('file:///a/controller.html'),win('file:///a/form.html?id=1'),win('file:///a/logs.html?x=1',{title:'Logs'})]},
  domFails:{windows:[win('file:///a/controller.html',{rejects:true})]},domHangs:{windows:[win('file:///a/controller.html',{hang:true})]},captureFails:{windows:[win('file:///a/controller.html',{captureRejects:true})]},captureHangs:{windows:[win('file:///a/controller.html',{captureHang:true})]},
  destroyed:{windows:[win('file:///a/controller.html',{destroyed:true})]},
  securityError:{windows:[win('file:///a/security-error.html?detail=x')]},securityErrorNoDev:{dev:false,windows:[win('file:///a/security-error.html')]},
  licensePrompt:{windows:[win('file:///a/controller.html',{licensePrompt:true})]},
  activity:{args:['--smoke-activity'],windows:[win('file:///a/logs.html'),win('file:///a/controller.html')]},
  panel:{args:['--smoke-panel'],windows:[win('file:///a/controller.html')]},
  login:{args:['--smoke-login'],windows:[win('file:///a/controller.html')]},loginNoController:{args:['--smoke-login'],windows:[win('file:///a/form.html')]},loginHangs:{args:['--smoke-login'],windows:[win('file:///a/controller.html',{hang:true})]},
  screens:{args:['--smoke-screens'],windows:[win('file:///a/controller.html')]},screensNoController:{args:['--smoke-screens'],windows:[win('file:///a/form.html')]},screensRejects:{args:['--smoke-screens'],windows:[win('file:///a/controller.html',{rejects:true})]},
  storage:{args:['--smoke-storage'],windows:[win('file:///a/form.html'),win('file:///a/controller.html')]},storageNoForm:{args:['--smoke-storage'],windows:[win('file:///a/controller.html')]},storageHangs:{args:['--smoke-storage'],windows:[win('file:///a/form.html',{hang:true})]},
  everything:{args:['--smoke-activity','--smoke-panel','--smoke-login','--smoke-screens','--smoke-storage','--smoke-duration=20000'],windows:[win('file:///a/controller.html'),win('file:///a/form.html'),win('file:///a/logs.html')]},
};
for(const[name,o]of Object.entries(scenarios))
  test('smoke run: '+name,async()=>{
    const outcome=await check(name,(m,trace)=>scenario(m,trace,o));
    assert.ok(outcome.outcome.value!==undefined||outcome.outcome.error===undefined,name);
  });

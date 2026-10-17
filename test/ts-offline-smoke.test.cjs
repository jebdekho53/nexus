'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),https=require('node:https'),net=require('node:net'),child_process=require('node:child_process');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const legacy=require('./fixtures/legacy/offline-smoke.legacy.cjs');
const migrated=require('../src/main/runtime/offline-smoke.cjs');

// src/ts/main/runtime/offline-smoke.ts versus the previous JavaScript. The harness patches process-wide modules, so every
// scenario snapshots and restores them; no real network or process is touched.
const check=differential(legacy,migrated);
const CHILD=['spawn','exec','execFile','spawnSync','execSync','execFileSync','fork'];
function snapshot() {
  return{http:{request:http.request,get:http.get},https:{request:https.request,get:https.get},connect:net.Socket.prototype.connect,fetch:globalThis.fetch,child:Object.fromEntries(CHILD.map(n=>[n,child_process[n]]))};
}
function restore(s) {
  http.request=s.http.request;http.get=s.http.get;https.request=s.https.request;https.get=s.https.get;net.Socket.prototype.connect=s.connect;globalThis.fetch=s.fetch;
  for(const n of CHILD)child_process[n]=s.child[n];
}
const settled=promise=>promise.then(v=>['ok',v],e=>['err',e.code+':'+e.message]);

test('exports',()=>sameExports(legacy,migrated));
for(const withNet of[false,true])
  test('offline smoke harness: network, processes and windows are blocked (electron.net '+withNet+')',async()=>{
    await check('install',async(m,trace)=>{
      const saved=snapshot();
      const root=fs.mkdtempSync(path.join(os.tmpdir(),'smoke-'));
      fs.mkdirSync(path.join(root,'diagnostics'),{recursive:true});
      try{
        const created=[];
        class Native{constructor(options){this.id=created.length+1;this.options=options;this.handlers={};this.webContents={on:(event,l)=>{(this.handlers[event]??=[]).push(l);}};created.push(this);}getTitle(){return'T'+this.id;}show(){trace.push('NATIVE SHOW');}}
        const originalShow=Native.prototype.show;
        const paths=[];let beforeRequest,ready;
        const electron={
          app:{setPath:(name,value)=>paths.push([name,path.relative(root,String(value))]),commandLine:{appendSwitch:s=>trace.push(['switch',s])},whenReady:()=>new Promise(resolve=>{ready=resolve;})},
          dialog:{showErrorBox:()=>trace.push('NATIVE DIALOG')},BrowserWindow:Native,other:'kept',
          session:{defaultSession:{webRequest:{onBeforeRequest:l=>{beforeRequest=l;}}}},
        };
        if(withNet)electron.net={request:()=>'native request'};
        const clean=x=>JSON.parse(JSON.stringify(x,(k,v)=>typeof v==='string'?v.split(root).join('<root>'):v));
        const log=(...a)=>trace.push(['log',...a.map(clean)]);
        const wrapped=m.install(electron,root,log);
        electron.app.setPath('userData','/elsewhere');electron.app.setPath('temp','/tmp/x');
        new wrapped.BrowserWindow({width:5,webPreferences:{preload:'p'}});
        new wrapped.BrowserWindow();
        const first=created[0];
        first.handlers['did-fail-load'][0]({},-3,'ERR');first.handlers['render-process-gone'][0]({},{reason:'crashed'});
        first.handlers['console-message'][0]({},1,'quiet');first.handlers['console-message'][0]({},2,'loud');
        first.handlers.paint[0]({},{},{toPNG:()=>Buffer.from('png')});first.handlers.paint[0]({},{},null);first.handlers.paint[0]({},{},{});
        const painted=fs.existsSync(path.join(root,'diagnostics','paint-1.png'))?fs.readFileSync(path.join(root,'diagnostics','paint-1.png'),'utf8'):null;
        Native.prototype.show.call({getTitle:()=>'Title'});
        electron.dialog.showErrorBox('t','c');
        const results=[];
        const req=http.request('http://example.invalid/');req.on('error',e=>results.push(['http',e.code]));req.end();
        const got=https.get('https://example.invalid/');got.on('error',e=>results.push(['https.get',e.code]));
        const socket=new net.Socket();socket.on('error',e=>results.push(['socket',e.code]));socket.connect(80,'127.0.0.1');
        results.push(await settled(globalThis.fetch('https://example.invalid/')));
        for(const name of CHILD){try{child_process[name]('x');results.push([name,'ran']);}catch(e){results.push([name,e.message]);}}
        if(withNet)results.push(['electron.net',typeof electron.net.request,typeof electron.net.request().setHeader]);
        await new Promise(resolve=>setTimeout(resolve,10));
        ready();await new Promise(resolve=>setTimeout(resolve,5));
        const cancelled=[];
        for(const url of['https://x.test','http://x.test','wss://x.test','ws://x.test','file:///a','devtools://x','HTTP://upper'])beforeRequest({url},response=>cancelled.push([url,response.cancel]));
        return clean({
          paths,created:created.map(w=>({options:w.options})),painted,results:results.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),cancelled,
          other:wrapped.other,wrappedWindow:wrapped.BrowserWindow!==Native,nativeShowReplaced:Native.prototype.show!==originalShow,
        });
      }finally{restore(saved);fs.rmSync(root,{recursive:true,force:true});}
    });
  });

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const net=require('node:net');
const http=require('node:http');
const {install,localPages}=require('../src/main/runtime/development-policy.cjs');

test('Nexus permits network, browser processes and original live handlers while vendor prompts stay disabled',async()=>{
  let accepted=0;
  const server=http.createServer((_req,res)=>{accepted++;res.end('network-ok');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const nativeSpawn=require('node:child_process').spawn;
  const nativeConnect=net.Socket.prototype.connect;
  const nativeFetch=globalThis.fetch;
  const app=new EventEmitter(),exits=[],handlers=new Map(),windows=[];
  Object.assign(app,{exit:code=>exits.push(code),quit:()=>exits.push(0),relaunch:()=>{},whenReady:()=>Promise.resolve(),commandLine:{appendSwitch(){}}});
  class Window extends EventEmitter {
    constructor(opts={}) {
      super();this.title=opts.title;this.url='';this.visible=false;this.destroyed=false;windows.push(this);
      this.webContents={getURL:()=>this.url};app.emit('browser-window-created',{},this);
    }
    static getAllWindows(){return windows;}
    isDestroyed(){return this.destroyed;}
    destroy(){this.destroyed=true;}
    close(){this.destroyed=true;}
    async loadFile(file,options){this.url='file:///'+file.replaceAll('\\','/')+(options?.query?'?'+new URLSearchParams(options.query):'');}
    show(){this.visible=true;}
    focus(){}
  }
  const session={webRequest:{onBeforeRequest(...args){this.listener=args.at(-1);}},fetch:globalThis.fetch};
  const electron={app,BrowserWindow:Window,ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler)},
    net:{request:http.request,fetch:globalThis.fetch},shell:{openExternal:async()=>{},openPath:async()=>''},session:{defaultSession:session},
    autoUpdater:{checkForUpdates(){},quitAndInstall(){}}};
  const fakeProcess={exit(){},abort(){},kill(){},reallyExit(){},crash(){},dlopen(){return 'local-sqlite';}};
  const events=[];
  let policy;
  try {
    policy=install(electron,'C:/local-project',(event,details)=>events.push({event,...details}),{processObject:fakeProcess});
    await Promise.resolve();
    app.exit(1);app.quit();app.relaunch();
    assert.deepEqual(exits,[]);
    assert.equal(require('node:child_process').spawn,nativeSpawn);
    assert.equal(net.Socket.prototype.connect,nativeConnect);
    assert.equal(globalThis.fetch,nativeFetch);
    const response=await fetch('http://127.0.0.1:'+server.address().port);
    assert.equal(await response.text(),'network-ok');assert.equal(accepted,1);
    assert.equal(require('node:child_process').execFileSync(process.execPath,['-e','process.stdout.write("browser-process-allowed")'],{encoding:'utf8'}),'browser-process-allowed');
    const controller=new Window({title:'Controller'});await controller.loadFile('C:/local-project/src/renderer/controller.html');
    controller.destroy();controller.close();assert.equal(controller.destroyed,false);
    let closePrevented=false;controller.emit('close',{preventDefault(){closePrevented=true;}});
    assert.equal(closePrevented,true);
    let originalInvoked=0;
    electron.ipcMain.handle('app:controller-action',(_event,action)=>{originalInvoked++;return {ok:true,action};});
    for(const action of Object.keys(localPages)) {
      assert.equal((await handlers.get('app:controller-action')({sender:controller.webContents},action)).action,action);
    }
    assert.equal(originalInvoked,9);
    for(const channel of ['app:get-box-license-info','app:validate-license-key','app:activate-license']) {
      electron.ipcMain.handle(channel,()=>{throw new Error('Vendor license handler must not run locally');});
    }
    for(const channel of ['app:open-form-window','app:open-booking-box']) {
      electron.ipcMain.handle(channel,(_event,id)=>({ok:true,id,original:true}));
      const result=await handlers.get(channel)({sender:controller.webContents},'local-form');
      assert.equal(result.original,true);assert.equal(result.id,'local-form');
    }
    const info=await handlers.get('app:get-box-license-info')({sender:controller.webContents},'local-form');
    assert.equal(info.data.gateEnabled,false);assert.equal(info.data.licensed,false);
    assert.equal((await handlers.get('app:activate-license')({sender:controller.webContents},'unused')).localOnly,true);
    for(const channel of ['app:login','app:start-booking']) {
      let entered=false;
      electron.ipcMain.handle(channel,()=>{entered=true;return {ok:false,error:'genuine-provider-response'};});
      const result=await handlers.get(channel)({sender:controller.webContents},{credentials:{username:'synthetic'}});
      assert.equal(entered,true);assert.equal(result.error,'genuine-provider-response');
      assert.equal(result.code,undefined);
    }
    electron.ipcMain.handle('app:confirm-quit',()=>{});
    assert.equal((await handlers.get('app:confirm-quit')({sender:controller.webContents})).ok,false);
    await handlers.get('app:confirm-quit')({sender:{getURL:()=> 'file:///C:/local-project/src/renderer/confirm-quit.html'}});
    assert.deepEqual(exits,[0],'explicit user confirmation can exit');
    assert.ok(events.some(x=>x.event==='nexus-runtime-installed'&&x.network==='enabled'));
  } finally {
    policy?.restore();
    await new Promise(resolve=>server.close(resolve));
  }
});

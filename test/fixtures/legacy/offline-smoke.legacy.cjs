'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {EventEmitter}=require('node:events');

function install(electron,root,log) {
  const profile=path.join(root,'diagnostics','smoke-profile');
  fs.mkdirSync(profile,{recursive:true});
  electron.app.setPath('userData',profile);
  const setPath=electron.app.setPath.bind(electron.app);
  electron.app.setPath=(name,value)=>setPath(name,name==='userData'?profile:value);
  const deniedError=()=>Object.assign(new Error('Network disabled during source recovery smoke test'),{code:'ENETUNREACH'});
  function request() {
    const req=new EventEmitter();
    req.setHeader=()=>req;req.getHeader=()=>undefined;req.removeHeader=()=>req;
    req.setTimeout=()=>req;req.write=()=>true;req.abort=()=>{};req.destroy=()=>{};
    req.end=()=>{process.nextTick(()=>req.emit('error',deniedError()));return req;};
    return req;
  }
  for(const name of ['node:http','node:https']) {
    const module=require(name);module.request=request;module.get=(...args)=>request(...args).end();
  }
  const net=require('node:net');
  net.Socket.prototype.connect=function(){process.nextTick(()=>this.emit('error',deniedError()));return this;};
  globalThis.fetch=async()=>{throw deniedError();};
  if(electron.net)electron.net.request=request;
  const child=require('node:child_process');
  for(const name of ['spawn','exec','execFile','spawnSync','execSync','execFileSync','fork'])child[name]=()=>{throw new Error('Child processes disabled during source recovery smoke test');};
  electron.dialog.showErrorBox=(title,content)=>log('dialog',{title,content});
  const NativeWindow=electron.BrowserWindow;
  const HiddenWindow=new Proxy(NativeWindow,{construct(target,args){
    const original=args[0]||{};
    const win=Reflect.construct(target,[{...original,show:false,webPreferences:{...(original.webPreferences||{}),offscreen:true,backgroundThrottling:false}}]);
    win.webContents.on('did-fail-load',(_event,code,description)=>log('renderer-load-error',{code,description}));
    win.webContents.on('render-process-gone',(_event,details)=>log('renderer-process-gone',details));
    win.webContents.on('console-message',(_event,level,message)=>{if(level>=2)log('renderer-console',{level,message});});
    win.webContents.on('paint',(_event,_rect,image)=>{
      if(image&&typeof image.toPNG==='function')fs.writeFileSync(path.join(root,'diagnostics',`paint-${win.id}.png`),image.toPNG());
    });
    return win;
  }});
  const show=NativeWindow.prototype.show;
  NativeWindow.prototype.show=function(){log('window-show-suppressed',{title:this.getTitle()});};
  electron.app.commandLine.appendSwitch('disable-gpu');
  electron.app.whenReady().then(()=>{
    electron.session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:|^wss?:/.test(details.url)}));
  });
  log('offline-smoke-installed',{profile});
  return new Proxy(electron,{get(target,key){return key==='BrowserWindow'?HiddenWindow:Reflect.get(target,key);}});
}

module.exports={install};

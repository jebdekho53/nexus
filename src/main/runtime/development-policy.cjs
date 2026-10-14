'use strict';
const path=require('node:path');

const localPages=Object.freeze({
  'new-form':['form.html','New Form'], 'open-form':['open-form.html','Open Form'],
  'login-data':['login-data.html','Login Data'], proxy:['proxy.html','Proxy'],
  payment:['payment.html','Payment'], history:['history.html','Tickets'],
  tools:['tools.html','Tools'], updates:['updates.html','Updates'], logs:['logs.html','Live Logs'],
});

function install(electron,root,log=()=>{},options={}) {
  const bookNow=require('./book-now.cjs').createBookNow(log);
  const undo=[],stats={shutdownBlocked:0,localScreensOpened:0};
  const nativeExit=electron.app.exit.bind(electron.app);
  const nativeRelaunch=electron.app.relaunch.bind(electron.app);
  const restartArgs=[root,options.managedRelease?'--release':'--development'];
  let userShutdown=false;
  function patch(target,key,value) {
    const old=target[key];target[key]=value;undo.push(()=>{target[key]=old;});
  }
  function denied(_kind,details={}) {
    stats.shutdownBlocked++;log('matrix-automatic-shutdown-prevented',details);
  }
  for(const name of ['exit','quit','relaunch'])patch(electron.app,name,(...args)=>{
    if(userShutdown){if(name==='relaunch')return nativeRelaunch({args:restartArgs});return nativeExit(args[0]||0);}
    denied('shutdown',{api:'app.'+name});
  });
  const protectWindow=win=>{
    win.on('close',event=>{
      if(!userShutdown&&win.webContents.getURL().split('?')[0].endsWith('/controller.html')) {
        event.preventDefault();denied('shutdown',{api:'controller.close-event'});
      }
    });
    for(const name of ['destroy','close']) {
      const native=win[name].bind(win);
      patch(win,name,(...args)=>{
        if(!userShutdown&&win.webContents.getURL().split('?')[0].endsWith('/controller.html')) {
          denied('shutdown',{api:'controller.'+name});return;
        }
        return native(...args);
      });
    }
  };
  electron.app.on('browser-window-created',(_event,win)=>protectWindow(win));
  const nativeHandle=electron.ipcMain.handle.bind(electron.ipcMain);
  patch(electron.ipcMain,'handle',(channel,handler)=>nativeHandle(channel,async(event,...args)=>{
    for(const value of args)options.learnSecrets?.(value);
    if(/app:(controller-action|login|start-booking|stop-run|save-form)/.test(channel))log('action-start',{page:channel+(channel==='app:controller-action'?' '+String(args[0]):'')});
    if(channel==='app:get-box-license-info')return {ok:true,data:{gateEnabled:false,licensed:false,fingerprint:'',localOnly:true}};
    if(channel==='app:validate-license-key'||channel==='app:activate-license') {
      return {ok:false,error:'Matrix source build does not require or activate vendor license keys',localOnly:true};
    }
    if(channel==='app:confirm-quit'||channel==='app:restart') {
      if(!event.sender.getURL().split('?')[0].endsWith('/confirm-quit.html'))return {ok:false,error:'Use the local Quit confirmation window'};
      userShutdown=true;log('development-user-shutdown',{channel});
      if(channel==='app:restart')nativeRelaunch({args:restartArgs});
      nativeExit(0);return {ok:true};
    }
    try {
      args=bookNow.prepare(channel,args);
      if(channel==='app:start-booking')options.observePayment?.(channel,args);
      if(channel==='app:stop-run'||channel==='app:logout')options.stopActivity?.(typeof args[0]==='string'?args[0]:args[0]?.formId);
      if(channel==='app:login'&&options.trace){options.trace.active=true;options.trace.calls=new Map();}
      const result=await Reflect.apply(handler,undefined,[event,...args]);
      bookNow.observe(channel,args,result);
      if(channel!=='app:start-booking')options.observePayment?.(channel,args,result);
      if(result?.ok===false&&(channel==='app:login'||channel==='app:start-booking'))options.stopActivity?.(args[0]?.formId);
      if(result?.ok===false)log('development-ipc-error',{channel,error:String(result.error||'Unknown error').slice(0,400)});
      return result;
    } catch(error){log('development-ipc-error',{channel,error:String(error.message).slice(0,400)});throw error;}
    finally{if(channel==='app:login'&&options.trace){options.trace.active=false;log('matrix-login-function-trace',{calls:Object.fromEntries(options.trace.calls)});}}
  }));
  log('matrix-runtime-installed',{network:'enabled',childProcesses:'enabled',nativeClients:'enabled',vendorLicenseGate:false});
  return {stats,finishSmoke:code=>nativeExit(code),restore:()=>{for(const restore of undo.reverse())restore();}};
}
module.exports={install,localPages};

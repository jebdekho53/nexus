'use strict';
// Legacy snapshot: the development profile/window-diagnostics block of src/main/index.cjs before it moved to
// runtime/development-windows.ts.
const fs=require('node:fs');
const path=require('node:path');
module.exports=function installDevelopmentWindows({electron,projectRoot,diagnostics,managedRelease,log,isDevelopment,isSmoke}){
if (isDevelopment && !isSmoke) {
  const profile=process.argv.includes('--release-activation-test')?path.join(diagnostics,'release-qa-profile'):process.argv.includes('--isolated-live-test')?path.join(diagnostics,'live-e2e-profile'):managedRelease?require('../../../src/main/runtime/profile.cjs').releaseProfile(electron.app,projectRoot):path.join(diagnostics,'development-profile');
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
};

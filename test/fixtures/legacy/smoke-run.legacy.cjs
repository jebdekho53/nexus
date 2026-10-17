'use strict';
// Legacy snapshot: the isSmoke block of src/main/index.cjs before it moved to runtime/smoke-run.ts.
const fs=require('node:fs');
const path=require('node:path');
module.exports=function scheduleSmoke({electron,projectRoot,diagnostics,isDevelopment,isSmoke,log,errorDetails,activity,developmentPolicy}){
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
};

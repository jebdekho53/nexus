'use strict';
const fs=require('node:fs'),path=require('node:path');
async function run(electron,root,finish){
 const file=path.join(root,'diagnostics','release-activation-report.json'),report={paymentSubmitted:false};
 try{
  const deadline=Date.now()+90000;let activation;
  while(Date.now()<deadline){activation=electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/activation.html'));if(activation&&!activation.webContents.isLoading())break;await new Promise(r=>setTimeout(r,500));}
  if(!activation)throw Error('Activation screen was not opened');
  report.blockedBeforeActivation=!electron.BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().endsWith('/controller.html'));
  const key=JSON.parse(fs.readFileSync(path.join(root,'diagnostics','deployment-test-key.json'))).key;
  const result=await activation.webContents.executeJavaScript('window.matrixActivation.activate('+JSON.stringify(key)+')');report.activation={ok:result.ok,error:result.error};
  if(!result.ok)throw Error('Own-server activation rejected');
  while(Date.now()<deadline){const controller=electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/controller.html'));if(controller&&!controller.webContents.isLoading()){report.controllerReady=true;break;}await new Promise(r=>setTimeout(r,500));}
  if(!report.controllerReady)throw Error('Activated release did not initialize');
  report.ok=report.blockedBeforeActivation&&report.controllerReady;
 }catch(error){report.ok=false;report.error=String(error.message);}
 fs.writeFileSync(file,JSON.stringify(report,null,2));finish(report.ok?0:1);
}
module.exports={run};

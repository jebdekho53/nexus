'use strict';
const path=require('node:path'),{fileURLToPath}=require('node:url');
function install(electron,root){
 electron.ipcMain.handle('matrix:booking:minimize',event=>{
  try{
   const url=new URL(event.sender.getURL());
   if(url.protocol!=='file:'||path.resolve(fileURLToPath(url))!==path.join(root,'src/renderer/booking-box.html'))return{ok:false};
   const win=electron.BrowserWindow.fromWebContents(event.sender);if(!win||win.isDestroyed())return{ok:false};
   win.setMinimizable?.(true);win.setSkipTaskbar?.(false);win.minimize();return{ok:true};
  }catch{return{ok:false};}
 });
}
module.exports={install};

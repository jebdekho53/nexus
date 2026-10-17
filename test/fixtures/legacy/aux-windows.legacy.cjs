'use strict';
const path=require('node:path'),{fileURLToPath}=require('node:url');
const auxiliary=new Set(['form.html','open-form.html','login-data.html','proxy.html','payment.html','history.html','tools.html','updates.html','logs.html']);
function localPage(win,root){
 try{const url=new URL(win.webContents.getURL());if(url.protocol!=='file:')return null;const file=path.resolve(fileURLToPath(url));return path.dirname(file)===path.join(root,'src/renderer')?path.basename(file):null;}catch{return null;}
}
function closeAuxWindows(electron,root,event,log=()=>{}){
 const caller=electron.BrowserWindow.fromWebContents(event.sender);
 if(!caller||!localPage(caller,root))return {ok:false,error:'Use a local Matrix window'};
 let closed=0;
 for(const win of electron.BrowserWindow.getAllWindows()){
  if(win===caller||win.isDestroyed()||!auxiliary.has(localPage(win,root)))continue;
  win.close();closed++;
 }
 log('matrix-aux-windows-closed',{closed,pairWindowsPreserved:true});
 return {ok:true};
}
module.exports={closeAuxWindows};

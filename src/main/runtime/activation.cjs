'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
async function requireActivation(electron,root,options={}){
 await electron.app.whenReady();
 const base='https://matrix.vaidya-gpt.com',file=path.join(electron.app.getPath('userData'),'matrix-activation.bin'),deviceFile=path.join(electron.app.getPath('userData'),'matrix-device');
 if(!fs.existsSync(deviceFile))fs.writeFileSync(deviceFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 const device=fs.readFileSync(deviceFile,'utf8').trim();let key='',license=null,message='Enter a key issued by your Matrix administrator or seller.';
 try{if(fs.existsSync(file))key=electron.safeStorage.decryptString(fs.readFileSync(file));}catch{}
 async function verify(value,activate){
  const response=await fetch(base+'/api/license/'+(activate?'activate':'verify'),{method:'POST',headers:{'Content-Type':'application/json','x-matrix-client':'desktop'},body:JSON.stringify({key:value,device,clientVersion:require('../../../package.json').version}),signal:AbortSignal.timeout(10000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Activation rejected');return data.license;
 }
 if(key)try{license=await verify(key,false);}catch(error){message=String(error.message);}
 const originalHandle=electron.ipcMain.handle.bind(electron.ipcMain);
 electron.ipcMain.handle=(channel,handler)=>originalHandle(channel,async(event,...args)=>{
  if(['app:login','app:start-booking'].includes(channel)&&(!license||Date.parse(license.expiresAt)<=Date.now()))return {ok:false,error:'Matrix activation required. Open the activation window to renew your key.'};
  return handler(event,...args);
 });
 let win,booted=false;
 const open=()=>{
  if(win&&!win.isDestroyed()){win.show();return;}
  win=new electron.BrowserWindow({width:540,height:460,webPreferences:{preload:path.join(root,'src/preload/activation.cjs'),contextIsolation:true,nodeIntegration:false}});
  win.on?.('closed',()=>{if(!license&&!booted)options.shutdown?.();});
  win.loadFile(path.join(root,'src/renderer/activation.html'));
 };
 let finish;const ready=new Promise(resolve=>{finish=resolve;});
 const trusted=event=>event.sender.getURL()===pathToFileURL(path.join(root,'src/renderer/activation.html')).href;
 originalHandle('matrix:activation:state',event=>trusted(event)?{ok:true,active:!!license,message}: {ok:false});
 originalHandle('matrix:activation:activate',async(event,value)=>{
  if(!trusted(event))return {ok:false,error:'Use the activation window'};
  if(typeof value!=='string'||value.length<6||value.length>128)return {ok:false,error:'Enter a valid Matrix key'};
  try{
   if(!electron.safeStorage.isEncryptionAvailable())throw Error('Secure key storage is unavailable');
   const accepted=await verify(value,true);fs.writeFileSync(file,electron.safeStorage.encryptString(value),{mode:0o600});key=value;license=accepted;
   setTimeout(()=>{if(win&&!win.isDestroyed())win.close();finish();},300);return {ok:true,expiresAt:license.expiresAt};
  }catch(error){return {ok:false,error:String(error.message)};}
 });
 for(const role of ['admin','seller'])originalHandle('matrix:activation:'+role,event=>trusted(event)?electron.shell.openExternal(base+'/'+role):undefined);
 setInterval(async()=>{if(!key)return;try{license=await verify(key,false);}catch(error){license=null;message=String(error.message);open();}},300000).unref();
 await electron.app.whenReady();if(!license){open();await ready;}booted=true;
}
module.exports={requireActivation};

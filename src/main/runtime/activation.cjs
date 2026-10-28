'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');

function getCandidateDirs(electron,root){
 const dirs=new Set();
 try{const p=electron.app.getPath('userData');if(p)dirs.add(path.resolve(p));}catch{}
 try{const p=electron.app.getPath('appData');if(p){dirs.add(path.resolve(p,'Matrix'));dirs.add(path.resolve(p,'Matrix','profiles','release'));}}catch{}
 if(process.env.APPDATA){
  dirs.add(path.resolve(process.env.APPDATA,'Matrix'));
  dirs.add(path.resolve(process.env.APPDATA,'Matrix','profiles','release'));
 }
 if(process.env.LOCALAPPDATA)dirs.add(path.resolve(process.env.LOCALAPPDATA,'Matrix'));
 if(root){
  dirs.add(path.resolve(root,'diagnostics','development-profile'));
  dirs.add(path.resolve(root,'diagnostics','release-profile'));
 }
 return[...dirs];
}

async function requireActivation(electron,root,options={}){
 await electron.app.whenReady();
 const base='https://matrix.vaidya-gpt.com';
 const trial=require('./trial-access.cjs').create(electron,root);
 const bookingReporter=require('./booking-report.cjs').create(electron);
 const candidateDirs=options.storageDirs?options.storageDirs.map(dir=>path.resolve(dir)):getCandidateDirs(electron,root);

 let device='';
 for(const dir of candidateDirs){
  try{
   const df=path.join(dir,'matrix-device');
   if(fs.existsSync(df)){
    const val=fs.readFileSync(df,'utf8').trim();
    if(/^[a-f0-9]{64}$/i.test(val)){device=val;break;}
   }
  }catch{}
 }
 if(!device){
  try{
   if(process.platform==='win32'){
    const out=require('node:child_process').execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',{windowsHide:true,stdio:['ignore','pipe','ignore'],timeout:2000}).toString('utf8');
    const m=out.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i);
    if(m&&m[1])device=crypto.createHash('sha256').update('matrix-hw-'+m[1].trim()).digest('hex');
   }
  }catch{}
 }
 if(!device)device=crypto.randomBytes(32).toString('hex');

 for(const dir of candidateDirs){
  try{
   fs.mkdirSync(dir,{recursive:true});
   const df=path.join(dir,'matrix-device');
   if(!fs.existsSync(df)||fs.readFileSync(df,'utf8').trim()!==device){
    fs.writeFileSync(df,device,{mode:0o600});
   }
  }catch{}
 }

 let key='',license=null,message='Enter a key issued by your Matrix administrator or seller.';
 for(const dir of candidateDirs){
  try{
   const kf=path.join(dir,'matrix-activation.bin');
   if(fs.existsSync(kf)){
    const dec=electron.safeStorage.decryptString(fs.readFileSync(kf));
    if(dec&&typeof dec==='string'&&dec.length>=6){key=dec;break;}
   }
  }catch{}
 }

 const saveKeyAcrossAll=(val)=>{
  try{
   const enc=electron.safeStorage.encryptString(val);
   for(const dir of candidateDirs){
    try{
     fs.mkdirSync(dir,{recursive:true});
     fs.writeFileSync(path.join(dir,'matrix-activation.bin'),enc,{mode:0o600});
     fs.writeFileSync(path.join(dir,'matrix-device'),device,{mode:0o600});
    }catch{}
   }
  }catch{}
 };

 let hardwareIdentity;
 async function verify(value,activate){
  hardwareIdentity??=require('./trial-device.cjs').collect();
  const response=await fetch(base+'/api/license/'+(activate?'activate':'verify'),{method:'POST',headers:{'Content-Type':'application/json','x-matrix-client':'desktop'},body:JSON.stringify({key:value,device,clientVersion:require('../../../package.json').version,identity:hardwareIdentity}),signal:AbortSignal.timeout(10000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Activation rejected');bookingReporter.setSession(data.bookingToken);return data.license;
 }
 if(key){
  try{license=await verify(key,false);}
  catch(error){
   if(/device is not activated/i.test(error.message)){
    try{license=await verify(key,true);}
    catch(rebindErr){message=String(rebindErr.message);}
   }else{
    message=String(error.message);
   }
  }
  if(license){saveKeyAcrossAll(key);trial.disable();}
 }
 if(!license){try{await trial.verify();}catch{}}
 const originalHandle=electron.ipcMain.handle.bind(electron.ipcMain);
 require('./trial-access.cjs').installStateHandler(electron,root);
 electron.ipcMain.handle=(channel,handler)=>originalHandle(channel,async(event,...args)=>{
  if(['app:login','app:start-booking'].includes(channel)&&(!license||Date.parse(license.expiresAt)<=Date.now())){
   try{if(channel==='app:start-booking')return await trial.run(()=>handler(event,...args));await trial.verify();}
   catch(error){return{ok:false,error:String(error.message)};}
  }
  return handler(event,...args);
 });
 let win,booted=false;
 const open=()=>{
  if(win&&!win.isDestroyed()){win.show();return;}
  win=new electron.BrowserWindow({width:540,height:740,minHeight:520,webPreferences:{preload:path.join(root,'src/preload/activation.cjs'),contextIsolation:true,nodeIntegration:false}});
  win.on?.('closed',()=>{if(!license&&!trial.active&&!booted)options.shutdown?.();});
  win.loadFile(path.join(root,'src/renderer/activation.html'));
 };
 let finish;const ready=new Promise(resolve=>{finish=resolve;});
 const trusted=event=>event.sender.getURL()===pathToFileURL(path.join(root,'src/renderer/activation.html')).href;
 originalHandle('matrix:activation:state',event=>trusted(event)?{ok:true,active:!!license||trial.active,message,trial:trial.summary}: {ok:false});
 originalHandle('matrix:activation:trial',async event=>{
  if(!trusted(event))return{ok:false,error:'Use the activation window'};
  try{await trial.start();if(win&&!win.isDestroyed())win.close();finish();return{ok:true,trial:trial.summary};}
  catch(error){return{ok:false,error:String(error.message)};}
 });
 originalHandle('matrix:activation:activate',async(event,value)=>{
  if(!trusted(event))return {ok:false,error:'Use the activation window'};
  if(typeof value!=='string'||value.length<6||value.length>128)return {ok:false,error:'Enter a valid Matrix key'};
  try{
   if(!electron.safeStorage.isEncryptionAvailable())throw Error('Secure key storage is unavailable');
   const accepted=await verify(value,true);
   saveKeyAcrossAll(value);
   key=value;license=accepted;trial.disable();
   setTimeout(()=>{if(win&&!win.isDestroyed())win.close();finish();},300);return {ok:true,expiresAt:license.expiresAt};
  }catch(error){return {ok:false,error:String(error.message)};}
 });
 for(const role of ['admin','seller'])originalHandle('matrix:activation:'+role,event=>trusted(event)?electron.shell.openExternal(base+'/'+role):undefined);
 setInterval(async()=>{if(!key)return;try{license=await verify(key,false);}catch(error){license=null;message=String(error.message);open();}},300000).unref();
 await electron.app.whenReady();if(!license&&!trial.active){open();await ready;}booted=true;
}
module.exports={requireActivation,getCandidateDirs};

'use strict';
const fs=require('node:fs'),path=require('node:path'),{fileURLToPath}=require('node:url');
const catalog=[
 {id:'chrome',name:'Google Chrome',referenceVersion:'156.0.8078.48',packageId:'Google.Chrome',url:'https://www.google.com/chrome/',kind:'Exact version via Windows App Installer'},
 {id:'edge',name:'Microsoft Edge',referenceVersion:'156.0.4314.42',packageId:'Microsoft.Edge',url:'https://www.microsoft.com/edge/download',kind:'Exact version via Windows App Installer'},
 {id:'brave',name:'Brave',referenceVersion:'156.1.98.60',targetVersion:'1.98.60',packageVersion:'156.1.98.60',packageId:'Brave.Brave',url:'https://brave.com/download/',kind:'Exact version via Windows App Installer'},
 {id:'chromium',name:'Chromium',referenceVersion:'158.0.8122.0',url:'https://www.chromium.org/getting-involved/download-chromium/',kind:'Official downloads; choose the required build'},
 {id:'matrix',name:'Matrix Browser (ShardX engine)',referenceVersion:'156.0.8078.48',url:null,kind:'Local package prepared; Windows side-by-side launch issue must be fixed before distribution'},
];
function install(electron,root){
 const installer=require('./matrix-browser-installer.cjs').create();
 const versions=require('./browser-version-manager.cjs'),manager=versions.create();
 let versionCache=null,cacheAt=0,pendingScan;
 const packageFile=path.resolve(root,'..','matrix-browser-build','Matrix-Browser-156.0.8078.48-win-x64.zip');
 const scan=async()=>{if(versionCache&&Date.now()-cacheAt<30000)return versionCache;if(!pendingScan)pendingScan=Promise.all(catalog.map(async item=>{try{return[item.id,await manager.detect(item)];}catch{return[item.id,null];}})).then(values=>{cacheAt=Date.now();return versionCache=Object.fromEntries(values);}).finally(()=>{pendingScan=null;});return pendingScan;};
 const items=async()=>{const detected=await scan(),ready=await installer.ready();return catalog.map(item=>{const targetVersion=item.targetVersion||item.referenceVersion,installedVersion=detected[item.id],action=versions.actionFor(installedVersion,targetVersion);return item.id==='matrix'?{...item,targetVersion,installedVersion,action:ready?'Ready':action==='Ready'?'Repair':action,url:installer.metadata.url,automatic:true,ready,installState:installer.state,kind:ready?'Installed and verified':installer.state.phase==='error'?installer.state.error:'Verified automatic installation'}:{...item,targetVersion,installedVersion,action,automatic:!!item.packageId,ready:action==='Ready',installState:manager.states.get(item.id),kind:manager.states.get(item.id)?.error||item.kind};});};
 const trusted=e=>{try{const u=new URL(e.sender.getURL());return u.protocol==='file:'&&path.resolve(fileURLToPath(u))===path.join(root,'src/renderer/tools.html');}catch{return false;}};
 electron.ipcMain.handle('matrix:browsers:catalog',e=>trusted(e)?items():[]);
 electron.ipcMain.handle('matrix:browsers:open',async(e,id)=>{if(!trusted(e))return{ok:false};const item=(await items()).find(b=>b.id===id);if(!item?.url)return{ok:false};if(item.ready)return{ok:true,alreadyInstalled:true};if(item.automatic){const result=await(item.id==='matrix'?installer.install():manager.install(item));versionCache=null;return result;}await electron.shell.openExternal(item.url);return{ok:true,manual:true};});
 electron.ipcMain.handle('matrix:browsers:copy',async(e,id)=>{if(!trusted(e))return{ok:false};const item=(await items()).find(b=>b.id===id);if(!item?.url)return{ok:false};electron.clipboard.writeText(item.url);return{ok:true};});
}
module.exports={install,catalog};

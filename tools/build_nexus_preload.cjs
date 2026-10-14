const fs=require('node:fs'),path=require('node:path');
const root=path.dirname(__dirname);
const original=fs.readFileSync(path.join(root,'src/preload/index.js'),'utf8');
fs.writeFileSync(path.join(root,'src/preload/nexus.js'),original+`\n;(()=>{const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('nexusLogs',{
 snapshot:()=>ipcRenderer.invoke('nexus:logs:snapshot'),clear:()=>ipcRenderer.invoke('nexus:logs:clear'),
 subscribe:callback=>{const listener=(_event,row)=>callback(row);ipcRenderer.on('nexus:logs:event',listener);return ()=>ipcRenderer.removeListener('nexus:logs:event',listener);}
});contextBridge.exposeInMainWorld('nexusPortal',{open:role=>ipcRenderer.invoke('nexus:portal:open',role)});})();\n`);

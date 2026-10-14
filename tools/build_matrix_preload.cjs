const fs=require('node:fs'),path=require('node:path');
const root=path.dirname(__dirname);
const original=fs.readFileSync(path.join(root,'src/preload/index.js'),'utf8');
fs.writeFileSync(path.join(root,'src/preload/matrix.js'),original+`\n;(()=>{const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('matrixLogs',{
 snapshot:()=>ipcRenderer.invoke('matrix:logs:snapshot'),clear:()=>ipcRenderer.invoke('matrix:logs:clear'),
 subscribe:callback=>{const listener=(_event,row)=>callback(row);ipcRenderer.on('matrix:logs:event',listener);return ()=>ipcRenderer.removeListener('matrix:logs:event',listener);}
});contextBridge.exposeInMainWorld('matrixBookingTiming',{subscribe:callback=>{const listener=(_event,row)=>callback(row);ipcRenderer.on('matrix:booking:timing',listener);return ()=>ipcRenderer.removeListener('matrix:booking:timing',listener);}});contextBridge.exposeInMainWorld('matrixPortal',{open:role=>ipcRenderer.invoke('matrix:portal:open',role)});})();\n`);

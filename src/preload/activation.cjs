const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('nexusActivation',{state:()=>ipcRenderer.invoke('nexus:activation:state'),activate:key=>ipcRenderer.invoke('nexus:activation:activate',key),admin:()=>ipcRenderer.invoke('nexus:activation:admin'),seller:()=>ipcRenderer.invoke('nexus:activation:seller')});

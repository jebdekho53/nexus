'use strict';
const fs=require('node:fs'),path=require('node:path');

function getHostChromiumCandidates(){
  const local=process.env.LOCALAPPDATA||'';
  const prog=process.env.ProgramFiles||'C:/Program Files';
  const prog86=process.env['ProgramFiles(x86)']||'C:/Program Files (x86)';
  return [
    path.join(prog,'Google/Chrome/Application/chrome.exe'),
    path.join(prog86,'Google/Chrome/Application/chrome.exe'),
    path.join(local,'Google/Chrome/Application/chrome.exe'),
    path.join(local,'BraveSoftware/Brave-Browser/Application/brave.exe'),
    path.join(prog,'BraveSoftware/Brave-Browser/Application/brave.exe'),
    path.join(prog86,'BraveSoftware/Brave-Browser/Application/brave.exe'),
    path.join(prog86,'Microsoft/Edge/Application/msedge.exe'),
    path.join(prog,'Microsoft/Edge/Application/msedge.exe'),
    path.join(local,'Microsoft/Edge/Application/msedge.exe')
  ];
}

function chromiumEngine(){
 const envPath=process.env.FINGERPRINT_CHROMIUM_PATH;
 if(envPath&&fs.existsSync(envPath))return envPath;
 const local=process.env.LOCALAPPDATA||'';
 const prog=process.env.ProgramFiles||'C:/Program Files';
 const prog86=process.env['ProgramFiles(x86)']||'C:/Program Files (x86)';
 const candidates=[
   path.join(local,'Chromium','Application','chrome.exe'),
   path.join(local,'Chromium','chrome-win','chrome.exe'),
   path.join(prog,'Chromium','Application','chrome.exe'),
   path.join(prog86,'Chromium','Application','chrome.exe'),
   path.join(local,'Programs','Chromium','Application','chrome.exe')
 ];
 const cache=path.join(local,'ms-playwright');
 try{for(const name of fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1])))candidates.push(path.join(cache,name,'chrome-win64','chrome.exe'),path.join(cache,name,'chrome-win','chrome.exe'));}catch{}
 return candidates.find(file=>fs.existsSync(file));
}

function anyChromiumEngine(){
 const dedicated=chromiumEngine();
 if(dedicated)return dedicated;
 return getHostChromiumCandidates().find(file=>fs.existsSync(file));
}

function matrixEngine(){
 const local=process.env.LOCALAPPDATA||'';
 const prog=process.env.ProgramFiles||'C:/Program Files';
 const prog86=process.env['ProgramFiles(x86)']||'C:/Program Files (x86)';
 const list=[
   ...(fs.existsSync(path.join(local,'Matrix/Browser/runtime-ready.json'))?['Matrix/Browser/ShardX-Windows/chrome.exe']:[]),
   'shardx-sdk/ShardX-Windows/chrome.exe',
   'brahmos-engine/ShardX-Windows/chrome.exe',
   'Brahmos/Application/brahmos.exe',
   'Matrix/Application/brahmos.exe',
   'Matrix/Application/chrome.exe',
   'Programs/Matrix/Application/brahmos.exe',
   'Programs/Brahmos/Application/brahmos.exe'
 ].map(file=>path.join(local,file));
 list.push(
   path.join(prog,'Matrix/Application/brahmos.exe'),
   path.join(prog86,'Matrix/Application/brahmos.exe'),
   path.join(prog,'Brahmos/Application/brahmos.exe'),
   path.join(prog86,'Brahmos/Application/brahmos.exe')
 );
 return list.find(file=>fs.existsSync(file));
}

module.exports={chromiumEngine,matrixEngine,anyChromiumEngine,getHostChromiumCandidates};

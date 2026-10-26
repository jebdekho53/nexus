'use strict';
const fs=require('node:fs'),path=require('node:path'),{promisify}=require('node:util');
const execFile=promisify(require('node:child_process').execFile);
function compare(a,b){const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return Math.sign(d);}return 0;}
function actionFor(installed,target){return !installed?'Install':compare(installed,target)>0?'Downgrade':compare(installed,target)<0?'Update':'Ready';}
function executable(id){
 const engines=require('./browser-engines.cjs');
 if(id==='matrix')return engines.matrixEngine();if(id==='chromium')return engines.chromiumEngine();
 const relative={chrome:'Google/Chrome/Application/chrome.exe',edge:'Microsoft/Edge/Application/msedge.exe',brave:'BraveSoftware/Brave-Browser/Application/brave.exe','brave-beta':'BraveSoftware/Brave-Browser-Beta/Application/brave.exe'}[id];
 return relative&&[process.env.LOCALAPPDATA,process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean).map(base=>path.join(base,relative)).find(file=>fs.existsSync(file));
}
async function installedVersion(item){
 const file=executable(item.id);if(!file)return null;
 const script='$v=(Get-Item -LiteralPath '+"'"+file.replaceAll("'","''")+"'"+').VersionInfo.ProductVersion; Write-Output $v';
 const {stdout}=await execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,maxBuffer:65536});
 const matches=stdout.match(/\d+(?:\.\d+){2,3}/g)||[];
 // Brave reports its own product version, not Chrome's engine version.
 const found=matches.find(v=>item.id.startsWith('brave')&&v.startsWith('1.'))||matches[0]||null;
 return item.id.startsWith('brave')&&found?.split('.').length===4?found.split('.').slice(1).join('.'):found;
}
function create({run=execFile,detect=installedVersion}={}){
 const states=new Map();let busy=false;
 return {states,detect,async install(item){
  if(busy)return{ok:false,error:'Another browser installation is running.'};
  if(!item.packageId)return{ok:false,error:'A verified exact-version installer is not configured for this browser. Use the official download link.'};
  busy=true;states.set(item.id,{phase:'checking'});
  try{
   // Check the exact version exists before changing any installed browser.
   const args=['--id',item.packageId,'--exact','--version',item.packageVersion||item.targetVersion,'--source','winget','--accept-source-agreements','--disable-interactivity'];
   await run('winget.exe',['show',...args],{windowsHide:true,timeout:60000,maxBuffer:262144});
   states.set(item.id,{phase:'installing'});
   await run('winget.exe',['install',...args,'--force','--silent','--accept-package-agreements'],{windowsHide:true,timeout:600000,maxBuffer:262144});
   const actual=await detect(item);if(!actual||compare(actual,item.targetVersion)!==0)throw Error('Installed version does not match the tested version. Close browsers and check again.');
   states.set(item.id,{phase:'ready'});return{ok:true};
  }catch(error){const message=error.code==='ENOENT'?'Windows App Installer (winget) is unavailable.':String(error.stderr||error.stdout||error.message).slice(-1000);states.set(item.id,{phase:'error',error:message});return{ok:false,error:message};}
  finally{busy=false;}
 }};
}
module.exports={compare,actionFor,executable,installedVersion,create};

'use strict';
const base='https://matrix.vaidya-gpt.com';
const local=()=>({schema:1,provider:'Matrix',capabilities:{webLogin:true,manualCaptcha:true,automaticCaptcha:false,railOne:false}});
function create({fetchImpl=(...args)=>globalThis.fetch(...args),log=()=>{},now=Date.now}={}){
  let state={...local(),source:'local',clockOffsetMs:null};
  async function refresh(){
    try{
      const started=now();
      const response=await fetchImpl(base+'/api/desktop/status',{signal:AbortSignal.timeout(4000),redirect:'error',credentials:'omit',cache:'no-store'});
      if(!response.ok)throw new Error('Matrix service HTTP '+response.status);
      const value=await response.json(),ended=now();
      if(value.schema!==1||value.provider!=='Matrix'||value.ok!==true||!Number.isSafeInteger(value.serverTime))throw new Error('Invalid Matrix service response');
      // Server capabilities cannot enable unsupported clients or override URLs.
      state={...local(),source:'online',clockOffsetMs:value.serverTime-(started+ended)/2,roundTripMs:ended-started};
      log('matrix-services-ready',{source:state.source,roundTripMs:state.roundTripMs,manualCaptcha:true,railOne:false});
    }catch(error){state={...local(),source:'local',clockOffsetMs:null};log('matrix-services-local',{reason:String(error.message)});}
    return snapshot();
  }
  function snapshot(){return {...state,capabilities:{...state.capabilities}};}
  return {refresh,snapshot};
}
function install(electron,root,service){
  const path=require('node:path'),{fileURLToPath}=require('node:url');
  electron.ipcMain.handle('matrix:services:status',async(event,refresh)=>{
    try{const url=new URL(event.sender.getURL());if(url.protocol!=='file:'||path.resolve(fileURLToPath(url))!==path.join(root,'src/renderer/tools.html'))return {error:'Unavailable'};}catch{return {error:'Unavailable'};}
    return refresh===true?service.refresh():service.snapshot();
  });
}
module.exports={create,install};

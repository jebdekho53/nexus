'use strict';
const path=require('node:path');
const {fileURLToPath}=require('node:url');

// Keep the explicit checkbox selection time through the older form serializer.
// A saved boolean on its own must never opt an old form into shifted enquiries.
function install(electron,root,{now=Date.now}={}) {
  const selections=new Map(),known=new Map();
  const formPath=path.resolve(root,'src/renderer/form.html');
  const trusted=sender=>{try{const url=new URL(sender.getURL());return url.protocol==='file:'&&path.resolve(fileURLToPath(url))===formPath;}catch{return false;}};
  electron.ipcMain.handle('matrix:special-train-selection',(event,selected)=>{
    if(!trusted(event.sender)||typeof selected!=='boolean')return {ok:false};
    if(!selections.has(event.sender.id))event.sender.once?.('destroyed',()=>selections.delete(event.sender.id));
    selections.set(event.sender.id,{selected,at:selected?now():undefined});
    return {ok:true};
  });
  const register=electron.ipcMain.handle.bind(electron.ipcMain);
  electron.ipcMain.handle=(channel,handler)=>register(channel,channel!=='app:save-form'?handler:async(event,...args)=>{
    const selection=trusted(event.sender)&&selections.get(event.sender.id);
    if(selection&&args[0]&&typeof args[0]==='object') {
      const input=args[0];
      if(!selection.selected) {
        if(input.id)known.delete(input.id);
        if(input.journey)input.journey.specialTrain=false;
        input.specialTrain=false;
      }
      args[0]={...input,specialTrainSelectedAt:selection.at,...(input.journey?{journey:{...input.journey,specialTrainSelectedAt:selection.at}}:{})};
    }
    return handler(event,...args);
  });
  const valid=value=>Number.isSafeInteger(value)&&value>0&&value<=now()?value:undefined;
  return {interceptors:{
    f472(original,args) {
      const result=original(...args);
      if(!result?.journey)return result;
      const input=args[0]||{};
      const at=valid(input.journey?.specialTrainSelectedAt??input.specialTrainSelectedAt??known.get(result.id));
      if(result.journey.specialTrain&&at) {result.journey.specialTrainSelectedAt=at;if(result.id)known.set(result.id,at);}
      else {delete result.journey.specialTrainSelectedAt;if(result.id)known.delete(result.id);}
      return result;
    },
    f485(original,args) {
      const result=original(...args),at=valid(args[0]?.journey?.specialTrainSelectedAt??args[0]?.specialTrainSelectedAt);
      if(result&&typeof result==='object'&&at)result.specialTrainSelectedAt=at;
      return result;
    },
  }};
}
module.exports={install};

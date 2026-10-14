'use strict';
const path=require('node:path'),{fileURLToPath}=require('node:url');
function imageUrl(value){
 if(typeof value!=='string'||value.length>3000000)return null;
 const raw=value.replace(/^data:image\/[\w.+-]+;base64,/,'');
 const bytes=Buffer.from(raw,'base64');
 let mime;
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
 else if(bytes[0]===255&&bytes[1]===216)mime='image/jpeg';
 else if(/^\s*(<svg\b|<\?xml\b)/i.test(bytes.subarray(0,100).toString()))mime='image/svg+xml';
 else return null;
 return 'data:'+mime+';base64,'+raw;
}
function qrDelivery(electron,root,log=()=>{}){
 return {async f3740(original,args){
  const result=await original(...args),[payload,formId]=args,dataUrl=imageUrl(payload?.imageBase64);
  if(!dataUrl)return result;
  const targets=electron.BrowserWindow.getAllWindows().filter(win=>{
   try{const url=new URL(win.webContents.getURL());return !win.isDestroyed()&&url.protocol==='file:'&&path.resolve(fileURLToPath(url))===path.join(root,'src/renderer/booking-box.html')&&url.searchParams.get('view')!=='ticket'&&!!url.searchParams.get('id')&&(!formId||url.searchParams.get('id')===formId);}catch{return false;}
  });
  // An unnamed QR must never be routed between multiple profiles.
  if(!formId&&targets.length!==1)return result;
  for(const win of targets){
   try{
    const present=await win.webContents.executeJavaScript("(()=>{const image=document.getElementById('qrImg'),panel=document.getElementById('qrOverlay');return !!image?.naturalWidth&&!!panel&&!panel.classList.contains('hidden');})()");
    if(present)continue;
    const id=new URL(win.webContents.getURL()).searchParams.get('id');
    win.webContents.send('app:qr',{dataUrl,formId:id,caption:payload.caption,amount:payload.amount,account:payload.account,checkNow:!!payload.checkNow});
    log('nexus-qr-display-delivered',{page:'Payment QR delivered to its local booking panel'});
   }catch(error){log('nexus-qr-display-error',{error:String(error.message)});}
  }
  return result;
 }};
}
module.exports={qrDelivery,imageUrl};

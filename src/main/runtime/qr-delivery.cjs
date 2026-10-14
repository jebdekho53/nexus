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
 let popupMode=false;
 const popups=new Map(),cached=new Map();let publisher,hooks;
 const booking=id=>electron.BrowserWindow.getAllWindows().find(win=>{try{const u=new URL(win.webContents.getURL());return !win.isDestroyed()&&u.protocol==='file:'&&path.resolve(fileURLToPath(u))===path.join(root,'src/renderer/booking-box.html')&&u.searchParams.get('id')===id;}catch{return false;}});
 const place=(popup,id)=>{const parent=booking(id);if(!parent||popup.isDestroyed())return;let b=parent.getBounds();const p=popup.getBounds(),area=electron.screen.getDisplayMatching(b).workArea;
  if(b.height+8+p.height<=area.height){const y=Math.max(area.y,Math.min(b.y,area.y+area.height-b.height-8-p.height));if(y!==b.y){b={...b,y};parent.setBounds(b);}}
  const next={...p,x:Math.max(area.x,Math.min(b.x,area.x+area.width-p.width)),y:Math.max(area.y,Math.min(b.y+b.height+8,area.y+area.height-p.height))};if(next.x!==p.x||next.y!==p.y)popup.setBounds(next);};
 return hooks={
 f3734(original,args){popupMode=original(...args);return popupMode;},
 f3743(original,args){const popup=original(...args),id=args[0];if(popup&&typeof id==='string'&&!popups.has(id)){popups.set(id,popup);const parent=booking(id),follow=()=>place(popup,id);parent?.on?.('move',follow);parent?.on?.('resize',follow);popup.on?.('show',follow);popup.on?.('closed',()=>{parent?.removeListener?.('move',follow);parent?.removeListener?.('resize',follow);popups.delete(id);cached.delete(id);});}return popup;},
 f3746(original,args){const [popup,id]=args;if(popup&&typeof id==='string'&&booking(id)){place(popup,id);return;}return original(...args);},
 async f4021(original,args){const active=[...cached];const result=await original(...args);if(result?.ok){popupMode=args[1]===true;if(publisher)for(const [id,payload]of active)await hooks.f3740(publisher,[{...payload,forcePopup:popupMode},id]);}return result;},
 async f3740(original,args){
  publisher=original;if(typeof args[1]==='string'&&imageUrl(args[0]?.imageBase64))cached.set(args[1],args[0]);
  const result=await original(...args),[payload,formId]=args,dataUrl=imageUrl(payload?.imageBase64);
  if(!dataUrl)return result;
  if(popupMode||payload?.forcePopup){if(formId){booking(formId)?.webContents.send('app:qr',{closed:true,formId});const popup=popups.get(formId);if(popup)place(popup,formId);}return result;}
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
    log('matrix-qr-display-delivered',{page:'Payment QR delivered to its local booking panel'});
   }catch(error){log('matrix-qr-display-error',{error:String(error.message)});}
  }
  return result;
 }};
}
module.exports={qrDelivery,imageUrl};

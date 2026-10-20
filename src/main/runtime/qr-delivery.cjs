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
 function getStoredQrPopup(){
  try{
   const userData=electron.app?.getPath?.('userData');
   if(userData){
    const p=path.join(userData,'settings.json');
    if(require('node:fs').existsSync(p)){
     const s=JSON.parse(require('node:fs').readFileSync(p,'utf8'));
     if(typeof s?.qrPopup==='boolean')return s.qrPopup;
    }
   }
  }catch{}
  return false;
 }
 let popupMode=getStoredQrPopup();
 const popups=new Map(),cached=new Map();let publisher,hooks;
 electron.__qrPopups=popups;
 const booking=id=>{
  const all=electron.BrowserWindow.getAllWindows().filter(win=>{
   try{
    if(win.isDestroyed())return false;
    const u=new URL(win.webContents.getURL());
    return (u.pathname.includes('booking-box.html')||path.resolve(fileURLToPath(u))===path.join(root,'src/renderer/booking-box.html'))&&u.searchParams.get('view')!=='ticket';
   }catch{return false;}
  });
  if(id){
   const match=all.find(win=>{try{return new URL(win.webContents.getURL()).searchParams.get('id')===String(id);}catch{return false;}});
   if(match)return match;
  }
  if(all.length===1)return all[0];
  return all.find(w=>w.isFocused?.())||all[0]||null;
 };
 const ticketWin=id=>{
  const all=electron.BrowserWindow.getAllWindows().filter(win=>{
   try{
    if(win.isDestroyed())return false;
    const u=new URL(win.webContents.getURL());
    return (u.pathname.includes('booking-box.html')||path.resolve(fileURLToPath(u))===path.join(root,'src/renderer/booking-box.html'))&&u.searchParams.get('view')==='ticket';
   }catch{return false;}
  });
  if(id){
   const match=all.find(win=>{try{return new URL(win.webContents.getURL()).searchParams.get('id')===String(id);}catch{return false;}});
   if(match)return match;
  }
  return all[0]||null;
 };
 let placing=false;
 const place=(popup,id)=>{
  if(placing||popup.isDestroyed())return;
  const parent=booking(id);if(!parent)return;
  placing=true;
  try{
   if(id)popup.__formId=id;
   let b=parent.getBounds();const p=popup.getBounds(),area=electron.screen.getDisplayMatching(b).workArea;
   const ticket=ticketWin(id),t=ticket?.getBounds();
   const totalHeight=b.height+8+p.height+(t?8+t.height:0);
   if(totalHeight<=area.height){const y=Math.max(area.y,Math.min(b.y,area.y+area.height-totalHeight));if(y!==b.y){b={...b,y};parent.setBounds(b);}}
   const next={...p,x:Math.max(area.x,Math.min(b.x,area.x+area.width-p.width)),y:Math.max(area.y,Math.min(b.y+b.height+8,area.y+area.height-p.height))};
   const moved=(next.x!==p.x||next.y!==p.y);
   if(moved)popup.setBounds(next);
   if(moved)popup.emit('move');
  }finally{placing=false;}
 };
 return hooks={
  f3734(original,args){popupMode=original(...args);return popupMode;},
  f3735(original,args){
   const found=booking(args[0]);
   if(found)return found;
   return original(...args);
  },
  f3743(original,args){
   if(!popupMode)return null;
   const id=args[0]||args[1]||args[2];
   const fid=typeof id==='string'?id:id;
   const targetBooking=booking(fid);
   if(targetBooking){
    try{
     let b=targetBooking.getBounds();
     const area=electron.screen.getDisplayMatching(b).workArea;
     const pw=260,ph=330;
     const ticket=ticketWin(fid),t=ticket?.getBounds();
     const totalHeight=b.height+8+ph+(t?8+t.height:0);
     if(totalHeight<=area.height){const y=Math.max(area.y,Math.min(b.y,area.y+area.height-totalHeight));if(y!==b.y){b={...b,y};targetBooking.setBounds(b);}}
     const initX=Math.max(area.x,Math.min(b.x,area.x+area.width-pw));
     const initY=Math.max(area.y,Math.min(b.y+b.height+8,area.y+area.height-ph));
     if(typeof args[1]==='object'&&args[1]!==null){
      args[1].x=initX;args[1].y=initY;
     }
    }catch{}
   }
   const popup=original(...args);
   if(popup){
    if(id&&typeof id==='string')popup.__formId=id;
    const actualFid=popup.__formId||fid;
    if(actualFid)popups.set(actualFid,popup);
    const parent=booking(actualFid),follow=()=>place(popup,actualFid);
    parent?.on?.('move',follow);
    parent?.on?.('resize',follow);
    popup.on?.('show',follow);
    place(popup,actualFid);
    popup.on?.('closed',()=>{
     parent?.removeListener?.('move',follow);
     parent?.removeListener?.('resize',follow);
     if(actualFid)popups.delete(actualFid);
     cached.delete(actualFid);
    });
   }
   return popup;
  },
  f3746(original,args){
   const [popup,id]=args;
   const parent=booking(id);
   if(popup&&parent){
    if(id&&typeof id==='string')popup.__formId=id;
    place(popup,id);
    return;
   }
   return original(...args);
  },
  async f4021(original,args){
   const active=[...cached];const result=await original(...args);
   if(result?.ok){
    popupMode=args[1]===true;
    if(!popupMode){
     for(const [,p]of popups){try{if(!p.isDestroyed()){p.hide();p.close();}}catch{}}
     popups.clear();
    }
    if(publisher)for(const [id,payload]of active)await hooks.f3740(publisher,[{...payload,forcePopup:popupMode},id]);
   }
   return result;
  },
  async f3740(original,args){
   publisher=original;
   const [payload,formId]=args,dataUrl=imageUrl(payload?.imageBase64);
   if(typeof formId==='string'&&imageUrl(payload?.imageBase64))cached.set(formId,payload);
   if(!dataUrl)return original(...args);
   const allBoxes=electron.BrowserWindow.getAllWindows().filter(win=>{
    try{
     if(win.isDestroyed())return false;
     const u=new URL(win.webContents.getURL());
     return (u.pathname.includes('booking-box.html')||path.resolve(fileURLToPath(u))===path.join(root,'src/renderer/booking-box.html'))&&u.searchParams.get('view')!=='ticket'&&!!u.searchParams.get('id');
    }catch{return false;}
   });
   if(!formId&&allBoxes.length>1)return original(...args);
   const target=booking(formId);
   const fid=formId||(allBoxes.length===1?new URL(allBoxes[0].webContents.getURL()).searchParams.get('id'):null);
   if(popupMode && payload?.forcePopup !== false){
    const result=await original(...args);
    if(target)target.webContents.send('app:qr',{closed:true,formId:fid});
    const popup=(fid&&popups.get(fid))||electron.BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.getTitle?.()==='Scan to Pay');
    if(popup)place(popup,fid);
    return result;
   }
   const popup=(fid&&popups.get(fid))||electron.BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.getTitle?.()==='Scan to Pay');
   if(popup&&!popup.isDestroyed()){
    try{popup.hide();popup.close();}catch{}
    if(fid)popups.delete(fid);
   }
   const targets=electron.BrowserWindow.getAllWindows().filter(win=>{
    try{const url=new URL(win.webContents.getURL());return !win.isDestroyed()&&url.protocol==='file:'&&path.resolve(fileURLToPath(url))===path.join(root,'src/renderer/booking-box.html')&&url.searchParams.get('view')!=='ticket'&&!!url.searchParams.get('id')&&(!fid||url.searchParams.get('id')===fid);}catch{return false;}
   });
   const deliverTo=targets.length>0?targets:(target?[target]:[]);
   if(!fid&&deliverTo.length>1)return original(...args);
   for(const win of deliverTo){
    try{
     if(typeof win.webContents.executeJavaScript==='function'){
      const present=await win.webContents.executeJavaScript("(()=>{const image=document.getElementById('qrImg'),panel=document.getElementById('qrOverlay');return !!image?.naturalWidth&&!!panel&&!panel.classList.contains('hidden');})()").catch(()=>false);
      if(present)continue;
     }
     const id=new URL(win.webContents.getURL()).searchParams.get('id')||fid;
     win.webContents.send('app:qr',{dataUrl,formId:id,caption:payload?.caption,amount:payload?.amount,account:payload?.account,checkNow:!!payload?.checkNow});
     log('matrix-qr-display-delivered',{page:'Payment QR delivered to its local booking panel'});
    }catch(error){log('matrix-qr-display-error',{error:String(error.message)});}
   }
   return original(...args);
  }};
}
module.exports={qrDelivery,imageUrl};

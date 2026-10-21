'use strict';
const path=require('node:path'),{fileURLToPath}=require('node:url');
function install(electron,root){
 const route=win=>{try{const u=new URL(win.webContents.getURL());return (u.pathname.includes('booking-box.html')||path.resolve(fileURLToPath(u))===path.join(root,'src/renderer/booking-box.html'))?u:null;}catch{return null;}};
 electron.app.on('browser-window-created',(_event,ticket)=>{
  let parent,popupParent,placing=false,attached=false,popupAttached=false;
  const nativeBounds=ticket.setBounds.bind(ticket);
  const isTicket=()=>route(ticket)?.searchParams.get('view')==='ticket';
  const findPopup=(id,pb)=>{
   if(id&&electron.__qrPopups?.has(id)){
    const p=electron.__qrPopups.get(id);
    if(p&&!p.isDestroyed()&&p.isVisible!==false&&(typeof p.isVisible!=='function'||p.isVisible()))return p;
   }
   return electron.BrowserWindow.getAllWindows().find(w=>
    w!==ticket&&!w.isDestroyed()&&w.isVisible!==false&&(typeof w.isVisible!=='function'||w.isVisible())&&
    (typeof w.getTitle==='function'&&w.getTitle()==='Scan to Pay')&&
    (!id||w.__formId===id||Math.abs(w.getBounds().x-pb.x)<50)
   );
  };
  function place(){
   if(placing||ticket.isDestroyed()||!isTicket())return false;
   const id=route(ticket)?.searchParams?.get('id');
   const all=electron.BrowserWindow.getAllWindows().filter(w=>w!==ticket&&!w.isDestroyed()&&route(w)?.searchParams.get('view')!=='ticket');
   const found=(id?all.find(w=>route(w)?.searchParams.get('id')===id):null)||(all.length===1?all[0]:null)||all[0];
   if(!found)return false;
   if(found!==parent){detach();parent=found;parent.on('move',place);parent.on('resize',place);attached=true;}
   placing=true;
   try{
    let b=parent.getBounds();
    const qr=findPopup(id,b);
    if(qr!==popupParent){
     detachPopup();
     if(qr){popupParent=qr;popupParent.on('move',place);popupParent.on('resize',place);popupParent.on('closed',place);popupAttached=true;}
    }
    const t=ticket.getBounds(),p=qr?.getBounds(),area=electron.screen.getDisplayMatching(b).workArea;
    const totalHeight=b.height+8+(p?p.height+8:0)+t.height;
    if(totalHeight<=area.height){
     const y=Math.max(area.y,Math.min(b.y,area.y+area.height-totalHeight));
     if(y!==b.y){b={...b,y};parent.setBounds(b);}
    }
    const anchor=p||b;
    const x=Math.max(area.x,Math.min(b.x,area.x+area.width-t.width)),
          y=Math.max(area.y,Math.min(anchor.y+anchor.height+8,area.y+area.height-t.height));
    if(x!==t.x||y!==t.y)nativeBounds({...t,x,y});
    return true;
   }finally{placing=false;}
  }
  function detachPopup(){if(popupAttached){popupParent?.removeListener('move',place);popupParent?.removeListener('resize',place);popupParent?.removeListener('closed',place);popupParent=null;}popupAttached=false;}
  function detach(){detachPopup();if(attached){parent?.removeListener('move',place);parent?.removeListener('resize',place);parent=null;}attached=false;}
  ticket.setBounds=(bounds,...args)=>{const result=nativeBounds(bounds,...args);place();return result;};
  if(typeof ticket.setPosition==='function'){const native=ticket.setPosition.bind(ticket);ticket.setPosition=(...args)=>{const result=native(...args);place();return result;};}
  ticket.webContents.on('did-finish-load',place);ticket.on('show',place);ticket.on('resize',place);ticket.on('closed',detach);
 });
}
module.exports={install};

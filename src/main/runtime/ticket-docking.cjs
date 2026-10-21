'use strict';
const path=require('node:path'),{fileURLToPath}=require('node:url');
function install(electron,root){
 const route=win=>{try{const u=new URL(win.webContents.getURL());return (u.pathname.includes('booking-box.html')||path.resolve(fileURLToPath(u))===path.join(root,'src/renderer/booking-box.html'))?u:null;}catch{return null;}};
 const isFormEditor=win=>{try{const u=new URL(win.webContents.getURL());return (u.pathname.includes('form.html')||path.resolve(fileURLToPath(u))===path.join(root,'src/renderer/form.html'))&&!u.pathname.includes('open-form.html');}catch{return false;}};

 electron.app.on('browser-window-created',(_event,ticket)=>{
  let parent,popupParent,placing=false,attached=false,popupAttached=false,tiled=false;
  const nativeBounds=ticket.setBounds.bind(ticket);
  const isTicket=()=>route(ticket)?.searchParams.get('view')==='ticket';
  const isPair=()=>{const r=route(ticket);return r&&r.searchParams.get('view')!=='ticket';};
  const isForm=()=>isFormEditor(ticket);

  // Side-by-side layout: when multiple forms or pair windows open, place them side-by-side rather than overlapping.
  function tileSideBySide(){
   if(tiled||ticket.isDestroyed()||isTicket())return false;
   const pair=isPair(),form=isForm();
   if(!pair&&!form)return false;
   const all=electron.BrowserWindow.getAllWindows().filter(w=>w!==ticket&&!w.isDestroyed()&&w.isVisible!==false&&(typeof w.isVisible!=='function'||w.isVisible())&&(pair?route(w)?.searchParams.get('view')!=='ticket':isFormEditor(w)));
   if(!all.length)return false;
   all.sort((a,b)=>a.getBounds().x-b.getBounds().x);
   const last=all[all.length-1],bLast=last.getBounds(),area=electron.screen.getDisplayMatching(bLast).workArea;
   const cur=ticket.getBounds(),w=cur.width||(pair?380:480),h=cur.height||(pair?260:540),gap=14;
   let nextX=bLast.x+bLast.width+gap,nextY=bLast.y;
   if(nextX+w>area.x+area.width){
    const first=all[0].getBounds();
    nextX=first.x;nextY=bLast.y+bLast.height+gap;
    if(nextY+h>area.y+area.height){
     const off=(all.length*28)%140;
     nextX=area.x+20+off;nextY=area.y+30+off;
    }
   }
   tiled=true;
   ticket.__matrixTiledPos={x:nextX,y:nextY};
   nativeBounds({...cur,x:nextX,y:nextY,width:w,height:h});
   return true;
  }

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
  ticket.setBounds=(bounds,...args)=>{
   if(ticket.__matrixTiledPos&&!isTicket()){
    if(bounds&&typeof bounds.x==='number'&&bounds.x<=30&&ticket.__matrixTiledPos.x>30){
     bounds={...bounds,x:ticket.__matrixTiledPos.x,y:ticket.__matrixTiledPos.y};
    }
   }
   const result=nativeBounds(bounds,...args);place();return result;
  };
  if(typeof ticket.setPosition==='function'){
   const native=ticket.setPosition.bind(ticket);
   ticket.setPosition=(...args)=>{
    if(ticket.__matrixTiledPos&&!isTicket()&&typeof args[0]==='number'&&args[0]<=30&&ticket.__matrixTiledPos.x>30){
     args[0]=ticket.__matrixTiledPos.x;args[1]=ticket.__matrixTiledPos.y;
    }
    const result=native(...args);place();return result;
   };
  }
  ticket.webContents.on('did-finish-load',()=>{place();tileSideBySide();});
  ticket.on('show',()=>{place();tileSideBySide();});
  ticket.on('ready-to-show',()=>{place();tileSideBySide();});
  ticket.on('resize',place);
  ticket.on('closed',detach);
 });
}
module.exports={install};

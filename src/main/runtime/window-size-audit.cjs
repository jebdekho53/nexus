'use strict';
const fs=require('node:fs'),path=require('node:path');
function install(electron,root){
 if(!process.argv.includes('--measure-window-sizes'))return;
 const file=path.join(root,'diagnostics','actual-window-sizes.json'),observed=new Map(),screenshots=new Set(),libraryStyles=new WeakMap();
 const handlers=new Map(),register=electron.ipcMain.handle.bind(electron.ipcMain);
 electron.ipcMain.handle=(channel,handler)=>{handlers.set(channel,handler);return register(channel,handler);};
 let opened=false,actions=[];
 let writing=false;
 async function capture(){
  if(writing||!electron.app.isReady())return;writing=true;
  try{
   const windows=[];
   for(const win of electron.BrowserWindow.getAllWindows()){
    if(win.isDestroyed())continue;
    let page='';try{page=path.basename(new URL(win.webContents.getURL()).pathname);}catch{}
    if(['open-form.html','login-data.html'].includes(page)){
     const revision=fs.statSync(path.join(root,'src/renderer/matrix-library.css')).mtimeMs,previous=libraryStyles.get(win);libraryStyles.set(win,revision);
     if(previous&&previous!==revision){screenshots.delete(page);win.webContents.reload();continue;}
    }
    const bounds=win.getBounds(),display=electron.screen.getDisplayMatching(bounds);
    const item={id:win.id,page,title:win.getTitle(),visible:win.isVisible(),outerDip:bounds,contentDip:win.getContentBounds(),displayScale:display.scaleFactor,workAreaDip:display.workArea,zoomFactor:win.webContents.getZoomFactor()};
    try{item.renderer=await Promise.race([win.webContents.executeJavaScript(`(()=>{const main=document.querySelector('main');return{width:innerWidth,height:innerHeight,devicePixelRatio:devicePixelRatio,scrollHeight:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),main:main?{height:main.clientHeight,scrollHeight:main.scrollHeight}:null,branding:{headerLogo:(()=>{const img=document.querySelector('.topbar .brand>.matrix-header-logo');return img?{loaded:img.complete&&img.naturalWidth>0,width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height}:null})(),textPrefix:document.querySelector('.topbar .brand')?getComputedStyle(document.querySelector('.topbar .brand'),'::before').content:null,primaryButtons:[...document.querySelectorAll('.btn.primary,.btn.save,.btn.safe,.act-weblogin')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})),horizontalOverflow:document.documentElement.scrollWidth>innerWidth},browserDownloads:[...document.querySelectorAll('.browser-download-row')].map(e=>({name:e.querySelector('strong')?.textContent,buttons:[...e.querySelectorAll('button')].map(b=>({text:b.textContent,disabled:b.disabled}))})),controllerLogo:location.pathname.endsWith('/controller.html')?(()=>{const img=document.querySelector('.center .matrix-mark'),box=img?.parentElement;return img?{loaded:img.complete&&img.naturalWidth>0,width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,background:getComputedStyle(box).backgroundColor,opacity:getComputedStyle(document.querySelector('.bar')).opacity,miniWidth:document.querySelector('.mini .matrix-mark')?getComputedStyle(document.querySelector('.mini .matrix-mark')).width:null}:null})():null,logs:location.pathname.endsWith('/logs.html')?{rows:document.querySelectorAll('#logList>.nx-log').length,policyReady:typeof window.MatrixLogPolicy?.isBookingRow==='function',bridgeReady:!!window.matrixLogs,unrelatedRows:[...document.querySelectorAll('#logList>.nx-log')].filter(e=>/matrix-window-visible|app:controller-action|main-module-initialized/.test(e.textContent)).length}:null,collectionCards:[...document.querySelectorAll('#list>.card,#list>.user-row')].slice(0,4).map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,children:[...e.children].map(c=>({tag:c.tagName,class:c.className,width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height,children:[...c.children].map(n=>({tag:n.tagName,class:n.className,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))}))})),toolsCards:[...document.querySelectorAll('.tools-workspace>.card')].map(e=>({class:e.className,top:Math.round(e.getBoundingClientRect().top),bottom:Math.round(e.getBoundingClientRect().bottom)}))};})()`),new Promise((_,reject)=>setTimeout(()=>reject(Error('Renderer not ready')),1000))]);}catch{}
    if(((['tools.html','splash.html','logs.html','form.html','proxy.html','payment.html','history.html','updates.html'].includes(page)||page==='controller.html'&&item.renderer?.controllerLogo?.loaded&&Number(item.renderer.controllerLogo.opacity)>=0.99)||['open-form.html','login-data.html'].includes(page)&&item.renderer?.collectionCards?.length)&&!screenshots.has(page)&&!win.webContents.isLoading()){
     try{fs.writeFileSync(path.join(root,'diagnostics',page.replace('.html','')+'-layout-actual.png'),(await win.webContents.capturePage()).toPNG());screenshots.add(page);}catch{}
    }
    observed.set(page,item);
    windows.push(item);
   }
   fs.mkdirSync(path.dirname(file),{recursive:true});const report=JSON.stringify({pid:process.pid,measuredAt:new Date().toISOString(),mode:process.argv.includes('--release')?'release':'other',units:'Electron bounds are DIP; physical pixels depend on displayScale',actions,windows,observedWindows:[...observed.values()]},null,2);fs.writeFileSync(file,report);fs.writeFileSync(path.join(root,'diagnostics','actual-window-sizes-'+process.pid+'.json'),report);
  }finally{writing=false;}
 }
 async function audit(){
  await capture();
  const controller=electron.BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().split('?')[0].endsWith('/controller.html'));
  const action=handlers.get('app:controller-action');
  if(opened||!controller||!action||controller.webContents.isLoading())return;opened=true;
  // Exercise the app's own read-only page-opening commands using their original
  // registered handlers. No synthetic window sizes, forms, login or bookings.
  for(const name of (process.argv.includes('--account-dialog-check')?['login-data']:process.argv.includes('--log-panel-check')?['proxy','logs']:['new-form','open-form','login-data','proxy','payment','history','tools','updates','logs'])){
   try{const result=await action({sender:controller.webContents},name);actions.push({page:name,ok:result?.ok!==false});}catch(error){actions.push({page:name,error:String(error.message)});}
   await new Promise(resolve=>setTimeout(resolve,300));await capture();
  }
  if(process.argv.includes('--account-dialog-check')){
   const panel=electron.BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().split('?')[0].endsWith('/login-data.html'));
   if(panel){
    const result=await panel.webContents.executeJavaScript(`(()=>{const el=id=>document.getElementById(id),read=()=>({usernameEmpty:el('mUsername').value==='',passwordEmpty:el('mPassword').value==='',badgeEmpty:el('mIdStat').textContent==='',badgeHidden:el('mIdStat').classList.contains('hidden'),visible:!el('userModal').classList.contains('hidden')});el('addBtn').click();const first=read();el('mUsername').value='synthetic-ui-audit';el('mPassword').value='synthetic-only';el('mIdStat').className='id-stat verified';el('mIdStat').textContent='VERIFIED';el('modalClose').click();el('addBtn').click();const reopened=read();el('modalCancel').click();return{helperReady:!!window.MatrixAccountVerification,first,reopened};})()`);
    fs.writeFileSync(path.join(root,'diagnostics/account-dialog-verified.json'),JSON.stringify({pid:process.pid,measuredAt:new Date().toISOString(),...result},null,2));
   }
  }
 }
 const timer=setInterval(()=>void audit(),2000);timer.unref();
 electron.app.on('browser-window-created',(_event,win)=>win.webContents.once('did-finish-load',()=>setTimeout(()=>void capture(),150)));
 electron.app.on('before-quit',()=>clearInterval(timer));
}
module.exports={install};

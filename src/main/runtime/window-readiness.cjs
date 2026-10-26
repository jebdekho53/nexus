'use strict';
const path=require('node:path');
const workspacePages=new Set(['form.html','open-form.html','login-data.html','proxy.html','payment.html','history.html','tools.html','updates.html','logs.html']);
function install(electron,root,log) {
  const Native=electron.BrowserWindow;
  const Window=new Proxy(Native,{construct(target,args){
    const options=args[0]||{},preferences={...(options.webPreferences||{}),backgroundThrottling:false};
    if(preferences.preload&&path.resolve(preferences.preload)===path.join(root,'src/preload/index.js'))preferences.preload=path.join(root,'src/preload/matrix.js');
    const win=Reflect.construct(target,[{...options,show:false,backgroundColor:options.transparent?'#00000000':'#10191d',webPreferences:preferences}]);
    let inlineTarget=null;
    const redirectTicket=(url,navigate)=>{
      const id=url.searchParams.get('id');
      if(url.protocol!=='file:'||require('node:url').fileURLToPath(url)!==path.join(root,'src/renderer/booking-box.html')||url.searchParams.get('view')!=='ticket'||!id)return null;
      inlineTarget=Native.getAllWindows?.().find(other=>{
        if(other===win||other.isDestroyed())return false;
        try{const u=new URL(other.webContents.getURL());return u.protocol==='file:'&&require('node:url').fileURLToPath(u)===path.join(root,'src/renderer/booking-box.html')&&u.searchParams.get('id')===id&&u.searchParams.get('view')!=='ticket';}catch{return false;}
      });
      if(!inlineTarget)return null;
      inlineTarget.__matrixSingleFlow=true;
      if(inlineTarget.getBounds){
        const b=inlineTarget.getBounds(),area=electron.screen?.getDisplayMatching(b).workArea;
        const width=Math.min(348,area?.width||348),height=Math.min(241,area?.height||241);
        inlineTarget.__matrixSuccessBounds={x:area?Math.max(area.x,Math.min(b.x,area.x+area.width-width)):b.x,y:area?Math.max(area.y,Math.min(b.y,area.y+area.height-height)):b.y,width,height};
        inlineTarget.setBounds(inlineTarget.__matrixSuccessBounds);
      }
      log('matrix-success-same-window',{page:'Success replaces its booking panel'});
      return Promise.resolve(navigate(inlineTarget)).then(value=>{
        if(!inlineTarget.isDestroyed()&&inlineTarget.__matrixSuccessBounds)inlineTarget.setBounds(inlineTarget.__matrixSuccessBounds);
        return value;
      }).finally(()=>{setTimeout(()=>{if(!win.isDestroyed())win.destroy();},100);});
    };
    if(typeof win.loadFile==='function'){
      const loadFile=win.loadFile.bind(win);
      win.loadFile=(file,loadOptions={})=>{
        const url=require('node:url').pathToFileURL(path.resolve(file));
        url.search=loadOptions.search||new URLSearchParams(loadOptions.query||{}).toString();
        const redirected=redirectTicket(url,target=>target.loadFile(file,loadOptions));
        if(redirected)return redirected;
        return loadFile(file,loadOptions);
      };
    }
    if(typeof win.loadURL==='function'){
      const loadURL=win.loadURL.bind(win);
      win.loadURL=(value,...args)=>{
        let url;try{url=new URL(value);}catch{return loadURL(value,...args);}
        return redirectTicket(url,target=>target.loadURL(value,...args))||loadURL(value,...args);
      };
    }
    let ready=false,pending=options.show===false?null:win.show.bind(win);
    const pageName=()=>{
      try{const u=new URL(win.webContents.getURL()),file=require('node:url').fileURLToPath(u);return u.protocol==='file:'&&path.dirname(file)===path.join(root,'src/renderer')?path.basename(file):null;}catch{return null;}
    };
    if(typeof win.setSkipTaskbar==='function'){
      const native=win.setSkipTaskbar.bind(win);
      win.setSkipTaskbar=value=>native(pageName()==='controller.html'?false:value);
    }
    const controlledSize=()=>{
      const page=pageName();if(!['booking-box.html','splash.html','confirm-quit.html'].includes(page)&&!workspacePages.has(page))return null;
      const area=electron.screen?.getDisplayMatching(win.getBounds()).workArea;
      if(page==='booking-box.html')return {width:Math.min(348,area?.width||348),height:Math.min(241,area?.height||241)};
      if(page==='splash.html'||page==='confirm-quit.html')return {width:Math.min(460,area?.width||460),height:Math.min(360,area?.height||360)};
      return {width:Math.min(1120,Math.max(1,(area?.width||1152)-32)),height:Math.min(760,Math.max(1,(area?.height||792)-32))};
    };
    for(const method of ['setSize','setContentSize'])if(typeof win[method]==='function'){
      const native=win[method].bind(win);win[method]=(width,height,...args)=>{const size=controlledSize();return native(size?.width||width,size?.height||height,...args);};
    }
    if(typeof win.setBounds==='function'){
      const native=win.setBounds.bind(win);win.setBounds=(bounds,...args)=>{const size=controlledSize();return native(size?{...bounds,...size}:bounds,...args);};
    }
    for(const method of ['show','showInactive'])if(typeof win[method]==='function'){
      const native=win[method].bind(win);
      win[method]=()=>{if(inlineTarget&&!inlineTarget.isDestroyed()){inlineTarget.show();return;}if(ready){if(pageName()==='booking-box.html'&&win.isMinimized?.())win.restore?.();native();}else pending=native;};
    }
    win.webContents.on('did-start-loading',()=>{ready=false;});
    win.webContents.on('did-finish-load',async()=>{
      if(pageName()==='controller.html'){
        win.setSkipTaskbar?.(false);
        win.setMinimizable?.(true);
      }
      const size=controlledSize();
      if(size&&win.setBounds){
        if(workspacePages.has(pageName())){
          const area=electron.screen?.getDisplayMatching(win.getBounds()).workArea;
          win.setMinimumSize?.(Math.min(800,size.width),Math.min(560,size.height));
          win.setBounds({...win.getBounds(),...size,...(area?{x:area.x+Math.round((area.width-size.width)/2),y:area.y+Math.round((area.height-size.height)/2)}:{})});
        }else win.setBounds({...win.getBounds(),...size});
      }
      try {
        await Promise.race([win.webContents.executeJavaScript("document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))"),new Promise(resolve=>setTimeout(resolve,1200))]);
      }catch(error){log('window-readiness-error',{error:String(error.message)});}
      if(win.isDestroyed())return;ready=true;
      if(pending){const show=pending;pending=null;show();}
    });
    return win;
  }});
  return new Proxy(electron,{get(target,key){return key==='BrowserWindow'?Window:Reflect.get(target,key);}});
}
module.exports={install};

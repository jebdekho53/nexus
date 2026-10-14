'use strict';
const path=require('node:path');
function install(electron,root,log) {
  const Native=electron.BrowserWindow;
  const Window=new Proxy(Native,{construct(target,args){
    const options=args[0]||{},preferences={...(options.webPreferences||{}),backgroundThrottling:false};
    if(preferences.preload&&path.resolve(preferences.preload)===path.join(root,'src/preload/index.js'))preferences.preload=path.join(root,'src/preload/nexus.js');
    const win=Reflect.construct(target,[{...options,show:false,backgroundColor:options.transparent?'#00000000':'#10191d',webPreferences:preferences}]);
    let ready=false,pending=options.show===false?null:win.show.bind(win);
    for(const method of ['show','showInactive'])if(typeof win[method]==='function'){
      const native=win[method].bind(win);
      win[method]=()=>{if(ready)native();else pending=native;};
    }
    win.webContents.on('did-start-loading',()=>{ready=false;});
    win.webContents.on('did-finish-load',async()=>{
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

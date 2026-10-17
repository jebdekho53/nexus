'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {differential}=require('./helpers/legacy-diff.cjs');
const legacyInstall=require('./fixtures/legacy/development-windows.legacy.cjs');
const migrated=require('../src/main/runtime/development-windows.cjs');
const legacy={installDevelopmentWindows:legacyInstall};

// src/ts/main/runtime/development-windows.ts versus the block of index.cjs it replaced.
const check=differential(legacy,migrated);
const clean=(x,root)=>JSON.parse(JSON.stringify(x===undefined?null:x,(k,v)=>typeof v==='string'?v.split(root).join('<root>'):v));

test('profile selection and window diagnostics',async()=>{
  const argSets=[[],['--release-activation-test'],['--isolated-live-test'],['--release-activation-test','--isolated-live-test']];
  const urls=['file:///a/booking-box.html?id=1','file:///a/controller.html','file:///a/security-error.html?detail=Blocked','file:///a/security-error.html','file:///a/x.html?y=1#h',''];
  for(const args of argSets)for(const managedRelease of[false,true])for(const legacyProfile of[false,true])for(const existingProfile of[false,true]) {
    if((managedRelease&&!args.length)===false&&(legacyProfile||existingProfile))continue;
    await check(JSON.stringify([args,managedRelease,legacyProfile,existingProfile]),async(m,trace)=>{
      const root=fs.mkdtempSync(path.join(os.tmpdir(),'devwin-'));
      const diagnostics=path.join(root,'diagnostics'),appData=path.join(root,'appdata');
      fs.mkdirSync(diagnostics,{recursive:true});fs.mkdirSync(appData);
      if(legacyProfile){fs.mkdirSync(path.join(diagnostics,'release-profile'));fs.writeFileSync(path.join(diagnostics,'release-profile','f.txt'),'legacy');}
      if(existingProfile)fs.mkdirSync(path.join(appData,'Matrix','profiles','release'),{recursive:true});
      const argv=process.argv;process.argv=[...argv.slice(0,2),...args];
      try{
        const listeners={};const paths=[];
        const windows=[];
        const makeWindow=url=>{
          const handlers={};const win={handlers,webContents:{on:(event,l)=>{(handlers[event]??=[]).push(l);},getURL:()=>url,executeJavaScript:code=>{trace.push(['js',code]);return url.includes('booking-box')&&args.includes('--isolated-live-test')&&url.endsWith('id=1')&&code?Promise.reject(new Error('probe failed')):Promise.resolve();}},on:(event,l)=>{(handlers['win:'+event]??=[]).push(l);},getTitle:()=>'Title'};
          return win;
        };
        const electron={app:{getPath:name=>name==='appData'?appData:'/x',setPath:(name,value)=>paths.push([name,String(value)]),on:(event,l)=>{listeners[event]=l;}}};
        m.installDevelopmentWindows({isDevelopment:true,isSmoke:false,electron,projectRoot:root,diagnostics,managedRelease,log:(...a)=>trace.push(['log',...a.map(x=>clean(x,root))])});
        electron.app.setPath('userData','/ignored');electron.app.setPath('temp','/t');
        for(const url of urls){
          const win=makeWindow(url);listeners['browser-window-created']({},win);
          win.handlers['did-fail-load'][0]({},-2,'FAILED');win.handlers['render-process-gone'][0]({},{reason:'killed'});
          win.handlers['console-message'][0]({},1,'info');win.handlers['console-message'][0]({},2,'error');
          win.handlers['win:show'][0]();
          for(const l of win.handlers['did-finish-load'])l();
          await new Promise(resolve=>setImmediate(resolve));
        }
        const profileExists=fs.existsSync(path.join(appData,'Matrix','profiles','release','f.txt'));
        return clean({paths:paths.map(([n,v])=>[n,v.split(root).join('<root>')]),profileExists,dirs:fs.readdirSync(diagnostics).sort()},root);
      }finally{process.argv=argv;fs.rmSync(root,{recursive:true,force:true});}
    });
  }
});

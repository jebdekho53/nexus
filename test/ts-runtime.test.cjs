'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const load=name=>[require('./fixtures/legacy/'+name+'.legacy.cjs'),require('../src/main/runtime/'+name+'.cjs')];

// Runtime helpers migrated to TypeScript (src/ts/main/runtime) versus their previous JavaScript.
test('booking-timing / general-api-candidate scopes',async()=>{
  const[lt,mt]=load('booking-timing');sameExports(lt,mt);
  const[lg,mg]=load('general-api-candidate');sameExports(lg,mg);
  const checkTiming=differential(lt,mt),checkGeneral=differential(lg,mg);
  for(const quota of['GN','8AM','TQ',undefined,null])for(const immediate of[false,true])
    await checkTiming('timing '+quota+immediate,async(m,trace)=>{
      const hooks=m.bookingTiming();
      const call=()=>hooks.f2281((...a)=>{trace.push(['original',...a]);return'orig';},[{quota},'x']);
      const sync=immediate?m.withImmediateLogin(call):call();
      const asyncValue=immediate?await m.withImmediateLogin(async()=>{await Promise.resolve();return call();}):await call();
      return[sync,asyncValue,hooks.f2281((...a)=>'o',[undefined])];
    });
  for(const request of[undefined,null,{},{matrixGeneralApiCandidate:true},{matrixGeneralApiCandidate:true,form:{quota:'GN'}},{matrixGeneralApiCandidate:true,form:{quota:'8AM'}},{matrixGeneralApiCandidate:'true',form:{quota:'GN'}}])
    for(const enabled of[undefined,false,true,'yes'])
      await checkGeneral('general '+JSON.stringify(request)+enabled,async(m,trace)=>{
        const hook=m.interceptors().f3406;
        const inside=await m.withCandidate(async()=>{await Promise.resolve();return[hook((...a)=>{trace.push(['o',...a]);return'orig';},[1,2]),hook(()=>'orig2',[])];},request,enabled);
        const outside=hook(()=>'outside',[]);
        return[inside,outside];
      });
});

test('matrix-brand installs the branding hooks',async()=>{
  const[legacy,migrated]=load('matrix-brand');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const fs=require('node:fs'),os=require('node:os');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'brand-'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'9.8.7'}));
  for(const platform of['win32','linux'])for(const bounds of[{x:100,y:50,width:974,height:80},{x:0,y:0,width:500,height:300},{x:2000,y:10,width:974,height:80}])
    await check(platform+JSON.stringify(bounds),async(m,trace)=>{
      const original={platform:Object.getOwnPropertyDescriptor(process,'platform'),out:process.stdout.write,err:process.stderr.write};
      Object.defineProperty(process,'platform',{value:platform});
      const writes=[];
      process.stdout.write=chunk=>{writes.push(['out',Buffer.isBuffer(chunk)?'buf:'+chunk.toString():chunk]);return true;};
      process.stderr.write=chunk=>{writes.push(['err',String(chunk)]);return true;};
      try{
        const listeners={};
        const makeWindow=()=>{
          const winListeners={};let title='Brahmos Window';let b={...bounds};
          const win={
            setIcon:p=>trace.push(['icon',path.relative(root,p)]),isDestroyed:()=>false,getBounds:()=>({...b}),setBounds:next=>{trace.push(['setBounds',next]);b={...next};},
            on:(event,l)=>{(winListeners[event]??=[]).push(l);},once:(event,l)=>{(winListeners['once:'+event]??=[]).push(l);},
            webContents:{on:(event,l)=>{(winListeners['wc:'+event]??=[]).push(l);}},
            setTitle:value=>{title=value;trace.push(['title',value]);},getTitle:()=>title,fire:(event,...args)=>(winListeners[event]||[]).forEach(l=>l(...args)),
          };
          return win;
        };
        const menus=[];
        let appName,appId;
        const electron={
          app:{getVersion:()=>'0',setName:name=>{appName=name;trace.push(['setName',name]);},setAppUserModelId:id=>{appId=id;},on:(event,l)=>{listeners[event]=l;}},
          screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1040}})},
          Menu:{setApplicationMenu:menu=>{menus.push(JSON.stringify(menu));return'set';}},
        };
        m.install(electron,root);
        process.stdout.write('Hello Brahmos BRAHMOS');process.stderr.write(Buffer.from('brahmos buffer'));process.stdout.write(Buffer.from('plain buffer'));process.stdout.write('plain');
        electron.app.setName('Other');
        const win=makeWindow();listeners['browser-window-created']({},win);
        win.fire('resize');win.fire('wc:did-finish-load');win.fire('once:ready-to-show');
        win.setTitle('Xhamster TS tool');win.setTitle('Matrix already');win.setTitle('TS thing');
        const prevented=[];win.fire('page-title-updated',{preventDefault:()=>prevented.push(1)},'Tatkal Software 1');
        const menuResult=electron.Menu.setApplicationMenu({items:[{label:'Brahmos',submenu:{items:[{label:'TS Sub'},{}]}},{}]});
        electron.Menu.setApplicationMenu(null);
        return{version:electron.app.getVersion(),appName,appId,writes,menus,menuResult,prevented};
      }finally{Object.defineProperty(process,'platform',original.platform);process.stdout.write=original.out;process.stderr.write=original.err;}
    });
});

test('qr-delivery imageUrl',async()=>{
  const[legacy,migrated]=load('qr-delivery');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,0]).toString('base64'),jpg=Buffer.from([255,216,255,0]).toString('base64'),svg=Buffer.from('  <svg xmlns=""></svg>').toString('base64'),xml=Buffer.from('<?xml version="1.0"?><svg/>').toString('base64');
  const values=[png,jpg,svg,xml,'data:image/png;base64,'+png,'data:image/jpeg;base64,'+jpg,'data:image/svg+xml;base64,'+svg,Buffer.from('hello').toString('base64'),'','!!!',undefined,null,5,{},'x'.repeat(3000001),png+'AAAA',Buffer.from([255]).toString('base64')];
  for(const value of values)await check('imageUrl '+String(value).slice(0,20),m=>m.imageUrl(value));
});

test('window-readiness: hidden until the renderer is ready, preload swapped',async()=>{
  const[legacy,migrated]=load('window-readiness');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const root=path.join(path.sep,'app');
  const scenarios={
    swapPreload:{options:{webPreferences:{preload:path.join(root,'src/preload/index.js')}}},otherPreload:{options:{webPreferences:{preload:path.join(root,'src/preload/other.js')}}},noPrefs:{options:{}},transparent:{options:{transparent:true}},
    showFalse:{options:{show:false},showCalls:1},showTrue:{options:{show:true},showCalls:1},showAfterReady:{options:{},finish:true,showCalls:2},showInactiveBeforeReady:{options:{show:false},inactive:true},
    readyThenReload:{options:{},finish:true,reload:true,showCalls:1},destroyedBeforeReady:{options:{},finish:true,destroyed:true},executeRejects:{options:{},finish:true,rejects:true},noShowMethods:{options:{},noShow:true},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,async(m,trace)=>{
      const listeners={};
      let destroyed=false;
      class Window{
        constructor(options){trace.push(['ctor',JSON.parse(JSON.stringify(options))]);this.webContents={on:(event,l)=>{(listeners[event]??=[]).push(l);},executeJavaScript:code=>{trace.push(['js',code.length]);return o.rejects?Promise.reject(new Error('js')):Promise.resolve();}};}
        isDestroyed(){return destroyed;}
      }
      if(!o.noShow){Window.prototype.show=function(){trace.push('native show');};Window.prototype.showInactive=function(){trace.push('native showInactive');};}
      const electron={BrowserWindow:Window,other:'x'};
      const wrapped=m.install(electron,root,(...a)=>trace.push(['log',...a]));
      const win=new wrapped.BrowserWindow(o.options);
      trace.push(['other',wrapped.other,wrapped.BrowserWindow===Window]);
      if(o.reload){listeners['did-finish-load']?.forEach(l=>l());await new Promise(r=>setTimeout(r,5));}
      if(o.reload)listeners['did-start-loading']?.forEach(l=>l());
      if(!o.noShow){
        for(let i=0;i<(o.showCalls||0);i++){win.show();if(o.finish&&i===0){destroyed=!!o.destroyed;listeners['did-finish-load']?.forEach(l=>l());await new Promise(r=>setTimeout(r,5));}}
        if(o.inactive){win.showInactive();listeners['did-finish-load']?.forEach(l=>l());await new Promise(r=>setTimeout(r,5));}
        if(o.finish&&!o.showCalls){destroyed=!!o.destroyed;listeners['did-finish-load']?.forEach(l=>l());await new Promise(r=>setTimeout(r,5));}
      }
      return trace.length;
    });
});

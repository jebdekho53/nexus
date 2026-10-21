'use strict';
const path=require('node:path');
const brand=text=>String(text||'').replace(/Xhamster\s*TS/gi,'Matrix').replace(/Tatkal Software/gi,'Matrix').replace(/\bBrahmos\b/gi,'Matrix').replace(/\bTS\b/g,'Matrix');
const brahmos=/brahmos/gi;
const logBrand=text=>text.replace(brahmos,m=>m===m.toUpperCase()?'MATRIX':'Matrix');
function brandStream(stream){
  const write=stream.write.bind(stream);
  stream.write=(chunk,...rest)=>{
    if(typeof chunk==='string')chunk=logBrand(chunk);
    else if(Buffer.isBuffer(chunk)&&/brahmos/i.test(chunk.toString('latin1')))chunk=Buffer.from(logBrand(chunk.toString('utf8')),'utf8');
    return write(chunk,...rest);
  };
}
function install(electron,root) {
  brandStream(process.stdout);
  brandStream(process.stderr);
  const version=require(path.join(root,'package.json')).version;
  electron.app.getVersion=()=>version;
  electron.app.setName('Matrix');
  const nativeName=electron.app.setName.bind(electron.app);
  electron.app.setName=()=>nativeName('Matrix');
  if(process.platform==='win32')electron.app.setAppUserModelId('com.matrix.workspace');
  electron.app.on('browser-window-created',(_event,win)=>{
    if(typeof win.setIcon==='function')win.setIcon(path.join(root,'resources/icon.png'));
    const title=value=>{const next=brand(value);return next.startsWith('Matrix')?next:'Matrix · '+next;};
    // Compact dock: the app opens the controller at 974x80 — shrink it to the slim Matrix dock, keeping it bottom-anchored.
    let fitting=false;
    const fitDock=()=>{
      if(fitting||win.isDestroyed())return;
      const b=win.getBounds();
      if(b.width!==974||b.height!==80)return;
      fitting=true;
      const w=970,h=58,area=electron.screen.getDisplayMatching(b).workArea;
      const x=Math.min(Math.max(b.x+Math.round((b.width-w)/2),area.x),area.x+area.width-w);
      win.setBounds({x,y:b.y+b.height-h,width:w,height:h});
      fitting=false;
    };
    win.on('resize',fitDock);
    win.webContents.on('did-finish-load',fitDock);
    win.once('ready-to-show',fitDock);
    const nativeTitle=win.setTitle.bind(win);
    win.setTitle=value=>nativeTitle(title(value));
    win.on('page-title-updated',(event,value)=>{event.preventDefault();const next=title(value);if(win.getTitle()!==next)win.setTitle(next);});
    win.webContents.on('did-finish-load',()=>win.setTitle(title(win.getTitle())));
  });
  const setMenu=electron.Menu.setApplicationMenu.bind(electron.Menu);
  const clean=menu=>{for(const item of menu?.items||[]){if(item.label)item.label=brand(item.label);if(item.submenu)clean(item.submenu);}};
  electron.Menu.setApplicationMenu=menu=>{clean(menu);return setMenu(menu);};
}
module.exports={install};

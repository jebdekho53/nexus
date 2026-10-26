const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {install}=require('../src/main/runtime/window-readiness.cjs');
test('only requested windows show after renderer readiness; original preload is extended',async()=>{
  class Window{constructor(options){this.options=options;this.webContents=new EventEmitter();this.webContents.executeJavaScript=async()=>{};this.count=0;}show(){this.count++;}showInactive(){this.count++;}isDestroyed(){return false;}}
  const electron=install({BrowserWindow:Window},'C:/project',()=>{});
  const panel=new electron.BrowserWindow({show:false,webPreferences:{preload:require('node:path').join('C:/project','src/preload/index.js')}});
  assert.equal(panel.options.show,false);assert.equal(panel.options.webPreferences.backgroundThrottling,false);
  assert.ok(panel.options.webPreferences.preload.endsWith('matrix.js'));
  panel.show();assert.equal(panel.count,0);panel.webContents.emit('did-finish-load');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(panel.count,1);
  const hidden=new electron.BrowserWindow({show:false});hidden.webContents.emit('did-finish-load');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(hidden.count,0);
});

test('success navigates only its matching booking window and preserves the native window',async()=>{
 const path=require('path'),{pathToFileURL}=require('url'),root=path.resolve(__dirname,'..'),windows=[];
 class Window{constructor(){windows.push(this);this.webContents=new EventEmitter();this.webContents.getURL=()=>this.url||'';this.webContents.executeJavaScript=async()=>{};this.destroyed=false;this.shown=0;}loadFile(file,options={}){this.url=pathToFileURL(file).href+'?'+new URLSearchParams(options.query||{});this.webContents.emit('did-finish-load');return Promise.resolve();}show(){this.shown++;}isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}static getAllWindows(){return windows.filter(w=>!w.destroyed)}}
 const electron=install({BrowserWindow:Window},root,()=>{}),file=path.join(root,'src/renderer/booking-box.html');
 const one=new electron.BrowserWindow({show:false}),two=new electron.BrowserWindow({show:false});await one.loadFile(file,{query:{id:'one'}});await two.loadFile(file,{query:{id:'two'}});
 const request=new electron.BrowserWindow({show:false});await request.loadFile(file,{query:{id:'two',view:'ticket'}});request.show();
 assert(!one.url.includes('view=ticket'));assert(two.url.includes('view=ticket'));assert.equal(two.__matrixSingleFlow,true);assert.equal(request.shown,0);assert(two.shown>0);
 await new Promise(r=>setTimeout(r,120));assert(request.isDestroyed());assert.equal(Window.getAllWindows().length,2);
});
for(const method of ['search','url'])test('ticket '+method+' navigation reuses the booking window at the same screen position',async()=>{
 const path=require('node:path'),{pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..'),windows=[];
 class Window{constructor(){windows.push(this);this.bounds={x:40,y:60,width:350,height:280};this.webContents=new EventEmitter();this.webContents.getURL=()=>this.url||'';this.webContents.executeJavaScript=async()=>{};this.destroyed=false;this.shown=0;}getBounds(){return {...this.bounds}}setBounds(b){this.bounds={...b}}loadFile(file,o={}){return this.loadURL(pathToFileURL(file).href+'?'+(o.search||new URLSearchParams(o.query||{})))}loadURL(url){this.url=url;this.webContents.emit('did-finish-load');return Promise.resolve();}show(){this.shown++}isDestroyed(){return this.destroyed}destroy(){this.destroyed=true}static getAllWindows(){return windows.filter(w=>!w.destroyed)}}
 const electron=install({BrowserWindow:Window,screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})}},root,()=>{}),file=path.join(root,'src/renderer/booking-box.html');
 const booking=new electron.BrowserWindow({show:false}),other=new electron.BrowserWindow({show:false});await booking.loadFile(file,{search:'id=target'});await other.loadFile(file,{search:'id=other'});
 const duplicate=new electron.BrowserWindow({show:false});if(method==='search')await duplicate.loadFile(file,{search:'view=ticket&id=target'});else await duplicate.loadURL(pathToFileURL(file).href+'?view=ticket&id=target');duplicate.show();
 assert(booking.url.includes('view=ticket'));assert.equal(duplicate.shown,0);assert(!other.url.includes('view=ticket'));assert.deepEqual(booking.getBounds(),{x:40,y:60,width:348,height:241});booking.setBounds({x:40,y:60,width:348,height:241});assert.deepEqual(booking.getBounds(),{x:40,y:60,width:348,height:241});await new Promise(r=>setTimeout(r,120));assert(duplicate.isDestroyed());assert.equal(Window.getAllWindows().length,2);
});

test('controller remains in taskbar even when collapsed code requests hiding it',async()=>{
 const path=require('node:path'),{pathToFileURL}=require('node:url'),root=path.resolve('controller-taskbar-fixture');
 class Window{constructor(){this.webContents=new EventEmitter();this.webContents.getURL=()=>pathToFileURL(path.join(root,'src/renderer/controller.html')).href;this.webContents.executeJavaScript=async()=>{};}show(){}isDestroyed(){return false;}setSkipTaskbar(value){this.skip=value;}setMinimizable(value){this.minimizable=value;}}
 const electron=install({BrowserWindow:Window},root,()=>{}),win=new electron.BrowserWindow({show:false});
 win.webContents.emit('did-finish-load');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(win.skip,false);assert.equal(win.minimizable,true);
 win.setSkipTaskbar(true);assert.equal(win.skip,false);
});

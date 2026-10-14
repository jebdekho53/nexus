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

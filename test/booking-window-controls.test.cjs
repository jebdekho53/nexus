'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {install}=require('../src/main/runtime/booking-window-controls.cjs');
test('minimize targets the requesting booking box, supports taskbar restore and rejects foreign pages',()=>{
 const root=path.resolve(__dirname,'..');let handler,minimized=0;const calls=[];
 const win={isDestroyed:()=>false,setMinimizable:v=>calls.push(['minimizable',v]),setSkipTaskbar:v=>calls.push(['skipTaskbar',v]),minimize:()=>minimized++};
 const sender={getURL:()=>pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href+'?id=one'};
 install({ipcMain:{handle:(name,fn)=>{assert.equal(name,'matrix:booking:minimize');handler=fn;}},BrowserWindow:{fromWebContents:s=>{assert.equal(s,sender);return win;}}},root);
 assert.equal(handler({sender}).ok,true);assert.equal(minimized,1);assert.deepEqual(calls,[['minimizable',true],['skipTaskbar',false]]);
 for(const url of ['https://example.com/booking-box.html',pathToFileURL(path.join(root,'src/renderer/controller.html')).href])assert.equal(handler({sender:{getURL:()=>url}}).ok,false);
 assert.equal(minimized,1);
});

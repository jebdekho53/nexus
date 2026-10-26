'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {installStateHandler}=require('../src/main/runtime/trial-access.cjs');
const {configure}=require('../src/main/runtime/desktop-rendering.cjs');
const root=path.resolve(__dirname,'..');
const event=url=>({sender:{getURL:()=>url}});
test('trial status exists before activation, can be installed twice, and reads updated state',()=>{
 const handlers=new Map();let registrations=0,state=null;
 const electron={ipcMain:{handle(name,handler){registrations++;assert(!handlers.has(name));handlers.set(name,handler);}}};
 installStateHandler(electron,root,()=>state);installStateHandler(electron,root);
 const read=handlers.get('matrix:trial:state'),local=event(pathToFileURL(path.join(root,'src/renderer/controller.html')).href);
 assert.equal(registrations,1);assert.deepEqual(read(local),{ok:true,trial:null});
 state={active:true,pnrUsed:2};assert.deepEqual(read(local),{ok:true,trial:state});
 for(const url of ['https://example.com/controller.html',pathToFileURL(path.join(root,'src/main/index.cjs')).href,pathToFileURL(path.join(root,'src/renderer-other/controller.html')).href,'about:blank'])assert.deepEqual(read(event(url)),{ok:false});
});
test('Windows desktop uses software rendering before ready; explicit GPU opt-in and other platforms stay supported',()=>{
 let calls=0;const app={disableHardwareAcceleration(){calls++;}};
 assert.equal(configure(app,{platform:'win32',env:{}}),true);assert.equal(calls,1);
 assert.equal(configure(app,{platform:'win32',env:{MATRIX_DESKTOP_GPU:'1'}}),false);
 assert.equal(configure(app,{platform:'darwin',env:{}}),false);assert.equal(calls,1);
});

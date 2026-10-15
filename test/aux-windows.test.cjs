'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {closeAuxWindows}=require('../src/main/runtime/aux-windows.cjs');
test('login auxiliary cleanup preserves other branded pairs, ticket, QR and controller windows',()=>{
 const root=path.resolve(__dirname,'..'),closed=[];
 const make=(page,query='',title='Matrix')=>({isDestroyed:()=>false,getTitle:()=>title,webContents:{getURL:()=>pathToFileURL(path.join(root,'src/renderer',page)).href+query},close:()=>closed.push(page+query)});
 const caller=make('booking-box.html','?id=one'),other=make('booking-box.html','?id=two','Matrix · Booking');
 const wins=[caller,other,make('booking-box.html','?view=ticket&id=two'),make('controller.html'),make('confirm-quit.html'),make('qr.html'),make('form.html'),make('open-form.html'),make('tools.html')];
 assert.deepEqual(closeAuxWindows({BrowserWindow:{fromWebContents:()=>caller,getAllWindows:()=>wins}},root,{sender:caller.webContents}),{ok:true});
 assert.deepEqual(closed,['form.html','open-form.html','tools.html']);
});
test('foreign caller cannot close windows and foreign/unknown windows are not cleanup targets',()=>{
 const root=path.resolve(__dirname,'..');let closed=0;
 const external={isDestroyed:()=>false,webContents:{getURL:()=> 'https://example.test/booking-box.html'},close:()=>closed++};
 const local={isDestroyed:()=>false,webContents:{getURL:()=>pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href+'?id=one'}};
 const electron={BrowserWindow:{fromWebContents:sender=>sender===external.webContents?external:local,getAllWindows:()=>[external,local]}};
 assert.equal(closeAuxWindows(electron,root,{sender:external.webContents}).ok,false);assert.equal(closed,0);
 assert.equal(closeAuxWindows(electron,root,{sender:local.webContents}).ok,true);assert.equal(closed,0);
});

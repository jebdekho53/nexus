'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('success ticket docks below its matching pair, survives legacy reposition, follows movement and cleans listeners',()=>{
 const root=path.resolve(__dirname,'..'),url=pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href,app=new EventEmitter(),windows=[];
 const make=(query,bounds)=>{const win=new EventEmitter();win.webContents=new EventEmitter();win.webContents.getURL=()=>url+query;win.isDestroyed=()=>false;win.getBounds=()=>({...bounds});win.setBounds=b=>{bounds={...b};win.emit('resize');};win.setPosition=(x,y)=>{bounds={...bounds,x,y};};windows.push(win);return win;};
 const unrelated=make('?id=two',{x:700,y:100,width:380,height:200});
 const parent=make('?id=one',{x:10,y:700,width:380,height:200});
 const ticket=make('?view=ticket&id=one',{x:640,y:160,width:380,height:540});
 require('../src/main/runtime/ticket-docking.cjs').install({app,BrowserWindow:{getAllWindows:()=>windows},screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1200,height:864}})}},root);
 app.emit('browser-window-created',{},ticket);ticket.webContents.emit('did-finish-load');
 assert.equal(ticket.getBounds().x,10);assert.equal(parent.getBounds().y,116);assert.equal(ticket.getBounds().y,324);assert.equal(unrelated.getBounds().y,100);
 ticket.setPosition(640,160);assert.equal(ticket.getBounds().x,10);assert.equal(ticket.getBounds().y,324);
 parent.setBounds({...parent.getBounds(),x:100,y:20});parent.emit('move');assert.equal(ticket.getBounds().x,100);assert.equal(ticket.getBounds().y,228);
 ticket.emit('closed');assert.equal(parent.listenerCount('move'),0);assert.equal(parent.listenerCount('resize'),0);
});

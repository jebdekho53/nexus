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
test('when QR popup is open below booking panel, success ticket docks below QR popup and shifts up if QR closes',()=>{
 const root=path.resolve(__dirname,'..'),url=pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href,app=new EventEmitter(),windows=[];
 const make=(query,bounds,title)=>{const win=new EventEmitter();win.webContents=new EventEmitter();win.webContents.getURL=()=>url+query;win.isDestroyed=()=>false;win.isVisible=()=>true;win.getTitle=()=>title||'';win.getBounds=()=>({...bounds});win.setBounds=b=>{bounds={...b};win.emit('resize');};win.setPosition=(x,y)=>{bounds={...bounds,x,y};};windows.push(win);return win;};
 const parent=make('?id=one',{x:50,y:50,width:380,height:200},'Booking');
 const qrPopup=new EventEmitter();let qrBounds={x:50,y:258,width:250,height:250};qrPopup.webContents=new EventEmitter();qrPopup.webContents.getURL=()=>'data:text/html,...';qrPopup.isDestroyed=()=>false;qrPopup.isVisible=()=>true;qrPopup.getTitle=()=>'Scan to Pay';qrPopup.__formId='one';qrPopup.getBounds=()=>({...qrBounds});qrPopup.setBounds=b=>{qrBounds={...b};qrPopup.emit('resize');};windows.push(qrPopup);
 const ticket=make('?view=ticket&id=one',{x:640,y:160,width:380,height:300},'Booking Ticket');
 require('../src/main/runtime/ticket-docking.cjs').install({app,BrowserWindow:{getAllWindows:()=>windows},screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})}},root);
 app.emit('browser-window-created',{},ticket);ticket.webContents.emit('did-finish-load');
 // Parent is at y=50, height=200. QR popup is at y=258, height=250.
 // Ticket window should dock directly below QR popup: y = 258 + 250 + 8 = 516.
 assert.equal(ticket.getBounds().x,50);
 assert.equal(ticket.getBounds().y,516);
 // When parent moves, QR popup moves, and ticket follows below QR popup
 qrBounds={...qrBounds,x:80,y:308};qrPopup.emit('move');
 assert.equal(ticket.getBounds().x,50);
 assert.equal(ticket.getBounds().y,566);
 // When QR popup closes, ticket shifts up directly below parent booking panel
 qrPopup.isDestroyed=()=>true;qrPopup.emit('closed');
 assert.equal(ticket.getBounds().y,258);
 ticket.emit('closed');
});

test('multiple pair or form windows tile side-by-side instead of stacking on top of each other',()=>{
 const root=path.resolve(__dirname,'..'),url=pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href,app=new EventEmitter(),windows=[];
 const make=(query,bounds)=>{const win=new EventEmitter();win.webContents=new EventEmitter();win.webContents.getURL=()=>url+query;win.isDestroyed=()=>false;win.isVisible=()=>true;win.getBounds=()=>({...bounds});win.setBounds=b=>{bounds={...b};win.emit('resize');};win.setPosition=(x,y)=>{bounds={...bounds,x,y};};windows.push(win);return win;};
 const pair1=make('?id=p1',{x:20,y:40,width:380,height:260});
 const pair2=make('?id=p2',{x:20,y:40,width:380,height:260});
 require('../src/main/runtime/ticket-docking.cjs').install({app,BrowserWindow:{getAllWindows:()=>windows},screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})}},root);
 app.emit('browser-window-created',{},pair2);
 pair2.webContents.emit('did-finish-load');
 // pair2 should be positioned side-by-side to the right of pair1 (20 + 380 + 14 = 414), not on top of it (20)
 assert.equal(pair2.getBounds().x,414);
 assert.equal(pair2.getBounds().y,40);
 pair1.emit('closed');pair2.emit('closed');
});



'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('six and eight compact booking boxes wrap to empty rows without overlap',()=>{
 const {freePosition}=require('../src/main/runtime/ticket-docking.cjs'),area={x:0,y:0,width:1920,height:1040},size={width:348,height:241},boxes=[{x:8,y:8,...size}];
 for(let n=1;n<8;n++){
  const pos=freePosition(area,size,boxes,boxes.at(-1));assert(pos,'No free slot for box '+(n+1));
  const b={...pos,...size};assert(boxes.every(a=>!(b.x<a.x+a.width&&b.x+b.width>a.x&&b.y<a.y+a.height&&b.y+b.height>a.y)));boxes.push(b);
 }
 assert.equal(boxes[5].x,8);assert.equal(boxes[5].y,263);assert(boxes.every(b=>b.x+b.width<=area.width&&b.y+b.height<=area.height));
});
test('success ticket docks below its matching pair, survives legacy reposition, follows movement and cleans listeners',()=>{
 const root=path.resolve(__dirname,'..'),url=pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href,app=new EventEmitter(),windows=[];
 const make=(query,bounds)=>{const win=new EventEmitter();win.webContents=new EventEmitter();win.webContents.getURL=()=>url+query;win.isDestroyed=()=>false;win.getBounds=()=>({...bounds});win.setBounds=b=>{bounds={...b};win.emit('resize');};win.setPosition=(x,y)=>{bounds={...bounds,x,y};};windows.push(win);return win;};
 const unrelated=make('?id=two',{x:700,y:100,width:380,height:200});
 const parent=make('?id=one',{x:10,y:700,width:380,height:200});
 const ticket=make('?view=ticket&id=one',{x:640,y:160,width:380,height:540});
 require('../src/main/runtime/ticket-docking.cjs').install({app,BrowserWindow:{getAllWindows:()=>windows},screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1200,height:864}})}},root);
 app.emit('browser-window-created',{},ticket);ticket.webContents.emit('did-finish-load');
 assert.equal(ticket.getBounds().x,10);assert.equal(parent.getBounds().y,415);assert.equal(ticket.getBounds().y,623);assert.equal(ticket.getBounds().width,348);assert.equal(ticket.getBounds().height,241);assert.equal(unrelated.getBounds().y,100);
 ticket.setPosition(640,160);assert.equal(ticket.getBounds().x,10);assert.equal(ticket.getBounds().y,623);
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

test('pair created from specific form window docks directly beside that form, ignoring controller dock',()=>{
 const root=path.resolve(__dirname,'..'),url=pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href,app=new EventEmitter(),windows=[];
 const make=(query,bounds)=>{const win=new EventEmitter();win.webContents=new EventEmitter();win.webContents.getURL=()=>url+query;win.isDestroyed=()=>false;win.isVisible=()=>true;win.getBounds=()=>({...bounds});win.setBounds=b=>{bounds={...b};win.emit('resize');};win.setPosition=(x,y)=>{bounds={...bounds,x,y};};windows.push(win);return win;};
 // Add controller window at bottom of screen
 const ctrl=new EventEmitter();ctrl.webContents=new EventEmitter();ctrl.webContents.getURL=()=>'file:///app/src/renderer/controller.html';ctrl.isDestroyed=()=>false;ctrl.isVisible=()=>true;ctrl.getBounds=()=>({x:475,y:964,width:970,height:58});windows.push(ctrl);
 const form1=make('?id=form1',{x:400,y:300,width:348,height:208});
 require('../src/main/runtime/ticket-docking.cjs').install({app,BrowserWindow:{getAllWindows:()=>windows},screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})}},root);
 app.emit('browser-window-created',{},form1);
 form1.webContents.emit('did-finish-load');
 // form1 triggers app:save-form for pair
 form1.webContents.emit('ipc-message',{},'app:save-form');
 const pairWin=make('?id=form1_paired',{x:0,y:0,width:348,height:300});
 app.emit('browser-window-created',{},pairWin);
 pairWin.webContents.emit('did-finish-load');
 // pairWin should dock beside form1 at x = 400 + 348 + 14 = 762, y = 300, NOT beside controller dock at 1459, 964
 assert.equal(pairWin.getBounds().x,762);
 assert.equal(pairWin.getBounds().y,300);
 form1.emit('closed');pairWin.emit('closed');ctrl.emit('closed');
});



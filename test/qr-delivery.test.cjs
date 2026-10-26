const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{qrDelivery,imageUrl}=require('../src/main/runtime/qr-delivery.cjs');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hAAAAABJRU5ErkJggg==';
test('legacy popup preference and forced popup payload still render inside the booking window',async()=>{
 const root=path.resolve(__dirname,'..'),events=[];
 const parent={isDestroyed:()=>false,webContents:{getURL:()=>pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href+'?id=one',executeJavaScript:async()=>false,send:(channel,payload)=>events.push({channel,payload})}};
 const hooks=qrDelivery({BrowserWindow:{getAllWindows:()=>[parent]}},root);let created=0;
 assert.equal(hooks.f3734(()=>true,[]),false);assert.equal(hooks.f3743(()=>{created++;},['one']),null);
 await hooks.f3740(async payload=>{assert.equal(payload.forcePopup,false);return true},[{imageBase64:png,forcePopup:true},'one']);assert.equal(created,0);assert.equal(events.length,1);assert.ok(events[0].payload.dataUrl);assert.equal(events[0].payload.formId,'one');
 let saved;await hooks.f4021(async(...args)=>{saved=args[1];return{ok:true}},[{},true]);assert.equal(saved,false);
});
test('QR fallback is restricted to its local booking profile and avoids duplicate display',async()=>{
 const root=path.resolve(__dirname,'..'),events=[];
 const make=(id,url,present=false)=>({isDestroyed:()=>false,webContents:{getURL:()=>url||pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href+'?id='+id,executeJavaScript:async()=>present,send:(channel,value)=>events.push({channel,id:value.formId})}});
 const windows=[make('one'),make('two'),make('one','https://example.com/booking-box.html?id=one')];
 const hook=qrDelivery({BrowserWindow:{getAllWindows:()=>windows}},root).f3740;
 let originalCalls=0;const original=async()=>{originalCalls++;return 'retained';};
 assert.equal(await hook(original,[{imageBase64:png},'one']),'retained');assert.equal(originalCalls,1);assert.deepEqual(events,[{channel:'app:qr',id:'one'}]);
 events.length=0;await hook(original,[{imageBase64:png}]);assert.equal(events.length,0,'ambiguous unnamed QR is not displayed');
 windows.splice(0,windows.length,make('one',undefined,true));await hook(original,[{imageBase64:png},'one']);assert.equal(events.length,0,'already visible QR is retained');
 assert.equal(imageUrl('not-an-image'),null);assert.ok(imageUrl(png).startsWith('data:image/png;base64,'));
});
test('QR popup docks directly below single active booking box even if id is omitted',async()=>{
 const {EventEmitter}=require('node:events'),root=path.resolve(__dirname,'..');
 const parent=new EventEmitter();parent.isDestroyed=()=>false;parent.getBounds=()=>({x:50,y:40,width:270,height:390});
 parent.webContents={getURL:()=>pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href+'?id=unnamed',executeJavaScript:async()=>false,send:()=>{}};
 const popup=new EventEmitter();let bounds={x:0,y:0,width:250,height:310};popup.isDestroyed=()=>false;popup.getBounds=()=>bounds;popup.setBounds=b=>{bounds=b;};
 const hook=qrDelivery({BrowserWindow:{getAllWindows:()=>[parent]},screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})}},root);
 hook.f3746(()=>null,[popup,undefined]);
 assert.equal(bounds.x,50);
 assert.equal(bounds.y,40+390+8);
});
test('when QR popup is OFF, no separate popup is created and QR is sent to in-box panel',async()=>{
 const {EventEmitter}=require('node:events'),root=path.resolve(__dirname,'..'),events=[];
 const parent=new EventEmitter();parent.isDestroyed=()=>false;parent.getBounds=()=>({x:50,y:40,width:270,height:390});
 parent.webContents={getURL:()=>pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href+'?id=form-test',executeJavaScript:async()=>false,send:(ch,val)=>events.push({ch,val})};
 const hook=qrDelivery({BrowserWindow:{getAllWindows:()=>[parent]}},root);
 hook.f3734(()=>false,[]); // Turned OFF in tools
 const popupResult=hook.f3743(()=>({isDestroyed:()=>false}),['form-test']);
 assert.equal(popupResult,null,'f3743 does not spawn popup window when qrPopup is off');
 await hook.f3740(async()=>true,[{imageBase64:png,caption:'Test',amount:200},'form-test']);
 assert.equal(events.length,1);
 assert.equal(events[0].ch,'app:qr');
 assert.equal(events[0].val.formId,'form-test');
 assert.equal(events[0].val.amount,200);
 assert.ok(events[0].val.dataUrl);
});



test('UPI collect receives a native window without enabling QR popups for other runs',()=>{
 const hooks=qrDelivery({BrowserWindow:{getAllWindows:()=>[]}},path.resolve(__dirname,'..'));
 const loaded=[];let created=0;
 const factory=()=>{created++;return {loadURL:url=>loaded.push(url),show:()=>{}};};
 const collect=()=>{const win=hooks.f3743(factory,['collect-form']);win.loadURL('data:text/html,collect');win.show();};
 hooks.f3745(collect,[]);
 assert.deepEqual(loaded,['data:text/html,collect']);assert.equal(created,1);
 assert.equal(hooks.f3743(factory,['qr-form']),null);
 assert.throws(()=>hooks.f3745(()=>{throw Error('collect failed');},[]),/collect failed/);
 assert.equal(hooks.f3743(factory,['qr-form']),null,'failed collect restores QR suppression');
});

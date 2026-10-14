const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{qrDelivery,imageUrl}=require('../src/main/runtime/qr-delivery.cjs');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hAAAAABJRU5ErkJggg==';
test('popup QR hides panel copy and follows its matching booking panel; toggling restores panel',async()=>{
 const {EventEmitter}=require('node:events'),root=path.resolve(__dirname,'..'),events=[];
 const parent=new EventEmitter();parent.isDestroyed=()=>false;parent.getBounds=()=>({x:100,y:100,width:300,height:180});
 parent.webContents={getURL:()=>pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href+'?id=one',executeJavaScript:async()=>false,send:(channel,payload)=>events.push(payload)};
 const popup=new EventEmitter();let bounds={x:0,y:0,width:300,height:300};popup.isDestroyed=()=>false;popup.getBounds=()=>bounds;popup.setBounds=b=>{bounds=b;};
 const hook=qrDelivery({BrowserWindow:{getAllWindows:()=>[parent]},screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})}},root);
 hook.f3734(()=>true,[]);hook.f3743(()=>popup,['one']);await hook.f3740(async()=>true,[{imageBase64:png},'one']);
 assert.deepEqual(events,[{closed:true,formId:'one'}]);assert.equal(bounds.y,288);assert.equal(bounds.x,100);
 events.length=0;await hook.f4021(async()=>({ok:true}),[{},false]);assert.equal(events.length,1);assert.ok(events[0].dataUrl);assert.equal(events[0].formId,'one');
 popup.emit('closed');assert.equal(parent.listenerCount('move'),0);assert.equal(parent.listenerCount('resize'),0);
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

const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{qrDelivery,imageUrl}=require('../src/main/runtime/qr-delivery.cjs');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hAAAAABJRU5ErkJggg==';
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

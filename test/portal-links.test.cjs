const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('portal shortcuts accept only fixed roles from the local Tools window',async()=>{
 let handler;const urls=[],root=path.resolve(__dirname,'..');
 require('../src/main/runtime/portal-links.cjs').install({ipcMain:{handle:(_channel,value)=>handler=value},shell:{openExternal:async url=>urls.push(url)}},root);
 const local={sender:{getURL:()=>pathToFileURL(path.join(root,'src/renderer/tools.html')).href}};
 assert.deepEqual(await handler(local,'admin'),{ok:true});assert.deepEqual(urls,['https://nexus.vaidya-gpt.com/admin']);
 assert.deepEqual(await handler(local,'https://example.com'),{ok:false});assert.deepEqual(await handler({sender:{getURL:()=> 'https://example.com/tools.html'}},'seller'),{ok:false});assert.equal(urls.length,1);
});

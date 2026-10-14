const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {compareVersions,validateManifest,downloadVerified,install}=require('../src/main/runtime/updates.cjs');
const bytes=Buffer.from('verified updater'),item={url:'/downloads/Matrix-Updater-1.0.5.exe',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
test('updater validates same-origin exact version, bounded size and hash',()=>{
 assert.equal(compareVersions('1.0.10','1.0.5'),1);assert.equal(validateManifest({version:'1.0.5',updaterExe:item}).updater.bytes,bytes.length);
 for(const change of [{url:'https://evil.example/updater.exe'},{url:'/downloads/Matrix-Updater-1.0.4.exe'},{sha256:'invalid'},{bytes:100*1024*1024}])assert.throws(()=>validateManifest({version:'1.0.5',updaterExe:{...item,...change}}));
 assert.throws(()=>compareVersions('1.0.5;command','1.0.4'));
});
test('download verifies complete bytes and SHA before allowing installation',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-update-qa-')),file=path.join(folder,'update.exe');const meta=validateManifest({version:'1.0.5',updaterExe:item}).updater;
 const request=async()=>({ok:true,body:[bytes.subarray(0,3),bytes.subarray(3)]});
 try{await downloadVerified(meta,file,request);assert.deepEqual(fs.readFileSync(file),bytes);await assert.rejects(downloadVerified({...meta,sha256:'0'.repeat(64)},file,request));assert.equal(fs.existsSync(file),false);await assert.rejects(downloadVerified({...meta,bytes:1},file,request));assert.equal(fs.existsSync(file),false);}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('old versions see server release; offline is not up-to-date; settings persist and IPC is local',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-update-qa-')),handlers=new Map(),previous=globalThis.fetch;
 fs.writeFileSync(path.join(folder,'package.json'),JSON.stringify({version:'1.0.3'}));
 const electron={app:{getPath:()=>folder},BrowserWindow:{getAllWindows:()=>[]},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)}};
 try{globalThis.fetch=async()=>({ok:true,json:async()=>({version:'1.0.5',updaterExe:item})});const updater=install(electron,folder,{managedRelease:false});const status=await updater.check();assert.equal(status.available,true);assert.equal(status.latestVersion,'1.0.5');
 const event={sender:{getURL:()=>pathToFileURL(path.join(folder,'src/renderer/updates.html')).href}};
 assert.equal((await handlers.get('matrix:updates:settings')(event,true)).enabled,true);assert.equal((await updater.check()).autoUpdate,true);
 assert.equal((await handlers.get('matrix:updates:check')({sender:{getURL:()=> 'https://evil.example/updates.html'}})).ok,false);
 globalThis.fetch=async()=>{throw Error('offline')};assert.equal((await updater.check()).ok,false);
 assert.equal(await updater.applyOnStartup(),false);
 }finally{globalThis.fetch=previous;fs.rmSync(folder,{recursive:true,force:true});}
});

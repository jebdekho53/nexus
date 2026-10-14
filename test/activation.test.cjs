const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('managed release blocks login until own-server activation, stores sealed key, rejects external IPC',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-activation-')),root=path.resolve(__dirname,'..'),handlers=new Map(),windows=[];
 class Window{constructor(){windows.push(this);this.destroyed=false;}loadFile(file){this.url=pathToFileURL(file).href;}isDestroyed(){return this.destroyed;}show(){}close(){this.destroyed=true;}}
 const electron={app:{getPath:()=>directory,whenReady:async()=>{}},BrowserWindow:Window,ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},safeStorage:{isEncryptionAvailable:()=>true,encryptString:()=>Buffer.from('sealed'),decryptString:()=>''},shell:{openExternal:async()=>{}}};
 const oldFetch=global.fetch;let bodies=[];global.fetch=async(_url,options)=>{bodies.push(JSON.parse(options.body));return{ok:true,json:async()=>({license:{id:'test-license',expiresAt:new Date(Date.now()+86400000).toISOString()}})};};const originalInterval=global.setInterval;global.setInterval=()=>({unref(){}});
 try{
  const pending=require('../src/main/runtime/activation.cjs').requireActivation(electron,root);await new Promise(resolve=>setImmediate(resolve));
  electron.ipcMain.handle('app:login',async()=>({ok:true}));const trusted={sender:{getURL:()=>windows[0].url}},external={sender:{getURL:()=> 'https://example.com/activation.html'}};
  assert.equal((await handlers.get('app:login')(trusted)).ok,false);
  assert.equal((await handlers.get('matrix:activation:activate')(external,'test-key')).ok,false);assert.equal(bodies.length,0);
  assert.equal((await handlers.get('matrix:activation:activate')(trusted,'test-key')).ok,true);assert.equal((await handlers.get('app:login')(trusted)).ok,true);
  assert.equal(fs.readFileSync(path.join(directory,'matrix-activation.bin'),'utf8'),'sealed');assert.equal(bodies[0].key,'test-key');assert.match(bodies[0].device,/^[a-f0-9]{64}$/);await pending;
 }finally{global.fetch=oldFetch;global.setInterval=originalInterval;fs.rmSync(directory,{recursive:true,force:true});}
});
test('a saved release activation is decrypted only after Electron is ready and survives restart',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-restart-'));fs.writeFileSync(path.join(directory,'matrix-activation.bin'),'sealed');let ready=false,windows=0,verified=false;
 const electron={app:{getPath:()=>directory,whenReady:async()=>{ready=true;}},BrowserWindow:class{constructor(){windows++;}},ipcMain:{handle(){}},safeStorage:{decryptString:()=>{assert(ready,'safeStorage cannot decrypt before app readiness');return 'SyntheticSavedKey';}},shell:{openExternal(){}}};
 const oldFetch=global.fetch,oldInterval=global.setInterval;global.setInterval=()=>({unref(){}});global.fetch=async(url,options)=>{assert(url.endsWith('/verify'));assert.equal(JSON.parse(options.body).key,'SyntheticSavedKey');verified=true;return{ok:true,json:async()=>({license:{expiresAt:new Date(Date.now()+86400000).toISOString()}})};};
 try{await require('../src/main/runtime/activation.cjs').requireActivation(electron,path.resolve(__dirname,'..'));assert(verified);assert.equal(windows,0);}finally{global.fetch=oldFetch;global.setInterval=oldInterval;fs.rmSync(directory,{recursive:true,force:true});}
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('managed release blocks login until own-server activation, stores sealed key, rejects external IPC',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-activation-')),root=path.resolve(__dirname,'..'),handlers=new Map(),windows=[];
 class Window{constructor(){windows.push(this);this.destroyed=false;}loadFile(file){this.url=pathToFileURL(file).href;}isDestroyed(){return this.destroyed;}show(){}close(){this.destroyed=true;}}
 const electron={app:{getPath:()=>directory,whenReady:async()=>{}},BrowserWindow:Window,ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},safeStorage:{isEncryptionAvailable:()=>true,encryptString:()=>Buffer.from('sealed'),decryptString:()=>''},shell:{openExternal:async()=>{}}};
 const oldFetch=global.fetch;let bodies=[];global.fetch=async(_url,options)=>{bodies.push(JSON.parse(options.body));return{ok:true,json:async()=>({license:{id:'test-license',expiresAt:new Date(Date.now()+86400000).toISOString()}})};};const originalInterval=global.setInterval;global.setInterval=()=>({unref(){}});
 try{
  const pending=require('../src/main/runtime/activation.cjs').requireActivation(electron,root,{storageDirs:[directory]});await new Promise(resolve=>setImmediate(resolve));
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
 try{await require('../src/main/runtime/activation.cjs').requireActivation(electron,path.resolve(__dirname,'..'),{storageDirs:[directory]});assert(verified);assert.equal(windows,0);}finally{global.fetch=oldFetch;global.setInterval=oldInterval;fs.rmSync(directory,{recursive:true,force:true});}
});

test('activation survives a changed profile path and automatically rebinds the saved key',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-update-')),old=path.join(directory,'old'),next=path.join(directory,'next'),shared=path.join(directory,'shared');fs.mkdirSync(shared,{recursive:true});
 const device='a'.repeat(64);fs.writeFileSync(path.join(shared,'matrix-device'),device);fs.writeFileSync(path.join(shared,'matrix-activation.bin'),'encrypted-fixture');
 const requests=[];let windows=0;const previousFetch=global.fetch,previousInterval=global.setInterval;
 global.fetch=async(url,options)=>{requests.push({url,...JSON.parse(options.body)});return url.endsWith('/verify')?{ok:false,json:async()=>({error:'Device is not activated'})}:{ok:true,json:async()=>({license:{expiresAt:new Date(Date.now()+86400000).toISOString()}})}};global.setInterval=()=>({unref(){}});
 try{for(const profile of [old,next]){const electron={app:{whenReady:async()=>{},getPath:()=>profile},safeStorage:{decryptString:buffer=>{assert.equal(buffer.toString(),'encrypted-fixture');return 'synthetic-update-key'},encryptString:key=>{assert.equal(key,'synthetic-update-key');return Buffer.from('encrypted-fixture')}},ipcMain:{handle(){}},BrowserWindow:class{constructor(){windows++}},shell:{}};await require('../src/main/runtime/activation.cjs').requireActivation(electron,path.resolve(__dirname,'..'),{storageDirs:[profile,shared]});assert.equal(fs.readFileSync(path.join(profile,'matrix-device'),'utf8'),device);assert.equal(fs.readFileSync(path.join(profile,'matrix-activation.bin'),'utf8'),'encrypted-fixture');}assert.equal(windows,0);assert.equal(requests.length,4);for(const request of requests){assert.equal(request.device,device);assert.equal(request.key,'synthetic-update-key');}}
 finally{global.fetch=previousFetch;global.setInterval=previousInterval;fs.rmSync(directory,{recursive:true,force:true})}
});

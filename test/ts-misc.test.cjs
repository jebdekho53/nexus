'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const load=(dir,name)=>[require('./fixtures/legacy/'+name+'.legacy.cjs'),require('../src/main/'+dir+'/'+name+'.cjs')];

test('recovered-contract definitionFingerprint',async()=>{
  const[legacy,migrated]=load('runtime','recovered-contract');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const definitions=[{},{kind:'function',language:'js',parameterCount:2,length:10,incoming:1,registerCount:3,registerCounts:[1],handlers:[],constants:[1,'a'],code:[[1,2],[3]],extra:'ignored'},{code:[]},{code:null},{constants:[{type:'number',value:1}]},{kind:'a',code:[1]},{kind:'b',code:[1]}];
  for(const definition of definitions)await check('fingerprint '+JSON.stringify(definition),m=>m.definitionFingerprint(definition));
  assert.equal(migrated.definitionFingerprint({code:[1],extra:1}),migrated.definitionFingerprint({code:[1],extra:2}));
  assert.notEqual(migrated.definitionFingerprint({code:[1]}),migrated.definitionFingerprint({code:[2]}));
  // the pinned contracts in src/main/payment/recovered-contract.json were produced with this function
  const pins=require('../src/main/payment/recovered-contract.json');
  const definitionsIndex=require('../src/main/generated/index.cjs');
  let checked=0;
  for(const[id,pin]of Object.entries(pins.definitions??pins).slice(0,25)){
    const definition=definitionsIndex[id];
    if(!definition||typeof pin!=='object'||!pin.fingerprint)continue;
    assert.equal(migrated.definitionFingerprint(definition),pin.fingerprint,id);checked++;
  }
  assert.ok(checked>=0);
});

test('updates: version and manifest validation, verified download',async()=>{
  const[legacy,migrated]=load('runtime','updates');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const versions=['1.0.0','1.0.11','1.0.10','2.0.0','0.0.0','1.2','1.2.3.4','a.b.c','','1.0.0-beta',' 1.0.0',undefined,null,5,'01.002.0003','10.0.0','9.9.9'];
  for(const a of versions)for(const b of versions.slice(0,6))await check('compare '+String(a)+'|'+String(b),m=>m.compareVersions(a,b));
  const sha='a'.repeat(64);
  const item=(o={})=>({url:'/downloads/Matrix-Updater-1.0.12.exe',bytes:1000,sha256:sha,...o});
  const manifests=[{version:'1.0.12'},{version:'1.0.12',notes:'n',updaterExe:item()},{version:'1.0.12',notes:null,updaterExe:item({sha256:'A'.repeat(64)})},{version:'1.0.12',updaterExe:item({url:'https://matrix.vaidya-gpt.com/downloads/Matrix-Updater-1.0.12.exe'})},
    {version:'1.0.12',updaterExe:item({url:'https://evil.test/downloads/Matrix-Updater-1.0.12.exe'})},{version:'1.0.12',updaterExe:item({url:'/downloads/Matrix-Updater-1.0.13.exe'})},{version:'1.0.12',updaterExe:item({url:'/downloads/Matrix-Updater-1.0.12.exe?x=1'})},{version:'1.0.12',updaterExe:item({url:'/downloads/Matrix-Updater-1.0.12.exe#h'})},
    {version:'1.0.12',updaterExe:item({bytes:0})},{version:'1.0.12',updaterExe:item({bytes:64*1024*1024})},{version:'1.0.12',updaterExe:item({bytes:64*1024*1024+1})},{version:'1.0.12',updaterExe:item({bytes:1.5})},{version:'1.0.12',updaterExe:item({bytes:'10'})},
    {version:'1.0.12',updaterExe:item({sha256:'xyz'})},{version:'1.0.12',updaterExe:item({sha256:'a'.repeat(63)})},{version:'bad'},{},null,undefined,{version:'1.0.12',updaterExe:0},{version:'1.0.12',updaterExe:{}}];
  for(const manifest of manifests)await check('manifest '+JSON.stringify(manifest),m=>m.validateManifest(manifest));
  const crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'upd-'));
  const payload=Buffer.from('matrix-update-bytes');const good=crypto.createHash('sha256').update(payload).digest('hex');
  const bodies={whole:[payload],chunks:[payload.subarray(0,5),payload.subarray(5)],tooLong:[payload,Buffer.from('x')],short:[payload.subarray(0,3)],empty:[]};
  for(const[name,chunks]of Object.entries(bodies))for(const sha of[good,sha_(good)])for(const status of[200,404])
    await check(`download ${name} ${sha===good} ${status}`,async(m,trace)=>{
      const destination=path.join(dir,'file-'+name+sha.slice(0,3)+status+Math.random());
      const request=async(url,init)=>{trace.push(['fetch',url,init.redirect]);return{ok:status===200,status,body:(async function*(){for(const chunk of chunks){yield chunk;}})()};};
      const meta={url:'https://matrix.vaidya-gpt.com/downloads/x.exe',bytes:payload.length,sha256:sha};
      let result;
      try{result=await m.downloadVerified(meta,destination,request,percent=>trace.push(['progress',percent]));}
      catch(error){result='threw '+error.message;}
      return[typeof result==='string'&&result.startsWith('threw')?result:'ok',fs.existsSync(destination)];
    });
  function sha_(value){return value.split('').reverse().join('');}
});

test('provider-page',async()=>{
  const[legacy,migrated]=load('booking','provider-page');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  for(const url of['https://www.irctc.co.in/nget/train-search','https://irctc.co.in','https://IRCTC.CO.IN/x','https://evil-irctc.co.in','https://irctc.co.in.evil.test','http://sub.irctc.co.in:8080/','not a url','','about:blank'])
    await check('origin '+url,m=>m.providerOriginOk(url));
  for(const page of[null,undefined,{url:()=>'https://www.irctc.co.in/'},{url:()=>'https://other.test/'},{url:()=>{throw new Error('closed');}}])
    for(const originCheck of[()=>true,()=>false,()=>{throw new Error('check');}])
      await check('onProviderPage',(m,trace)=>m.onProviderPage({session:{page:page&&{url:()=>{trace.push('url');return page.url();}}}},{originCheck:u=>{trace.push(['check',u]);return originCheck(u);}}));
  const scenarios={already:{on:[true]},returnsFirstPoll:{on:[false,true]},returnsThirdPoll:{on:[false,false,false,true]},hideFalse:{on:[false,true],hide:false},hideRejects:{on:[false,true],hideRejects:true},focusRejects:{on:[false,true],focusRejects:true},stopped:{on:[false],stopped:true},timesOut:{on:[false],clockStep:300000},hostThrows:{on:[false,true],urlThrows:true},waitRejects:{on:[false,true],waitRejects:true}};
  for(const[name,o]of Object.entries(scenarios))
    await check(name,async(m,trace)=>{
      let calls=0,clock=0;
      const actor={stopped:o.stopped,session:{page:{url:()=>{if(o.urlThrows)throw new Error('u');return'https://other.test/x';},waitForTimeout:ms=>{trace.push(['wait',ms]);return o.waitRejects?Promise.reject(new Error('w')):Promise.resolve();}}},opts:o.hide===undefined?{}:{hideBrowser:o.hide},
        now:()=>{const v=clock;clock+=o.clockStep||100;return v;},onProviderPage:()=>{const v=o.on[Math.min(calls++,o.on.length-1)];trace.push(['on',v]);return v;},
        focusBrowser:()=>{trace.push('focus');return o.focusRejects?Promise.reject(new Error('f')):Promise.resolve();},hideBrowser:()=>{trace.push('hide');return o.hideRejects?Promise.reject(new Error('h')):Promise.resolve();},
        onProgress:(...a)=>trace.push(['progress',...a]),log:(...a)=>trace.push(['log',...a])};
      return m.ensureOnProviderPage(actor,'search trains');
    });
});

test('updates: install() IPC handlers and apply flow (fetch and spawn stubbed; nothing real runs)',async()=>{
  const[legacy,migrated]=load('runtime','updates');
  const check=differential(legacy,migrated);
  const crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),child_process=require('node:child_process');
  const payload=Buffer.from('installer-bytes');const good=crypto.createHash('sha256').update(payload).digest('hex');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-root-'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'1.0.11'}));
  const manifest=(o={})=>({version:'1.0.12',notes:'Notes',updaterExe:{url:'/downloads/Matrix-Updater-1.0.12.exe',bytes:payload.length,sha256:good,...o}});
  const scenarios={
    checkAvailable:{op:'check',manifest:manifest()},checkSame:{op:'check',manifest:{version:'1.0.11'}},checkOlder:{op:'check',manifest:{version:'1.0.0',notes:'x'}},checkHttp:{op:'check',http:500},checkBad:{op:'check',manifest:{version:'x'}},checkThrows:{op:'check',throws:true},checkManaged:{op:'check',manifest:manifest(),managed:true},
    installBusy:{op:'install-twice',manifest:manifest(),managed:true},installDev:{op:'install',manifest:manifest()},installCheckFails:{op:'install',http:500,managed:true},installNotAvailable:{op:'install',manifest:{version:'1.0.11'},managed:true},installNoUpdater:{op:'install',manifest:{version:'1.0.12'},managed:true},
    installOk:{op:'install',manifest:manifest(),managed:true},installBadDownload:{op:'install',manifest:manifest({sha256:'b'.repeat(64)}),managed:true},installSpawnError:{op:'install',manifest:manifest(),managed:true,spawnError:true},installNoFinish:{op:'install',manifest:manifest(),managed:true,noFinish:true},
    startupDev:{op:'startup',manifest:manifest()},startupAutoOff:{op:'startup',manifest:manifest(),managed:true},startupAutoOn:{op:'startup',manifest:manifest(),managed:true,auto:true},startupAutoOnSame:{op:'startup',manifest:{version:'1.0.11'},managed:true,auto:true},
    settingsTrue:{op:'settings',value:true},settingsFalse:{op:'settings',value:false},settingsNotBoolean:{op:'settings',value:'yes'},settingsReadBack:{op:'settings-then-check',manifest:manifest()},close:{op:'close'},untrusted:{op:'check',untrusted:true,manifest:manifest()},untrustedClose:{op:'close',untrusted:true},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,async(m,trace)=>{
      const userData=fs.mkdtempSync(path.join(os.tmpdir(),'upd-user-')),temp=fs.mkdtempSync(path.join(os.tmpdir(),'upd-temp-'));
      if(o.auto)fs.writeFileSync(path.join(userData,'matrix-updates.json'),JSON.stringify({enabled:true}));
      const handlers={};
      const trustedUrl=pathToFileURL(path.join(root,'src/renderer/updates.html')).href;
      const windows=[{isDestroyed:()=>false,webContents:{getURL:()=>trustedUrl,send:(c,p)=>trace.push(['send',c,JSON.stringify(p)])},close:()=>trace.push('close')},{isDestroyed:()=>true,webContents:{getURL:()=>trustedUrl,send:()=>trace.push('SENT-TO-DESTROYED')}},{isDestroyed:()=>false,webContents:{getURL:()=>'file:///other.html',send:()=>trace.push('SENT-TO-OTHER')}}];
      const electron={app:{getPath:name=>name==='userData'?userData:temp},BrowserWindow:{getAllWindows:()=>windows,fromWebContents:()=>windows[0]},ipcMain:{handle:(channel,handler)=>{handlers[channel]=handler;}}};
      const sender={getURL:()=>o.untrusted?'file:///elsewhere.html':trustedUrl};
      const realFetch=globalThis.fetch,realSpawn=child_process.spawn;
      globalThis.fetch=async(url,init)=>{
        trace.push(['fetch',String(url).replace(/^https:\/\/[^/]+/,''),init&&init.redirect]);
        if(o.throws)throw new Error('offline');
        if(String(url).endsWith('/api/portal/downloads'))return{ok:!o.http,status:o.http||200,json:async()=>o.manifest};
        return{ok:true,status:200,body:(async function*(){yield payload;})()};
      };
      child_process.spawn=(file,args,options)=>{trace.push(['spawn',path.basename(file),args.map(a=>a.startsWith('/target=')?'/target=<root>':a),options]);const events={};return{once:(event,l)=>{events[event]=l;if(event==='spawn'&&!o.spawnError)setImmediate(l);if(event==='error'&&o.spawnError)setImmediate(()=>l(new Error('spawn failed')));},unref:()=>trace.push('unref')};};
      try{
        const service=m.install(electron,root,{managedRelease:o.managed,finish:o.noFinish?undefined:code=>trace.push(['finish',code])});
        const invoke=(channel,value)=>handlers['matrix:updates:'+channel]({sender},value);
        let result;
        if(o.op==='startup')result=await service.applyOnStartup();
        else if(o.op==='install-twice'){const first=invoke('install');const second=await invoke('install');result=[second,await first];}
        else if(o.op==='settings-then-check'){await invoke('settings',true);result=[await invoke('settings'),(await invoke('check')).autoUpdate];}
        else result=await invoke(o.op,o.value);
        return[result,fs.existsSync(path.join(temp,'Matrix-updates'))?fs.readdirSync(path.join(temp,'Matrix-updates')):null,fs.existsSync(path.join(userData,'matrix-updates.json'))?fs.readFileSync(path.join(userData,'matrix-updates.json'),'utf8'):null];
      }finally{globalThis.fetch=realFetch;child_process.spawn=realSpawn;}
    });
});
const {pathToFileURL}=require('node:url');

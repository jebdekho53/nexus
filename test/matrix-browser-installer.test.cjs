'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {create,metadata}=require('../src/main/runtime/matrix-browser-installer.cjs');
test('unverified existing marker cannot claim ready; corrupted download leaves prior browser untouched',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-install-unit-'));const target=path.join(base,'Browser');fs.mkdirSync(path.join(target,'ShardX-Windows'),{recursive:true});fs.writeFileSync(path.join(target,'ShardX-Windows/chrome.exe'),'old-browser');fs.writeFileSync(path.join(target,'runtime-ready.json'),JSON.stringify({ready:true}));
 let downloads=0,extracted=0;const installer=create({base,fetcher:async()=>{downloads++;return new Response('invalid archive');},extract:async()=>extracted++});
 try{assert.equal(await installer.ready(),false);const [a,b]=await Promise.all([installer.install(),installer.install()]);assert.equal(a.ok,false);assert.equal(b.ok,false);assert.equal(downloads,1);assert.equal(extracted,0);assert.equal(installer.state.phase,'error');assert.equal(fs.readFileSync(path.join(target,'ShardX-Windows/chrome.exe'),'utf8'),'old-browser');assert.equal(fs.readdirSync(base).length,1);assert(metadata.url.startsWith('https://matrix.vaidya-gpt.com/downloads/'));}finally{fs.rmSync(base,{recursive:true,force:true});}
});
test('download failure is reported and staging artifacts are cleaned',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-install-network-'));
 try{const installer=create({base,fetcher:async()=>{throw Error('Offline');}});assert.deepEqual(await installer.install(),{ok:false,error:'Offline'});assert.equal(fs.readdirSync(base).length,0);}finally{fs.rmSync(base,{recursive:true,force:true});}
});

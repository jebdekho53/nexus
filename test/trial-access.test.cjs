'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {create}=require('../src/main/runtime/trial-access.cjs');
const {createTrials}=require('../services/control-plane/trials.cjs');
test('desktop trial reserves once, captures real completion, persists and reconciles before new bookings',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-trial-access-'));const identity={schema:1,hardware:'a'.repeat(64),virtual:false};
 const backend=createTrials({directory});const calls=[];
 const electron={app:{getPath:()=>directory},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()}};
 const fetcher=async(url,options)=>{const b=JSON.parse(options.body),op=url.split('/').at(-1);calls.push(op);try{const args=op==='start'?[b.identity]:op==='verify'?[b.token,b.identity]:op==='reserve'?[b.token,b.identity,b.requestId]:op==='complete'?[b.token,b.identity,b.reservation,b.pnr]:[b.token,b.identity,b.reservation];return{ok:true,json:async()=>backend[op](...args)};}catch(e){return{ok:false,json:async()=>({error:e.message})};}};
 try{
  const trial=create(electron,directory,{fetcher,identityProvider:()=>identity});await trial.start();
  const actor={};
  await trial.run(()=>trial.hooks.f2082(async()=>{await trial.hooks.f2233(async()=>({success:true}),[{pnr:'1234567890'}],actor);return{success:true};},[],actor));
  assert.equal(trial.summary.pnrUsed,1);assert.equal(calls.filter(x=>x==='complete').length,1);
  const restored=create(electron,directory,{fetcher,identityProvider:()=>identity});await restored.verify();assert.equal(restored.summary.pnrUsed,1);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {create,hooks,bookingFor}=require('../src/main/runtime/booking-report.cjs');
test('success reporting is encrypted/retried, deduplicates, preserves account ownership and never blocks the ticket',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-reporter-'));let online=false;const posts=[];
 const electron={app:{getPath:()=>directory},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(b=>b^42),decryptString:b=>Buffer.from(b.map(v=>v^42)).toString()}};
 const fetcher=async(url,options)=>{posts.push(JSON.parse(options.body));if(!online)throw Error('Offline');return{ok:true};};
 const token=id=>Buffer.from(JSON.stringify({licenseId:id})).toString('base64url')+'.fixture';
 try{
  const service=create(electron,{fetcher});service.setSession(token('client-A'));await service.flush();
  const actor={},h=hooks();h.f2161(()=>{},[{username:'IRCTC_A',origin:'AAA',destination:'BBB',password:'DO-NOT-STORE',passengers:[{name:'DO-NOT-STORE'}]}],actor);
  assert.equal(h.f2233(()=> 'ticket-visible',[{pnr:'1234567890',password:'DO-NOT-STORE'}],actor),'ticket-visible');await service.flush();assert.equal(service.pendingCount,1);
  assert.equal(bookingFor(actor,{}).irctcUsername,'IRCTC_A');
  assert(!fs.readFileSync(path.join(directory,'booking-report-queue.bin'),'utf8').includes('1234567890'));
  const restored=create(electron,{fetcher});restored.setSession(token('client-B'));await restored.flush();online=true;await restored.flush();
  assert.equal(restored.pendingCount,0);assert.equal(posts.at(-1).bookingToken,token('client-A'));
  assert.equal(posts.at(-1).booking.irctcUsername,'IRCTC_A');assert(!JSON.stringify(posts).includes('DO-NOT-STORE'));
  const broken=create({...electron,safeStorage:{...electron.safeStorage,isEncryptionAvailable:()=>false}},{fetcher});broken.setSession(token('client-B'));
  assert.equal(h.f2233(()=> 'still-visible',[{pnr:'1234567891'}],actor),'still-visible');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

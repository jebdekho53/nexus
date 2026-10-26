'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createLicensing}=require('./licensing.cjs');
const {snapshot,createBookingLedger}=require('./booking-ledger.cjs');
test('reporting tokens bind bookings to the server-owned client/seller, deduplicate, reject forged sessions and omit passwords',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-network-'));const licensing=createLicensing({directory,adminPassword:'synthetic-admin'});
 const paid=licensing.issue({customer:'Direct paid',accessType:'paid'}),free=licensing.issue({customer:'Direct free',accessType:'free'});
 const server=http.createServer((req,res)=>licensing.handle(req,res,new URL(req.url,'http://localhost')));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 async function req(route,body,cookie){const r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  assert.equal((await req('admin/network')).status,401);
  const admin=(await req('admin/login',{password:'synthetic-admin'})).cookie;
  const seller=(await req('admin/seller-create',{name:'Owner A',username:'owner_a',password:'synthetic-seller'},admin)).data.seller;
  const sellerSession=(await req('seller/login',{username:'owner_a',password:'synthetic-seller'})).cookie;
  const issued=(await req('seller/issue',{customer:'Owned client',plan:'monthly'},sellerSession)).data;
  await req('admin/manage',{id:issued.license.id,action:'paid'},admin);
  const activated=await req('license/activate',{key:issued.key,device:'device-A'});assert(activated.data.bookingToken);
  const booking={pnr:'1234567890',irctcUsername:'test_irctc',trainNumber:'12345',password:'DO-NOT-STORE',passengers:[{name:'DO-NOT-STORE'}],licenseId:free.license.id,sellerId:'forged-owner'};
  assert.equal((await req('license/booking-success',{bookingToken:activated.data.bookingToken+'x',booking})).status,400);
  assert.equal((await req('license/booking-success',{bookingToken:activated.data.bookingToken,booking})).status,200);
  assert.equal((await req('license/booking-success',{bookingToken:activated.data.bookingToken,booking})).data.duplicate,true);
  const network=(await req('admin/network',null,admin)).data;
  assert.equal(network.summary.paid,2);assert.equal(network.summary.free,1);assert.equal(network.totalBookings,1);
  assert.equal(network.bookings[0].sellerId,seller.id);assert.equal(network.bookings[0].licenseId,issued.license.id);assert.equal(network.bookings[0].irctcUsername,'test_irctc');
  assert.equal(network.clients.find(c=>c.id===paid.license.id).pnrLimit,null);
  assert(!JSON.stringify(network).includes('passwordHash'));assert(!JSON.stringify(network).includes(issued.key));
  assert(!fs.readFileSync(path.join(directory,'registry.json'),'utf8').includes('DO-NOT-STORE'));
  assert.equal((await req('admin/network',null,sellerSession)).status,401);
  assert.equal((await req('seller/manage',{id:issued.license.id,action:'access-type',accessType:'free'},sellerSession)).status,400);
  assert.equal((await req('admin/manage',{id:paid.license.id,action:'access-type',accessType:'free'},admin)).status,200);
  assert.equal((await req('admin/network',null,admin)).data.summary.free,2);
  const restored=createLicensing({directory});assert.equal(restored.list().find(c=>c.id===paid.license.id).accessType,'free');
 }finally{await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
});
test('legacy keys are not invented as purchased; expired reporting token denied; trial PNR balance retained',()=>{
 const registry={signingKey:'a'.repeat(64),sellers:[],keys:[{id:'legacy',customer:'Legacy',paid:true,devices:['device'],maxDevices:1,expiresAt:new Date(86400000).toISOString()}]};let now=1000;
 const ledger=createBookingLedger({registry,persist(){},now:()=>now}),token=ledger.token('legacy','device');
 ledger.record(token,{pnr:'1234567890'});now+=8*86400000;assert.throws(()=>ledger.record(token,{pnr:'1234567891'}),/expired/);
 const result=snapshot(registry,[{id:'trial1',pnrUsed:2,pnrRemaining:1,bookings:[]}],now);
 assert.equal(result.clients[0].accessType,'not-recorded');assert.equal(result.summary.trialPnrUsed,2);assert.equal(result.trials[0].pnrRemaining,1);
 assert.equal(result.owners[0].notRecorded,1);
});

'use strict';
const crypto=require('node:crypto');
const clean=(value,max=80)=>typeof value==='string'?value.trim().slice(0,max):'';
function bookingDetails(input={}){
 const pnr=String(input.pnr||'').trim();if(!/^\d{10}$/.test(pnr))throw Error('Successful PNR required');
 const result={pnr};
 for(const [key,max]of Object.entries({irctcUsername:64,trainNumber:12,origin:30,destination:30,journeyDate:30,travelClass:12,quota:16,formId:80})){
  const value=clean(input[key],max);if(value)result[key]=value;
 }
 if(input.timing&&typeof input.timing==='object'){
  const timing={};
  for(const key of ['startedAt','submittedAt','paymentReadyAt','qrAt','confirmedAt','targetAt']){const v=input.timing[key];if(Number.isSafeInteger(v)&&v>=1577836800000&&v<=4102444800000)timing[key]=v;}
  const offset=input.timing.clockOffsetMs;if(Number.isFinite(offset)&&Math.abs(offset)<3600000)timing.clockOffsetMs=offset;
  const retries=input.timing.highLoadRetries;if(Number.isSafeInteger(retries)&&retries>=0&&retries<=100000)timing.highLoadRetries=retries;
  for(const key of ['browser','loginMode']){const v=clean(input.timing[key],40);if(v)timing[key]=v;}
  if(Object.keys(timing).length)result.timing=timing;
 }
 return result;
}
function accessType(k){return k.paid===false?'unpaid':['paid','free'].includes(k.accessType)?k.accessType:k.paidAt?'paid':'not-recorded';}
function snapshot(registry,trials=[],now=Date.now()){
 const all=registry.bookings||[],counts=new Map();for(const b of all)counts.set(b.licenseId,(counts.get(b.licenseId)||0)+1);
 const clients=registry.keys.map(k=>({id:k.id,customer:k.customer,sellerId:k.sellerId||null,hint:k.hint,accessType:accessType(k),expiresAt:k.expiresAt,daysRemaining:Math.max(0,Math.ceil((Date.parse(k.expiresAt)-now)/86400000)),status:k.revoked?'REVOKED':k.pending?'PENDING':k.paid===false?'UNPAID':k.sellerId&&!registry.sellers?.find(s=>s.id===k.sellerId)?.enabled?'SELLER_DISABLED':Date.parse(k.expiresAt)<=now?'EXPIRED':'ACTIVE',devicesUsed:k.devices.length,maxDevices:k.maxDevices,pnrUsed:counts.get(k.id)||0,pnrLimit:null,lastIp:k.deviceAccess?.at(-1)?.lastIp||null}));
 const stats=items=>({total:items.length,free:items.filter(c=>c.accessType==='free').length,paid:items.filter(c=>c.accessType==='paid').length,unpaid:items.filter(c=>c.accessType==='unpaid').length,notRecorded:items.filter(c=>c.accessType==='not-recorded').length,active:items.filter(c=>c.status==='ACTIVE').length,bookings:items.reduce((n,c)=>n+c.pnrUsed,0)});
 const owners=[{id:null,name:'Admin direct clients',enabled:true,...stats(clients.filter(k=>!k.sellerId))},...(registry.sellers||[]).map(s=>({id:s.id,name:s.name,username:s.username,enabled:s.enabled,balance:s.balance,...stats(clients.filter(k=>k.sellerId===s.id))}))];
 const keyMap=new Map(clients.map(k=>[k.id,k]));
 const bookings=all.map(b=>({...b,customer:keyMap.get(b.licenseId)?.customer||'Unknown client',sellerId:keyMap.get(b.licenseId)?.sellerId||null,sellerName:owners.find(o=>o.id===(keyMap.get(b.licenseId)?.sellerId||null))?.name||'Unknown seller'}));
 const trialBookings=trials.flatMap(t=>(t.bookings||[]).map(b=>({...b,trialId:t.id,customer:'Trial '+t.id.slice(0,8),sellerId:null,sellerName:'Unassigned trial',accessType:'trial'})));
 return{generatedAt:new Date(now).toISOString(),owners,clients,trials,summary:{...stats(clients),trials:trials.length,trialPnrUsed:trials.reduce((n,t)=>n+t.pnrUsed,0)},bookings:[...bookings,...trialBookings].sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)).slice(0,500),totalBookings:bookings.length+trialBookings.length,historyLimit:500};
}
function createBookingLedger({registry,persist,now=Date.now}){
 registry.bookings??=[];
 const sign=value=>crypto.createHmac('sha256',registry.signingKey).update('matrix-booking-v1:'+value).digest('base64url');
 function token(licenseId,device){const payload=Buffer.from(JSON.stringify({licenseId,device,expiresAt:now()+7*86400000})).toString('base64url');return payload+'.'+sign(payload);}
 function record(value,details){
  const [payload,sig,extra]=String(value||'').split('.'),expected=sign(payload||'');
  if(extra||!payload||!sig||sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw Error('Invalid booking session');
  const auth=JSON.parse(Buffer.from(payload,'base64url').toString()),key=registry.keys.find(k=>k.id===auth.licenseId);
  if(!key||!key.devices.includes(auth.device)||!Number.isFinite(auth.expiresAt)||auth.expiresAt<=now())throw Error('Booking session expired or device no longer registered');
  const booking=bookingDetails(details),existing=registry.bookings.find(b=>b.licenseId===key.id&&b.pnr===booking.pnr);
  if(existing)return{ok:true,duplicate:true};
  registry.bookings.push({id:crypto.randomUUID(),licenseId:key.id,device:auth.device,...booking,receivedAt:new Date(now()).toISOString(),source:'desktop-reported'});persist();return{ok:true};
 }
 return{token,record};
}
module.exports={bookingDetails,accessType,snapshot,createBookingLedger};

'use strict';
const fs=require('node:fs'),path=require('node:path');
const jobs=new WeakMap();let current;
const text=(v,max=80)=>typeof v==='string'?v.trim().slice(0,max):'';
function bookingFor(actor,booking={}){
 const job=actor&&jobs.get(actor)||{},result={pnr:String(booking.pnr||'').trim()};
 for(const [key,max]of Object.entries({irctcUsername:64,trainNumber:12,origin:30,destination:30,journeyDate:30,travelClass:12,quota:16,formId:80})){
  const value=text(booking[key],max)||text(job[key],max);if(value)result[key]=value;
 }
 return result;
}
function remember(actor,job){if(actor&&typeof actor==='object'&&job&&typeof job==='object')jobs.set(actor,{irctcUsername:text(job.username||job.irctcUsername,64),trainNumber:text(job.trainNumber||job.trainNo,12),origin:text(job.origin,30),destination:text(job.destination,30),journeyDate:text(job.journeyDate||job.date,30),travelClass:text(job.travelClass||job.class,12),quota:text(job.quota,16),formId:text(job.formId||job.id,80)});}
function licenseId(token){try{return JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString()).licenseId;}catch{return null;}}
function create(electron,{fetcher=globalThis.fetch,log=()=>{}}={}){
 const file=path.join(electron.app.getPath('userData'),'booking-report-queue.bin');let pending=[],session=null,flushing;
 try{pending=JSON.parse(electron.safeStorage.decryptString(fs.readFileSync(file)));if(!Array.isArray(pending))pending=[];}catch{}
 const save=()=>{if(!electron.safeStorage.isEncryptionAvailable())throw Error('Secure booking history storage unavailable');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,electron.safeStorage.encryptString(JSON.stringify(pending)),{mode:0o600});};
 const service={
  setSession(token){session=typeof token==='string'&&licenseId(token)?token:null;if(session){for(const item of pending)if(licenseId(item.bookingToken)===licenseId(session))item.bookingToken=session;try{save();}catch{log('booking-report-storage-error');}void service.flush();}},
  enqueue(booking){if(!session||!/^\d{10}$/.test(booking.pnr))return;if(pending.some(p=>licenseId(p.bookingToken)===licenseId(session)&&p.booking.pnr===booking.pnr))return;pending.push({bookingToken:session,booking});save();void service.flush();},
  flush(){if(flushing)return flushing;flushing=(async()=>{for(const item of [...pending]){try{const response=await fetcher('https://matrix.vaidya-gpt.com/api/license/booking-success',{method:'POST',headers:{'Content-Type':'application/json','x-matrix-client':'desktop'},body:JSON.stringify(item),signal:AbortSignal.timeout(10000)});if(!response.ok)break;pending=pending.filter(p=>p!==item);save();}catch{log('booking-report-pending');break;}}})().finally(()=>{flushing=null;});return flushing;},
  get pendingCount(){return pending.length;},
 };
 const timer=setInterval(()=>{if(session)void service.flush();},60000);timer.unref?.();
 current=service;return service;
}
function hooks(){return{
 f2161:(original,args,actor)=>{remember(actor,args[0]);return original(...args);},
 f2172:(original,args,actor)=>{remember(actor,args[0]);return original(...args);},
 f2233:(original,args,actor)=>{try{current?.enqueue(bookingFor(actor,args[0]));}catch{/* A completed ticket must still be shown if reporting storage fails. */}return original(...args);},
};}
module.exports={create,hooks,bookingFor};

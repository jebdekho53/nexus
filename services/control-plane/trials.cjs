'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {clientAddress,recordAccess}=require('./client-address.cjs');
const DAYS_MS=2*86400000,PNR_LIMIT=3;
function createTrials({directory,now=Date.now,adminAuthenticated=()=>false,blockedIdentity=()=>false}={}){
 const file=path.join(directory,'trials.json');fs.mkdirSync(directory,{recursive:true});
 let db=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{secret:crypto.randomBytes(32).toString('hex'),trials:[]};
 const persist=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(db),{mode:0o600});fs.renameSync(file+'.tmp',file);};
 const hash=value=>crypto.createHmac('sha256',db.secret).update(value).digest('hex');
 const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
 function identity(input){
  if(blockedIdentity(input))throw Error('This device has been blocked by the administrator');
  if(!input||input.schema!==1||input.virtual===true)throw Error('Automatic trial is unavailable on virtual machines; contact your seller for a key.');
  const parts={};for(const name of ['hardware','board','os'])if(/^[a-f0-9]{64}$/.test(input[name]||''))parts[name]=input[name];
  if(!parts.hardware)throw Error('Stable hardware identity unavailable; contact your seller for a key.');
  return parts;
 }
 function token(t){const p=Buffer.from(JSON.stringify({id:t.id,hardware:t.identity.hardware,expiresAt:t.expiresAt})).toString('base64url');return p+'.'+hash(p);}
 function status(t){return{id:t.id,kind:'trial',expiresAt:new Date(t.expiresAt).toISOString(),pnrLimit:PNR_LIMIT,pnrUsed:t.pnrs.length,pnrRemaining:Math.max(0,PNR_LIMIT-t.pnrs.length),active:now()<t.expiresAt&&t.pnrs.length<PNR_LIMIT};}
 function authenticated(value,input){
  const parts=identity(input),[payload,sig,extra]=String(value||'').split('.');
  if(!payload||!sig||extra||!equal(sig,hash(payload)))throw Error('Invalid trial session.');
  let parsed;try{parsed=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{throw Error('Invalid trial session.');}
  const t=db.trials.find(t=>t.id===parsed.id);
  if(!t||!equal(t.identity.hardware,parts.hardware))throw Error('Trial belongs to a different device.');
  return t;
 }
 function requireActive(t){if(!status(t).active)throw Error('Trial finished. Purchase a Matrix key from your seller.');}
 function start(input){
  const parts=identity(input);
  let t=db.trials.find(t=>t.identity.hardware===parts.hardware||parts.board&&t.identity.board===parts.board||parts.os&&t.identity.os===parts.os);
  if(!t){t={id:crypto.randomUUID(),identity:parts,startedAt:now(),expiresAt:now()+DAYS_MS,pnrs:[],reservations:[]};db.trials.push(t);persist();}
  // Matching a secondary identifier cannot authorize a different machine.
  if(t.identity.hardware!==parts.hardware)throw Error('This device has an existing trial identity. Contact your seller.');
  requireActive(t);return{token:token(t),trial:status(t)};
 }
 function verify(value,input){const t=authenticated(value,input);requireActive(t);return{trial:status(t)};}
 function reserve(value,input,requestId){
  const t=authenticated(value,input);requireActive(t);
  if(!/^[a-f0-9-]{36}$/i.test(requestId||''))throw Error('Invalid run identifier.');
  const same=t.reservations.find(r=>r.id===requestId);if(same)return{reservation:same.id,trial:status(t)};
  // Paired runs can proceed together. Successful distinct PNRs share the trial
  // allowance; once exhausted, reject new runs but reconcile all authorized ones.
  t.reservations.push({id:requestId,at:now(),closed:false});persist();return{reservation:requestId,trial:status(t)};
 }
 function complete(value,input,reservation,pnr,booking={}){
  // Finalize an already-authorized payment even after trial time/limit ends.
  const t=authenticated(value,input),r=t.reservations.find(r=>r.id===reservation);
  if(!r)throw Error('Unknown trial booking.');
  if(!/^\d{10}$/.test(String(pnr||'')))throw Error('A successful PNR is required.');
  const digest=hash('pnr:'+pnr);
  if(r.pnrHash&&r.pnrHash!==digest)throw Error('Booking already finalized.');
  if(r.closed&&!r.pnrHash)throw Error('Booking was already released.');
  if(!t.pnrs.includes(digest))t.pnrs.push(digest);
  r.closed=true;r.pnrHash=digest;
  t.bookings??=[];
  if(!t.bookings.some(b=>b.pnr===String(pnr)))t.bookings.push({...require('./booking-ledger.cjs').bookingDetails({...booking,pnr:String(pnr)}),receivedAt:new Date(now()).toISOString(),source:'desktop-reported'});
  persist();return{trial:status(t)};
 }
 function release(value,input,reservation){const t=authenticated(value,input),r=t.reservations.find(r=>r.id===reservation);if(!r)throw Error('Unknown trial booking.');if(!r.pnrHash){r.closed=true;persist();}return{trial:status(t)};}
 const attempts=new Map();
 async function handle(req,res,url){
  if(url.pathname==='/api/admin/trials'){
   res.writeHead(adminAuthenticated(req)?200:401,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify(adminAuthenticated(req)?{trials:listAdmin()}:{error:'Administrator login required'}));return true;
  }
  if(!url.pathname.startsWith('/api/trial/'))return false;
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='POST'){send(405,{error:'POST required'});return true;}
  try{
   const remote=req.socket.remoteAddress||'unknown',minute=Math.floor(now()/60000),bucket=attempts.get(remote);
   if(bucket?.minute===minute&&bucket.count>=60)throw Error('Too many trial requests. Try later.');
   attempts.set(remote,{minute,count:bucket?.minute===minute?bucket.count+1:1});if(attempts.size>10000)for(const[k,v]of attempts)if(v.minute<minute)attempts.delete(k);
   let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)throw Error('Request too large');}
   const body=JSON.parse(text||'{}');let result;
   switch(url.pathname){
    case '/api/trial/start':result=start(body.identity);break;
    case '/api/trial/verify':result=verify(body.token,body.identity);break;
    case '/api/trial/reserve':result=reserve(body.token,body.identity,body.requestId);break;
    case '/api/trial/complete':result=complete(body.token,body.identity,body.reservation,body.pnr,body.booking);break;
    case '/api/trial/release':result=release(body.token,body.identity,body.reservation);break;
    default:send(404,{error:'Unknown trial endpoint'});return true;
   }
   const item=db.trials.find(t=>t.id===result.trial?.id);if(item){recordAccess(item,item.identity.hardware,clientAddress(req),now());persist();}
   send(200,{ok:true,...result});
  }catch(error){send(403,{ok:false,error:error.message});}return true;
 }
 function listAdmin(){return db.trials.map(t=>({...status(t),startedAt:new Date(t.startedAt).toISOString(),deviceAccess:t.deviceAccess||[],pendingRuns:t.reservations.filter(r=>!r.closed).length,bookings:t.bookings||[]}));}
 return{start,verify,reserve,complete,release,handle,listAdmin};
}
module.exports={createTrials,DAYS_MS,PNR_LIMIT};

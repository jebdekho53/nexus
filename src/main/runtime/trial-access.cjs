'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{AsyncLocalStorage}=require('node:async_hooks');
const scope=new AsyncLocalStorage();let current;
const stateHandlers=new WeakSet();
function installStateHandler(electron,root,getState=()=>current?.displaySummary||null){
 if(stateHandlers.has(electron.ipcMain))return;
 const renderer=path.join(root,'src/renderer');
 electron.ipcMain.handle('matrix:trial:state',event=>{
  try{
   const url=new URL(event.sender.getURL());
   if(url.protocol!=='file:')return{ok:false};
   const relative=path.relative(renderer,require('node:url').fileURLToPath(url));
   if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return{ok:false};
  }catch{return{ok:false};}
  return{ok:true,trial:getState()};
 });
 stateHandlers.add(electron.ipcMain);
}
function create(electron,root,{fetcher=globalThis.fetch,identityProvider=require('./trial-device.cjs').collect}={}){
 const base='https://matrix.vaidya-gpt.com',file=path.join(electron.app.getPath('userData'),'matrix-trial.bin');
 let identity,state=null,pending=[],enforcing=false;const actors=new WeakMap();
 const save=()=>{if(!electron.safeStorage.isEncryptionAvailable())throw Error('Secure trial storage unavailable');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,electron.safeStorage.encryptString(JSON.stringify({state,pending})),{mode:0o600});};
 try{const stored=JSON.parse(electron.safeStorage.decryptString(fs.readFileSync(file)));state=stored.state;pending=stored.pending||[];}catch{}
 async function request(route,data={}){
  identity??=identityProvider();
  const response=await fetcher(base+'/api/trial/'+route,{method:'POST',headers:{'Content-Type':'application/json','x-matrix-client':'desktop'},body:JSON.stringify({token:state?.token,identity,...data}),signal:AbortSignal.timeout(10000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Trial verification unavailable');
  if(result.trial)state={token:result.token||state?.token,trial:result.trial};save();return result;
 }
 async function reconcile(){for(const item of [...pending]){await request('complete',item);pending=pending.filter(p=>p.reservation!==item.reservation);save();}}
 const service={
  get active(){return !!state?.trial?.active&&Date.parse(state.trial.expiresAt)>Date.now()&&pending.length===0;},
  get summary(){return state?.trial||null;},
  get displaySummary(){return enforcing?service.summary:null;},
  disable(){enforcing=false;},
  async start(){if(!electron.safeStorage.isEncryptionAvailable())throw Error('Secure trial storage unavailable');await request('start');await reconcile();enforcing=true;return service.summary;},
  async verify(){if(!state?.token)throw Error('Start a trial or enter a paid key.');await reconcile();await request('verify');enforcing=true;return service.summary;},
  async run(invoke){
   await service.verify();const requestId=crypto.randomUUID();await request('reserve',{requestId});
   const run={id:requestId,completed:false,started:false};
   try{const result=await scope.run(run,invoke);if(!run.started&&result?.ok===false)await request('release',{reservation:requestId}).catch(()=>{});return result;}
   catch(error){if(!run.started)await request('release',{reservation:requestId}).catch(()=>{});throw error;}
  },
  hooks:{
   async f2082(original,args,actor){
    const run=scope.getStore();if(!run)return enforcing?service.run(()=>service.hooks.f2082(original,args,actor)):original(...args);run.started=true;if(actor)actors.set(actor,run);
    const result=await original(...args);
    if(!run.completed&&result&&!/might|pending|processing|unknown/i.test(String(result.message||''))){await request('release',{reservation:run.id}).catch(()=>{});}
    return result;
   },
   async f2233(original,args,actor){
    const run=actors.get(actor)||scope.getStore(),booking=args[0];
    if(run&&/^\d{10}$/.test(String(booking?.pnr||''))&&!run.completed){
     run.completed=true;const item={reservation:run.id,pnr:String(booking.pnr),booking:require('./booking-report.cjs').bookingFor(actor,booking)};
     pending.push(item);save();
     try{await reconcile();}catch{/* Ticket display continues; new trial runs remain blocked until reconciliation. */}
    }
    return original(...args);
   },
  },
 };
 current=service;return service;
}
function hooks(){return{
 f2082:(original,args,actor)=>current?current.hooks.f2082(original,args,actor):original(...args),
 f2233:(original,args,actor)=>current?current.hooks.f2233(original,args,actor):original(...args),
};}
module.exports={create,hooks,installStateHandler};

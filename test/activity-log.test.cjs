const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {install}=require('../src/main/runtime/activity-log.cjs');
const {isBookingRow}=require('../src/renderer/matrix-log-policy.js');
test('renderer rejects stale window/navigation rows from snapshots and live events',()=>{
 for(const row of [{stage:'action-start',message:'app:controller-action proxy'},{stage:'matrix-window-visible',message:'proxy.html'},{stage:'action-start',message:'app:controller-action logs'},{stage:'matrix-window-visible',message:'logs.html'}])assert.equal(isBookingRow(row),false);
 for(const stage of ['booking:start','weblogin:fill','browser:ready','booking:qr','booking:success','booking:cancelled','matrix-private-session-created'])assert.equal(isBookingRow({stage,message:'Progress'}),true);
});

test('booking logs keep Chrome/session events and omit app/window/debug noise',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-log-filter-'));fs.mkdirSync(path.join(root,'diagnostics'));
 const handlers=new Map(),service=install({BrowserWindow:{getAllWindows:()=>[]},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)}},root);
 const event={sender:{getURL:()=>require('node:url').pathToFileURL(path.join(root,'src/renderer/logs.html')).href}};
 try{
  const snapshot=()=>handlers.get('matrix:logs:snapshot')(event);
  assert.equal(snapshot().length,0);
  for(const name of ['main-module-initialized','development-window-loaded','matrix-window-visible','matrix-runtime-installed','matrix-local-service-config','mobile-bridge-listening','renderer-console'])service.record(name,{page:'tools.html'});
  service.record('action-start',{page:'app:controller-action new-form'});
  assert.equal(snapshot().length,0);
  service.stage('weblogin:navigate','Opening IRCTC','pair-a');service.stage('browser:ready','Chrome ready','pair-a');service.stage('booking:qr','Payment QR ready','pair-a');
  service.record('matrix-private-session-created');service.record('matrix-payment-response');service.record('action-start',{page:'app:start-booking',formId:'pair-a'});
  assert.equal(snapshot().length,6);assert(snapshot().some(r=>r.stage==='browser:ready'));assert.equal(snapshot().at(-1).runId,'pair-a');
  const lifecycle=['booking:start','weblogin:launch','browser:ready','gologin:proxy','search:submit','booking:availability','booking:boarding','ui:captcha','railone:otp','booking:submit','booking:highload','booking:fare','payment:request','booking:qr','booking:success','booking:cancelled','booking:done'];
  for(const stage of lifecycle)service.stage(stage,'Booking lifecycle event','pair-lifecycle');
  assert.deepEqual(snapshot().filter(r=>r.runId==='pair-lifecycle').map(r=>r.stage),lifecycle);
 }finally{service.dispose();fs.rmSync(root,{recursive:true,force:true});}
});
test('activity stream redacts credentials, timestamps stages, emits one-second waits and restricts IPC',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-log-test-'));fs.mkdirSync(path.join(root,'diagnostics'));
  const handlers=new Map(),electron={BrowserWindow:{getAllWindows:()=>[]},ipcMain:{handle:(key,fn)=>handlers.set(key,fn)}};
  const service=install(electron,root),event={sender:{getURL:()=>require('node:url').pathToFileURL(path.join(root,'src/renderer/logs.html')).href}};
  try{
    service.learn({credentials:{password:'synthetic-secret'}});
    service.stage('weblogin:submit','Submitting synthetic-secret accessToken=private-value','pair-1');
    await new Promise(resolve=>setTimeout(resolve,1150));
    let rows=handlers.get('matrix:logs:snapshot')(event);
    assert.ok(rows.some(row=>row.kind==='heartbeat'&&row.runId==='pair-1'&&row.elapsedSeconds>=1));
    assert.equal(JSON.stringify(rows).includes('synthetic-secret'),false);assert.equal(JSON.stringify(rows).includes('private-value'),false);
    assert.ok(rows.every(row=>Number.isFinite(row.at)));
    assert.deepEqual(handlers.get('matrix:logs:snapshot')({sender:{getURL:()=> 'https://external.example'}}),[]);
    assert.deepEqual(handlers.get('matrix:logs:snapshot')({sender:{getURL:()=> 'https://external.example/logs.html'}}),[]);
    service.stage('weblogin:done','Signed in','pair-1');
    assert.equal(handlers.get('matrix:logs:clear')(event).ok,true);
  }finally{service.dispose();fs.rmSync(root,{recursive:true,force:true});}
});
test('recovered stage signature separates pair ID from level and stops waiting after browser failure',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-log-test-'));fs.mkdirSync(path.join(root,'diagnostics'));
  const handlers=new Map(),electron={BrowserWindow:{getAllWindows:()=>[]},ipcMain:{handle:(key,fn)=>handlers.set(key,fn)}};
  const service=install(electron,root),pair='24381518-1bd5-460d-a293-7ebac3a6d14e';
  const event={sender:{getURL:()=>pathToUrl()}};
  function pathToUrl(){return require('node:url').pathToFileURL(path.join(root,'src/renderer/logs.html')).href;}
  try{
    service.recovered(['weblogin:relogin','Logging in',pair,'info']);
    await new Promise(resolve=>setTimeout(resolve,1100));
    let rows=handlers.get('matrix:logs:snapshot')(event);
    assert.ok(rows.some(row=>row.kind==='heartbeat'&&row.runId===pair));
    assert.ok(rows.every(row=>['info','warn','error','success'].includes(row.level)));
    service.recovered(['weblogin:relogin','Re-login failed: page.waitForTimeout: Target page, context or browser has been closed',pair,'warn']);
    const count=handlers.get('matrix:logs:snapshot')(event).length;
    await new Promise(resolve=>setTimeout(resolve,1100));
    rows=handlers.get('matrix:logs:snapshot')(event);assert.equal(rows.length,count);assert.equal(rows.at(-1).level,'error');
    service.observePayment('app:get-form',[],{ok:true,data:{id:pair,payment:{method:'paytm'}}});
    service.observePayment('app:save-form',[{id:pair,payment:{method:'irctcqr'}}],{ok:true});
    service.observePayment('app:start-booking',[{formId:pair,form:{paymentMethodDisplay:'irctcqr',paymentMethod:'irctcqr'}}]);
    rows=handlers.get('matrix:logs:snapshot')(event);
    assert.ok(rows.some(row=>row.stage==='payment:changed'&&row.message==='Paytm QR → IRCTC QR'));
    assert.ok(rows.some(row=>row.stage==='payment:request'&&row.message.includes('IRCTC QR')));
  }finally{service.dispose();fs.rmSync(root,{recursive:true,force:true});}
});

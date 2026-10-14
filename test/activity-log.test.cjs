const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {install}=require('../src/main/runtime/activity-log.cjs');
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

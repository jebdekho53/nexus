'use strict';
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const payments=require('../../renderer/matrix-payments.js');
function install(electron,root) {
  const rows=[],runs=new Map(),secrets=new Set(),choices=new Map();let id=0;
  const file=path.join(root,'diagnostics/activity.jsonl');
  const logUrl=pathToFileURL(path.join(root,'src/renderer/logs.html')).href.toLowerCase();
  const trusted=contents=>contents.getURL().split('?')[0].toLowerCase()===logUrl;
  const sensitive=/^(password|passcode|otp|apiKey|accessToken|refreshToken|csrfToken|authorization|cookie|secret|greq|bmiyek)$/i;
  function learn(value){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(sensitive.test(key)&&typeof item==='string'&&item.length>=3)secrets.add(item);else if(item&&typeof item==='object')learn(item);}}
  function clean(text){let value=String(text||'');for(const secret of secrets)value=value.replaceAll(secret,'[redacted]');return value.replace(/\bBrahmos\b/gi,'Matrix').replace(/Xhamster\s*TS/gi,'Matrix').replace(/Bearer\s+[\w.+\/-]+/gi,'Bearer [redacted]').replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,'[redacted]').replace(/\b(password|accessToken|refreshToken|csrfToken|cookie|authorization|apiKey|otp)\s*[:=]\s*[^\s,;]+/gi,'$1=[redacted]');}
  function emit(kind,stage,message,runId='app',level='info'){
    const now=Date.now(),run=runs.get(runId);
    const row={id:++id,at:now,kind,stage:clean(stage),message:clean(message),runId,level,elapsedSeconds:run?Number(((now-run.started)/1000).toFixed(1)):null,stepSeconds:run?Number(((now-run.changed)/1000).toFixed(1)):null};
    rows.push(row);if(rows.length>5000)rows.shift();
    try{if(fs.existsSync(file)&&fs.statSync(file).size>10*1024*1024)fs.renameSync(file,file+'.previous');fs.appendFileSync(file,JSON.stringify(row)+'\n');}catch{}
    for(const win of electron.BrowserWindow.getAllWindows())try{if(!win.isDestroyed()&&!win.webContents.isDestroyed()&&trusted(win.webContents))win.webContents.send('matrix:logs:event',row);}catch{}
    if(run)for(const win of electron.BrowserWindow.getAllWindows())try{const url=new URL(win.webContents.getURL());if(!win.isDestroyed()&&url.protocol==='file:'&&url.pathname===new URL(pathToFileURL(path.join(root,'src/renderer/booking-box.html'))).pathname&&url.searchParams.get('id')===runId)win.webContents.send('matrix:booking:timing',{runId,stage:row.stage,elapsedSeconds:row.elapsedSeconds,active:run.active,remainingMs:run.remaining?Math.max(0,run.remaining.ms-(now-run.remaining.at)):null});}catch{}
    return row;
  }
  function stage(name,message,runId='app',level='info'){
    if(!/^(weblogin|booking|search|ui|railone|payment|gologin|browser)(:|$)/.test(name))return;
    const now=Date.now();let run=runs.get(runId);
    if(!run){run={started:now,changed:now};runs.set(runId,run);}
    if(run.stage!==name){run.changed=now;run.stage=name;}
    const countdown=name==='booking:countdown'&&String(message).match(/^([^|]+)\|(\d+)$/);
    run.remaining=countdown?{label:countdown[1],ms:Number(countdown[2]),at:now}:null;
    const failed=/(?:error|failed)$/.test(name)||/(?:re-?login|login|booking) failed:|target (?:page|browser|context).*closed/i.test(String(message));
    const terminal=failed||/(?:cancelled|closed|stopped|logout)$/.test(name)||/^booking:done/.test(name)||name==='weblogin:done';
    const levelName=['info','warn','error','success'].includes(level)?level:'info';
    run.message=clean(message);run.active=levelName!=='error'&&!terminal;
    if(name==='ui:pay'){const match=String(message).match(/^Selecting payment:\s*(\w+)$/i);if(match)message='Selecting '+payments.label(match[1])+' ('+match[1]+')';}
    emit('event',name,message,runId,failed?'error':levelName);
  }
  const timer=setInterval(()=>{for(const [runId,run]of runs)if(run.active){let message=run.message;if(run.remaining){const seconds=Math.max(0,Math.ceil((run.remaining.ms-(Date.now()-run.remaining.at))/1000));message=run.remaining.label+' resumes in '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}emit('heartbeat',run.stage,'Waiting: '+message,runId);}},1000);timer.unref();
  const allowed=event=>trusted(event.sender);
  electron.ipcMain.handle('matrix:logs:snapshot',event=>allowed(event)?rows:[]);
  electron.ipcMain.handle('matrix:logs:clear',event=>{if(allowed(event))rows.length=0;return {ok:allowed(event)};});
  emit('event','app:ready','Matrix activity log ready');
  function observePayment(channel,args,result){
    if(channel==='app:get-form'&&result?.ok&&result.data?.id){choices.set(result.data.id,result.data.payment?.method);return;}
    if(channel==='app:save-form'&&result?.ok){const form=args[0],before=choices.get(form?.id),after=form?.payment?.method;if(before&&after&&before!==after)emit('event','payment:changed',payments.label(before)+' → '+payments.label(after),form.id,'warn');if(form?.id)choices.set(form.id,after);}
    if(channel==='app:start-booking'){const form=args[0]?.form||{},id=args[0]?.formId||'app',selected=form.paymentMethodDisplay||form.payment?.method||form.paymentMethod;emit('event','payment:request','Selected '+payments.label(selected)+'; request code '+(form.paymentMethod||selected||'missing'),id);}
  }
  return {learn,stage,recovered(args){const runId=typeof args[2]==='string'&&/^[0-9a-f-]{36}$/i.test(args[2])?args[2]:'app';stage(String(args[0]||''),String(args[1]||''),runId,String(args[3]||'info'));},observePayment,redact:clean,record(event,details={}){if(/security|check-skipped|function-trace|definitions-loaded|version-gate|window-show-suppressed/.test(event))return;emit('event',event,details.error||details.page||details.check||event);},stop(runId){if(runs.has(runId))runs.get(runId).active=false;},dispose(){clearInterval(timer);}};
}
module.exports={install};

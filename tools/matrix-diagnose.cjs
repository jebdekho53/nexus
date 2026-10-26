'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'diagnostics');fs.mkdirSync(OUT,{recursive:true});
const mode=process.argv[2]||'--report';
function read(file){try{return fs.readFileSync(file,'utf8').split(/\r?\n/).flatMap(l=>{try{return[JSON.parse(l)];}catch{return[];}});}catch{return[];}}
function report(){
 const roots=[ROOT,path.join(process.env.LOCALAPPDATA||os.homedir(),'Matrix'),path.resolve(ROOT,'../matrix-build/local-1.0.24-qa')];
 const candidates=roots.map(root=>({root,file:path.join(root,'diagnostics/activity.jsonl')})).filter(r=>fs.existsSync(r.file)).sort((a,b)=>fs.statSync(b.file).mtimeMs-fs.statSync(a.file).mtimeMs);
 const selected=candidates[0],rows=selected?read(selected.file).filter(r=>r.kind!=='heartbeat'):[];
 const starts=rows.filter(r=>r.stage==='booking:start').slice(-3);
 const last3=starts.map(start=>{
  const end=rows.find(r=>r.runId===start.runId&&r.at>=start.at&&r.stage==='booking:done');
  const run=rows.filter(r=>r.runId===start.runId&&r.at>=start.at&&r.at<=(end?.at??Infinity));
  const counts={};for(const row of run)if(/^booking:[a-z-]+$/.test(row.stage))counts[row.stage]=(counts[row.stage]||0)+1;
  return{start:new Date(start.at).toISOString(),seconds:end?Math.round((end.at-start.at)/1000):null,stages:counts,outcome:!end?'not-finished':/operator|stopped/i.test(end.message)?'operator-stopped':/server.*reach|network/i.test(end.message)?'network-failed':/success|booked|confirmed/i.test(end.message)?'completion-message':'other-end'};
 });
 const api=read(path.join(ROOT,'diagnostics/api-summary.jsonl')).slice(-500),groups={};
 for(const row of api){const key=[row.endpoint,row.status??'network',row.category].join(' | ');groups[key]=(groups[key]||0)+1;}
 const result={version:JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'))).version,generated:new Date().toISOString(),last3,apiCounts:groups,apiCaptureAvailable:api.length>0};
 fs.writeFileSync(path.join(OUT,'matrix-diagnostic-report.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));console.log('Report: diagnostics/matrix-diagnostic-report.json');
}
if(mode==='--check'){
 const tests=['test/availability-default-adapter.test.cjs','test/high-load-handling-integration.test.cjs','test/web-upgrades-runtime.test.cjs','test/api-diagnostics.test.cjs'];
 const result=cp.spawnSync(process.execPath,['--test',...tests],{cwd:ROOT,encoding:'utf8'});
 fs.writeFileSync(path.join(OUT,'matrix-diagnostic-tests.log'),(result.stdout||'')+(result.stderr||''));
 console.log((result.stdout||'').split(/\r?\n/).slice(-10).join('\n'));report();process.exitCode=result.status??1;
}else if(mode==='--start'){
 const stdout=fs.openSync(path.join(OUT,'diagnostic-launch.log'),'a');
 const child=cp.spawn(process.execPath,[path.join(ROOT,'scripts/run.cjs'),'--development'],{cwd:ROOT,env:{...process.env,MATRIX_DIAGNOSTICS:'1'},detached:true,windowsHide:true,stdio:['ignore',stdout,stdout]});
 child.unref();fs.closeSync(stdout);
 console.log('Matrix source started with safe API diagnostics. Close other Matrix instances first.');
 console.log('Manually test ONE GN form. This script does not login/book/pay.');
 console.log('After stopping the run: node tools/matrix-diagnose.cjs --report');
}else if(mode==='--report')report();else{console.error('Use --check, --start or --report');process.exitCode=1;}

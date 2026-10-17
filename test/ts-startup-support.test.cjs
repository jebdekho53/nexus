'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const legacy=require('./fixtures/legacy/startup-support.legacy.cjs');
const migrated=require('../src/main/runtime/startup-support.cjs');

// src/ts/main/runtime/startup-support.ts versus the lines of index.cjs it replaced.
const check=differential(legacy,migrated);
test('exports',()=>sameExports(legacy,migrated));

const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'startup-'));
test('loadTestSecrets',async()=>{
  const contents={none:null,password:'{"password":"s3cret"}',empty:'{"password":""}',missing:'{}',bad:'not json',nonString:'{"password":5}',nullValue:'null'};
  for(const[name,text]of Object.entries(contents))
    await check(name,m=>{const dir=tmp();if(text!==null)fs.writeFileSync(path.join(dir,'test-account.json'),text);try{return m.loadTestSecrets(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
});

test('startup log writes redacted lines and feeds the activity log',async()=>{
  const secretsSets=[[],['s3cret'],['abc','def']];
  const events=[['plain',{}],['with-detail',{page:'x',n:1}],['leak',{text:'password s3cret and abc def'}],['undefined-details',undefined],['overrides',{pid:'mine',time:'t'}],['nested',{a:{b:['s3cret']}}]];
  for(const secrets of secretsSets)for(const withActivity of[false,true])
    await check(JSON.stringify([secrets,withActivity]),(m,trace)=>{
      const dir=tmp();
      try{
        const activity=withActivity?{redact:text=>{trace.push(['redact',text.replace(/"time":"[^"]*"/,'"time":"T"')]);return text.replaceAll('page','PAGE');},record:(...a)=>trace.push(['record',...a])}:null;
        let current=null;
        const log=m.createStartupLog({diagnostics:dir,secrets:()=>secrets,activity:()=>current});
        for(const[event,details]of events){current=withActivity&&event!=='plain'?activity:null;log(event,details);}
        const lines=fs.readFileSync(path.join(dir,'startup.jsonl'),'utf8').split('\n').filter(Boolean).map(l=>{const row=JSON.parse(l);if(row.event!=='overrides')assert.match(row.time,/^\d{4}-/);delete row.time;delete row.pid;return row;});
        return lines;
      }finally{fs.rmSync(dir,{recursive:true,force:true});}
    });
  // pid and time are written
  const dir=tmp();const log=migrated.createStartupLog({diagnostics:dir,secrets:()=>[],activity:()=>null});log('e',{});
  const row=JSON.parse(fs.readFileSync(path.join(dir,'startup.jsonl'),'utf8'));assert.equal(row.pid,process.pid);assert.equal(row.event,'e');fs.rmSync(dir,{recursive:true,force:true});
});

test('errorDetails',async()=>{
  const withFrames=Object.assign(new Error('boom'),{recoveredFrames:['f1']});
  for(const error of[withFrames,new Error(''),'text',null,undefined,5,{message:'m'},{message:'',stack:'s'},{recoveredFrames:[1]},0,false])
    await check('details '+String(error),m=>{const r=m.errorDetails(error);return{...r,stack:r.stack===undefined?undefined:String(r.stack).split('\n')[0]};});
});

test('native bytecode guard',async()=>{
  for(const request of['./x.jsc','/a/b/C.JSC','x.jsc?query','pkg','./file.js',5,undefined,{}]) {
    await check('guard '+String(request),(m,trace)=>{
      const Module={_load:function(...args){trace.push(['load',this===Module,...args]);return'loaded';}};
      m.installNativeBytecodeGuard(Module,(...a)=>trace.push(['log',...a]));
      return Module._load.call(Module,request,'parent',false);
    });
  }
});

test('esm import bridge',async()=>{
  for(const specifier of['node:fs','data:text/javascript,1','file:///x.mjs','https://x.test/a.mjs','http://x.test','pkg','@scope/pkg','./rel','nodefs','FILE:///x'])
    await check('esm '+specifier,(m,trace)=>m.createEsmImport({resolve:s=>{trace.push(['resolve',s]);if(s==='pkg')throw new Error('missing');return path.join(path.sep,'vendor','node_modules',s,'index.mjs');}},s=>{trace.push(['import',s.replace(/^file:\/\/\/?[A-Za-z]:?/,'file://')]);return'imported';})(specifier));
});

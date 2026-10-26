'use strict';
// Recovered decoder in the recording-stub bootstrap: no real Electron/network.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),defs=require('../src/main/generated/index.cjs'),support=require('./compiler/check-support.cjs');
const out=path.join(root,'diagnostics/server-audit');fs.mkdirSync(out,{recursive:true});
const locations={};for(const file of fs.readdirSync(path.join(root,'src/main/generated')).filter(f=>/^part-.*\.cjs$/.test(f))){fs.readFileSync(path.join(root,'src/main/generated',file),'utf8').split('\n').forEach((line,i)=>{const m=/^exports\.(f\d+)\s*=/.exec(line);if(m)locations[m[1]]={file:'src/main/generated/'+file,line:i+1};});}
const run=support.runBootstrap(support.runtimeFactories().compiled),decoder=run.root?.[5];if(typeof decoder!=='function')throw Error('Offline decoder unavailable');
const refs=[],seen=new Set();let lookups=0,errors=0;
const hostPattern=/(?:https?|wss?|ftp):\/\/(?:[^/\s@]+@)?([A-Za-z0-9_.-]+)/gi;
const barePattern=/(?<![A-Za-z0-9_-])(?:[a-z0-9][a-z0-9-]{0,62}\.)+(?:com|net|org|io|uk|in|dev|ai|gov|app|cloud|online|tech|site|xyz|me|info|co|edu|invalid|test|local)(?![A-Za-z0-9_.-])/gi;
for(const[id,d]of Object.entries(defs)){
 const code=d.code;
 for(let i=0;i+4<code.length;i++){
  const[a,b,c,e,f]=code.slice(i,i+5);
  if(a[1]!=='LdaSmi'||!/^Star\d*$/.test(b[1])||c[1]!=='LdaConstant'||!/^Star\d*$/.test(e[1])||f[1]!=='CallUndefinedReceiver2')continue;
  const key=d.constants[c[2][0].c];if(!Number.isInteger(a[2][0])||typeof key!=='string'||key.length!==4)continue;
  lookups++;let value;try{value=decoder(a[2][0],key);}catch{errors++;continue;}if(typeof value!=='string')continue;
  const hosts=new Set([...value.matchAll(hostPattern)].map(m=>m[1].toLowerCase()));for(const m of value.matchAll(barePattern))hosts.add(m[0].toLowerCase());
  for(const host of hosts){const token=id+'|'+host;if(seen.has(token))continue;seen.add(token);refs.push({host,function:id,...locations[id]});}
 }
}
fs.writeFileSync(path.join(out,'runtime-decoded-hosts.json'),JSON.stringify({functions:Object.keys(defs).length,lookups,errors,references:refs},null,2));console.log(JSON.stringify({functions:Object.keys(defs).length,lookups,errors,hostReferences:refs.length}));

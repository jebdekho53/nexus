'use strict';
// Runs differential.cjs in parallel shards and prints one merged verdict.
// Usage: node tools/compiler/differential-parallel.cjs [--seeds N] [--shards K] [fNNN ...]
const{spawn}=require('node:child_process'),path=require('node:path'),os=require('node:os');
const args=process.argv.slice(2);
const take=(name,fallback)=>{const index=args.indexOf(name);return index>=0?Number(args.splice(index,2)[1]):fallback;};
const shards=take('--shards',Math.max(1,Math.min(os.availableParallelism?.()??os.cpus().length,8)));
const script=path.join(__dirname,'differential.cjs');
const runs=Array.from({length:shards},(_,shard)=>new Promise(resolve=>{
  const child=spawn(process.execPath,[script,'--shard',shard+'/'+shards,...args],{stdio:['ignore','pipe','inherit']});
  let output='';
  child.stdout.on('data',chunk=>{output+=chunk;});
  child.on('close',code=>resolve({code,output}));
}));
Promise.all(runs).then(results=>{
  const total={checked:0,compiled:0,unsupported:0,failing:0};
  const detail=[];
  for(const{output}of results) {
    const lines=output.split('\n');
    const summary=lines.find(line=>line.startsWith('{"checked"'));
    if(!summary){detail.push(output);total.failing++;continue;}
    const parsed=JSON.parse(summary);
    for(const key of Object.keys(total))total[key]+=parsed[key];
    detail.push(...lines.filter(line=>line&&line!==summary));
  }
  if(detail.length)console.log(detail.join('\n'));
  console.log(JSON.stringify(total));
});

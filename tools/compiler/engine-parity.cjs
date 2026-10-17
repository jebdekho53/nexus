'use strict';
// Independent pre-migration parity check for the TypeScript runtimes.
//
// Runs every recovered function (or the ids given) in identical seeded synthetic worlds through
//   * the preserved ORIGINAL JavaScript engine + runtime-support  (test/fixtures/legacy/engine.legacy.cjs)
//   * the migrated TypeScript engine + runtime-support            (src/main/runtime/engine.cjs)
// and likewise for the compiled runtime (compiled-runtime.legacy.cjs vs compiled-runtime.cjs), then compares return
// values, thrown errors and the full interaction log. The fixtures require only each other, never migrated code.
//
// Usage: node tools/compiler/engine-parity.cjs [--mode interpreter|compiled|both] [--seeds N] [--shards K] [--shard I/N] [fNNN ...]
const path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const args=process.argv.slice(2);
const take=(name,fallback)=>{const index=args.indexOf(name);return index>=0?args.splice(index,2)[1]:fallback;};
const mode=take('--mode','both'),seeds=Number(take('--seeds',2)),shardArg=take('--shard',null),shardsOpt=take('--shards',null),oneArg=take('--one',null);

if(shardArg===null) {
  // coordinator: run shards in parallel and merge
  const shards=Number(shardsOpt??Math.max(1,Math.min(os.availableParallelism?.()??os.cpus().length,8)));
  const runs=Array.from({length:shards},(_,shard)=>new Promise(resolve=>{
    const child=spawn(process.execPath,[__filename,'--mode',mode,'--seeds',String(seeds),'--shard',shard+'/'+shards,...args],{stdio:['ignore','pipe','inherit']});
    let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.on('close',code=>resolve({code,output}));
  }));
  const confirm=candidate=>new Promise(resolve=>{
    // A candidate is confirmed only if it also differs when run alone in a fresh process (rules out state leaking between runs).
    const child=spawn(process.execPath,[__filename,'--shard','0/1','--one',candidate.kind+':'+candidate.id+':'+candidate.n],{stdio:['ignore','pipe','inherit']});
    let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.on('close',()=>resolve(JSON.parse(output.split('\n').find(line=>line.startsWith('{"checked"'))).mismatching>0));
  });
  Promise.all(runs).then(async results=>{
    const total={checked:0,mismatching:0,executed:0,candidates:0,confirmed:0};const detail=[];const candidates=[];
    for(const{output}of results){
      const lines=output.split('\n');const summary=lines.find(line=>line.startsWith('{"checked"'));
      if(!summary){detail.push(output);total.mismatching++;continue;}
      const parsed=JSON.parse(summary);for(const key of['checked','executed'])total[key]+=parsed[key];
      for(const line of lines)if(line.startsWith('CANDIDATE '))candidates.push(JSON.parse(line.slice(10)));
    }
    total.candidates=candidates.length;
    for(const candidate of candidates){
      if(await confirm(candidate)){total.confirmed++;total.mismatching++;detail.push('CONFIRMED MISMATCH '+JSON.stringify(candidate));}
    }
    if(detail.length)console.log(detail.join('\n'));
    console.log(JSON.stringify(total));
    process.exitCode=total.mismatching?1:0;
  });
} else {
  delete process.env.MATRIX_COMPILED;
  const legacyEngine=require('../../test/fixtures/legacy/engine.legacy.cjs');
  const newEngine=require('../../src/main/runtime/engine.cjs');
  const legacyCompiled=require('../../test/fixtures/legacy/compiled-runtime.legacy.cjs');
  const newCompiled=require('../../src/main/runtime/compiled-runtime.cjs');
  const definitions=require('../../src/main/generated/index.cjs');
  const bodies=require('../../src/main/compiled/index.cjs'),meta=require('../../src/main/compiled/meta.cjs');
  const{createWorld}=require('./world.cjs');
  const HOLE_NAME='uninitialized lexical binding';

  // Some recovered functions assign into the real built-ins when a synthetic world hands them one (for example
  // Reflect.apply). Every execution must start from pristine intrinsics, so they are snapshotted once and restored
  // after each run; otherwise a polluting run would poison the next one and produce false mismatches.
  const INTRINSICS=[Reflect,Object,Function.prototype,Object.prototype,Array,Array.prototype,Promise,Promise.prototype,String,String.prototype,Number,Number.prototype,JSON,Math,Symbol,Date,Date.prototype,RegExp,RegExp.prototype,Error,Error.prototype,Map.prototype,Set.prototype];
  const pristine=INTRINSICS.map(target=>[target,Object.getOwnPropertyDescriptors(target)]);
  function restoreIntrinsics() {
    let restored=0;
    for(const[target,descriptors]of pristine){
      for(const key of Reflect.ownKeys(target))if(!(key in descriptors)){try{delete target[key];restored++;}catch{}}
      for(const key of Reflect.ownKeys(descriptors)){
        const now=Object.getOwnPropertyDescriptor(target,key),want=descriptors[key];
        if(!now||now.value!==want.value||now.get!==want.get||now.set!==want.set){try{Object.defineProperty(target,key,want);restored++;}catch{}}
      }
    }
    return restored;
  }

  function buildContexts(runtime,world,hole) {
    let parent=null;
    for(let level=0;level<4;level++){
      const ctx=runtime.context(40,parent);
      for(let slot=2;slot<40;slot++)ctx[slot]=world.random()<0.03?hole:world.generate();
      ctx[2]=world.decoder();ctx[3]=world.decoder();ctx[5]=world.decoder();
      parent=ctx;
    }
    return parent;
  }
  async function runOnce(kind,which,id,seed) {
    const world=createWorld(seed);
    let steps=0;
    const tick=()=>{if(++steps>400000)throw new Error('LOOP_LIMIT');};
    let runtime,hole;
    if(kind==='interpreter'){
      const module=which==='legacy'?legacyEngine:newEngine;hole=module.HOLE;
      runtime=module.createEngine(definitions,{globals:world.globals,maxSteps:400000,tick});
    } else {
      const module=which==='legacy'?legacyCompiled:newCompiled;hole=module.HOLE;
      runtime=module.createCompiledRuntime({globals:world.globals,compiledBodies:bodies,meta,tick});
    }
    const captured=buildContexts(runtime,world,hole);
    const count=Math.floor(world.random()*5);
    const callArgs=Array.from({length:count},()=>world.generate());
    const thisValue=world.random()<0.5?undefined:world.generate();
    const fn=runtime.makeFunction(id,captured,{thisValue,newTarget:undefined});
    let outcome;
    try{
      let value=fn.apply(thisValue,callArgs);
      if(value instanceof Promise)value=await Promise.race([value,new Promise(resolve=>setTimeout(()=>resolve('promise:pending'),15))]);
      outcome='ok:'+world.summary(value);
    }catch(error){
      outcome=error instanceof Error?'throw:'+error.name+':'+String(error.message).slice(0,120):'throw:'+world.summary(error);
    }
    const scrub=text=>text.split(HOLE_NAME).join('HOLE').replace(/ imported from \S+/g,' imported from <module>');
    // let any async continuation of the recovered function finish before the intrinsics are restored
    for(let tick=0;tick<4;tick++){await new Promise(resolve=>setImmediate(resolve));restoreIntrinsics();}
    return{outcome:scrub(outcome),log:scrub(world.log.map(entry=>entry.join(' ')).join('\n')),name:fn.name,length:fn.length,kind:Object.getOwnPropertySymbols(fn).length};
  }
  // Calling a non-function fails with a TypeError in every engine, but the message depends on how the engine reached the call
  // (a clobbered Reflect.apply versus the intrinsic captured at load). Only these two wordings are treated as equal, as in
  // tools/compiler/differential.cjs; every other outcome, log and error must match exactly.
  const CALL_WORDING=/^throw:TypeError:(Reflect\.apply is not a function|Function\.prototype\.apply was called on .*)$/;
  const sameFailureWording=result=>CALL_WORDING.test(result.outcome)?{...result,outcome:'throw:TypeError:call'}:result;
  process.on('unhandledRejection',()=>{});
  (async()=>{
    const[shard,shards]=shardArg.split('/').map(Number);
    const ids=args.filter(arg=>/^f\d+$/.test(arg));
    let work=[];
    if(oneArg){const[kind,id,n]=oneArg.split(':');work=[[kind,id,Number(n)]];}
    else{
      const targets=(ids.length?ids:Object.keys(definitions)).filter((id,index)=>definitions[id]&&index%shards===shard);
      const kinds=mode==='both'?['interpreter','compiled']:[mode];
      for(const id of targets)for(const kind of kinds)for(let n=1;n<=seeds;n++)work.push([kind,id,n]);
    }
    let checked=0,mismatching=0,executed=0;
    for(const[kind,id,n]of work){
      const seed=n*7919+definitions[id].code.length;
      const expected=await runOnce(kind,'legacy',id,seed),actual=await runOnce(kind,'new',id,seed);
      checked++;
      if(!expected.outcome.startsWith('throw:')||!/LOOP_LIMIT|instruction limit/.test(expected.outcome))executed++;
      if(JSON.stringify(sameFailureWording(expected))!==JSON.stringify(sameFailureWording(actual))){
        mismatching++;
        console.log('CANDIDATE '+JSON.stringify({kind,id,n}));
        if(oneArg)console.log(`MISMATCH ${kind} ${id} seed ${seed}\n  legacy: ${expected.outcome}\n  new:    ${actual.outcome}\n  logs equal: ${expected.log===actual.log}`);
      }
    }
    console.log(JSON.stringify({checked,mismatching,executed}));
  })();
}

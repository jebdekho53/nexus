'use strict';
// Differential execution: recovered interpreter vs compiled body in identical seeded synthetic worlds.
// Usage: node tools/compiler/differential.cjs [--seeds N] [--first K] [--show N] [fNNN ...]
const {createEngine,HOLE}=require('../../src/main/runtime/engine.cjs');
const definitions=require('../../src/main/generated/index.cjs');
const{compileDefinition,Unsupported}=require('./compile.cjs');
const{createWorld}=require('./world.cjs');

function loadCompiled(definition) {
  const source=compileDefinition(definition,{tick:true});
  const exports={};
  new Function('exports','"use strict";'+source)(exports);
  return exports[definition.id];
}

function buildContexts(engine,world) {
  const depth=4,slots=40;
  let parent=null;
  const chain=[];
  for(let level=0;level<depth;level++) {
    const ctx=engine.context(slots,parent);
    for(let slot=2;slot<slots;slot++)ctx[slot]=world.random()<0.03?HOLE:world.generate();
    ctx[2]=world.decoder();ctx[3]=world.decoder();ctx[5]=world.decoder();
    chain.push(ctx);parent=ctx;
  }
  return parent;
}

async function runOnce(definition,seed,compiledBody) {
  const world=createWorld(seed);
  let steps=0;
  const engine=createEngine(definitions,{globals:world.globals,maxSteps:400000,compiledBodies:compiledBody?{[definition.id]:compiledBody}:undefined,
    tick(){if(++steps>400000)throw new Error('LOOP_LIMIT');}});
  const captured=buildContexts(engine,world);
  const count=Math.floor(world.random()*5);
  const args=Array.from({length:count},()=>world.generate());
  const thisValue=world.random()<0.5?undefined:world.generate();
  const fn=engine.makeFunction(definition.id,captured,{thisValue,newTarget:undefined});
  let outcome;
  try {
    let value=fn.apply(thisValue,args);
    if(value instanceof Promise)value=await Promise.race([value,new Promise(resolve=>setTimeout(()=>resolve('promise:pending'),15))]);
    outcome='ok:'+world.summary(value);
  } catch(error) {
    outcome=error instanceof Error?'throw:'+error.name+':'+String(error.message).slice(0,80):'throw:'+world.summary(error);
    if(error instanceof Error&&(error.message.startsWith('LOOP_LIMIT')||error.message.includes('exceeded instruction limit')))outcome='loop';
  }
  return{outcome,log:world.log.map(entry=>entry.join(' ')).filter(line=>!line.includes('recoveredFrames')).join('\n')};
}

async function compare(definition,body,seeds) {
  const mismatches=[];
  for(let seed=1;seed<=seeds;seed++) {
    const expected=await runOnce(definition,seed*7919+definition.code.length,null);
    const actual=await runOnce(definition,seed*7919+definition.code.length,body);
    if(expected.outcome==='loop'||actual.outcome==='loop')continue;
    const normalize=text=>text.replace(/exceeded instruction limit.*/,'').replace(/^throw:TypeError:.*(apply was called on|is not a function|is not iterable|is not a constructor).*$/,'throw:TypeError:call');
    if(normalize(expected.outcome)!==normalize(actual.outcome)||expected.log!==actual.log)mismatches.push({seed,expected,actual});
  }
  return mismatches;
}

process.on('unhandledRejection',()=>{});

async function main() {
  const args=process.argv.slice(2);
  const option=(name,fallback)=>{const index=args.indexOf(name);return index>=0?Number(args.splice(index,2)[1]):fallback;};
  const seeds=option('--seeds',6),first=option('--first',Infinity),show=option('--show',5);
  const ids=args.filter(arg=>/^f\d+$/.test(arg));
  const targets=(ids.length?ids:Object.keys(definitions)).map(id=>definitions[id]).filter(Boolean);
  let compiled=0,unsupported=0,bad=0,shown=0,checked=0;
  const failures=[];
  for(const definition of targets) {
    if(checked>=first)break;
    let body;
    try {body=loadCompiled(definition);}
    catch(error) {
      if(error instanceof Unsupported){unsupported++;continue;}
      failures.push([definition.id,'compile error: '+error.message]);bad++;continue;
    }
    compiled++;checked++;
    const mismatches=await compare(definition,body,seeds);
    if(mismatches.length) {
      bad++;failures.push([definition.id,mismatches.length+' mismatching seeds']);
      if(shown<show){
        shown++;
        const m=mismatches[0];
        console.log('--- '+definition.id+' seed '+m.seed+'\nexpected: '+m.expected.outcome+'\nactual:   '+m.actual.outcome);
        const a=m.expected.log.split('\n'),b=m.actual.log.split('\n');
        let index=0;while(index<a.length&&a[index]===b[index])index++;
        console.log('first log difference at '+index+':\n  expected: '+a[index]+'\n  actual:   '+b[index]);
      }
    }
  }
  console.log(JSON.stringify({checked,compiled,unsupported,failing:bad}));
  if(failures.length)console.log(failures.slice(0,40).map(row=>row.join(': ')).join('\n'));
}
if(require.main===module)main();
module.exports={runOnce,compare,loadCompiled};

'use strict';

// Static inventory only: imports definitions and the opt-in factory registry,
// but never starts Electron, executes recovered functions or reads user data.
const fs=require('node:fs'),path=require('node:path');
const definitions=require('../src/main/generated/index.cjs');
const contracts=require('../src/main/payment/recovered-contract.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const native=new Set(Object.keys(reconstructedPayment({development:true,enabled:true})));
const output=path.resolve(__dirname,'../docs/reconstruction-inventory');
const sizeBands=[['tiny',20],['small',100],['medium',300],['large',1000],['very_large',Infinity]];
const complexityBands=[['low',5],['moderate',20],['high',60],['very_high',150],['extreme',Infinity]];
const band=(value,bands)=>bands.find(([,limit])=>value<=limit)[0];
const functions=Object.entries(definitions).map(([id,definition])=>{
  const code=definition.code;
  const conditionalBranches=code.filter(([,op])=>op.startsWith('JumpIf')).length;
  const loops=code.filter(([,op])=>op==='JumpLoop').length;
  let switchAlternatives=0,switches=0;
  for(const[,op,args]of code)if(op.startsWith('Switch')&&op!=='SwitchOnGeneratorState'){
    switches++;
    const table=args.find(value=>value&&typeof value==='object'&&value.table)?.table;
    switchAlternatives+=Math.max(0,Object.keys(table??{}).length-1);
  }
  const handlers=definition.handlers?.length??0;
  const suspensions=code.filter(([,op])=>op==='SuspendGenerator').length;
  const closures=code.filter(([,op])=>op==='CreateClosure').length;
  const calls=code.filter(([,op])=>op.startsWith('Call')||op==='Construct').length;
  // Review-load heuristic, NOT a calculated cyclomatic complexity or time estimate.
  const reviewScore=1+conditionalBranches+loops+switchAlternatives+2*handlers+suspensions+closures;
  return{id,instructions:code.length,size:band(code.length,sizeBands),reviewScore,
    complexity:band(reviewScore,complexityBands),conditionalBranches,loops,switches,
    switchAlternatives,handlers,suspensions,closures,calls,
    status:native.has(id)?'native_entry':Object.hasOwn(contracts,id)?'pinned_support':'recovered_other'};
}).sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1)));
const totalInstructions=functions.reduce((sum,f)=>sum+f.instructions,0);
const percent=n=>Number((100*n/totalInstructions).toFixed(2));
const aggregate=(field,keys)=>Object.fromEntries(keys.map(key=>{
  const selected=functions.filter(f=>f[field]===key),instructions=selected.reduce((sum,f)=>sum+f.instructions,0);
  return[key,{functions:selected.length,instructions,instructionPercent:percent(instructions),
    nativeEntries:selected.filter(f=>f.status==='native_entry').length,
    pinnedSupport:selected.filter(f=>f.status==='pinned_support').length}];
}));
const summary={scope:'Recovered main-process function definitions only; excludes ordinary renderer/source code and dependencies.',
  totalFunctions:functions.length,totalInstructions,
  sizeBands:{tiny:'1–20 instructions',small:'21–100',medium:'101–300',large:'301–1000',very_large:'1001+'},
  reviewScore:'1 + conditional jumps + loop jumps + switch alternatives + 2*exception handlers + generator suspensions + closure creation sites',
  limits:['Review score is a static heuristic, not formal cyclomatic complexity, semantic difficulty or elapsed time.',
    'Native entry status means an active development-only factory; pinned support means reviewed dependency/callback, not an independently migrated entry.',
    'Instruction-weighted coverage measures original definition volume only; it is not completed effort, feature coverage or readiness.',
    'Generated functions may include trivial callbacks, initialization, shared helpers and embedded programs; equal counts do not imply equal work.'],
  bySize:aggregate('size',sizeBands.map(([key])=>key)),
  byComplexity:aggregate('complexity',complexityBands.map(([key])=>key)),
  byStatus:aggregate('status',['native_entry','pinned_support','recovered_other']),
  sizeComplexityMatrix:Object.fromEntries(sizeBands.map(([size])=>[size,Object.fromEntries(complexityBands.map(([complexity])=>[complexity,functions.filter(f=>f.size===size&&f.complexity===complexity).length]))])),
  largest:functions.toSorted((a,b)=>b.instructions-a.instructions).slice(0,30),
  highestReviewScore:functions.toSorted((a,b)=>b.reviewScore-a.reviewScore).slice(0,30)};
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'functions.json'),JSON.stringify({summary,functions},null,2)+'\n');
const columns=Object.keys(functions[0]);
fs.writeFileSync(path.join(output,'functions.csv'),columns.join(',')+'\n'+functions.map(f=>columns.map(key=>f[key]).join(',')).join('\n')+'\n');
const table=(rows)=>rows.map(row=>'| '+row.join(' | ')+' |').join('\n');
const groupTable=group=>table([['Band','Functions','Original instructions','Instruction share','Native entries','Pinned support'],['---','---:','---:','---:','---:','---:'],...Object.entries(group).map(([key,value])=>[key,value.functions,value.instructions,value.instructionPercent+'%',value.nativeEntries,value.pinnedSupport])]);
const markdown=`# Recovered-function size and review-complexity inventory

Generated by tools/classify_recovered_functions.cjs from the current checkout. Scope: ${summary.scope}

Total: **${functions.length} functions**, **${totalInstructions.toLocaleString('en-US')} original instructions**. The inventory does not execute recovered code or contact services.

## Size

Bands: tiny1–20 instructions; small21–100; medium101–300; large301–1000; very_large1001+.

${groupTable(summary.bySize)}

## Structural review load

Score = ${summary.reviewScore}. Bands: low1–5; moderate6–20; high21–60; very_high61–150; extreme151+. This is a review-priority heuristic, not formal cyclomatic complexity.

${groupTable(summary.byComplexity)}

## Migration status

${groupTable(summary.byStatus)}

Native entry is an active development-only replacement. Pinned support is a reviewed callback/dependency; do not count every pin as a completed standalone migration. Original instruction share is a size proxy, not completed effort or tested feature coverage. Main-function count alone substantially misrepresents progress.

## Largest definitions

${table([['ID','Instructions','Review score','Branches','Loops','Handlers','Suspensions','Closures','Status'],['---','---:','---:','---:','---:','---:','---:','---:','---'],...summary.largest.map(f=>[f.id,f.instructions,f.reviewScore,f.conditionalBranches,f.loops,f.handlers,f.suspensions,f.closures,f.status])])}

## Planning implications

Start with cohesive dependency groups and low/moderate review load, then tackle high/very_high methods with recovered/native behavioral comparisons. Split very large controllers into reviewed boundaries before migration. Tiny callbacks may be migrated inside their parent; do not estimate one engineering task per definition. Async session, payment, cancellation and browser ownership behavior requires deeper verification than its raw size suggests.

No defensible calendar estimate follows from this static inventory alone. Measure throughput on representative modules across bands before forecasting remaining work. Full source migration remains unfinished; public release behavior was not changed by this analysis.

Machine-readable detail: [functions.csv](functions.csv), [functions.json](functions.json).
`;
fs.writeFileSync(path.join(output,'README.md'),markdown);
process.stdout.write(JSON.stringify({totalFunctions:summary.totalFunctions,totalInstructions,bySize:summary.bySize,byComplexity:summary.byComplexity,byStatus:summary.byStatus,largest:summary.largest.slice(0,5)},null,2)+'\n');

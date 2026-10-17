'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspect}=require('node:util');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

// Independent reference check for the migrated interpreter and runtime support.
// The reference is the preserved ORIGINAL JavaScript (test/fixtures/legacy/engine.legacy.cjs, which requires only
// test/fixtures/legacy/runtime-support.legacy.cjs); the subject is src/main/runtime/engine.cjs. Both execute identical,
// deterministic hand-assembled programs and real recovered functions; results, thrown errors and side effects are compared.
delete process.env.MATRIX_COMPILED;
const legacyEngine=require('./fixtures/legacy/engine.legacy.cjs');
const newEngine=require('../src/main/runtime/engine.cjs');
const legacySupport=require('./fixtures/legacy/runtime-support.legacy.cjs');
const newSupport=require('../src/main/runtime/runtime-support.cjs');

test('the reference fixtures do not load migrated code',()=>{
  const child=spawnSync(process.execPath,['-e',"require('./test/fixtures/legacy/engine.legacy.cjs');require('./test/fixtures/legacy/compiled-runtime.legacy.cjs');console.log(JSON.stringify(Object.keys(require.cache).map(f=>require('path').relative(process.cwd(),f))))"],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
  const loaded=JSON.parse(child.stdout);
  assert.deepEqual(loaded.sort(),['test/fixtures/legacy/compiled-runtime.legacy.cjs','test/fixtures/legacy/engine.legacy.cjs','test/fixtures/legacy/runtime-support.legacy.cjs'].map(f=>path.normalize(f)).sort());
});

// ---- hand-assembled programs ------------------------------------------------------------------------------------------
const ctx=n=>({special:'context'});
let nextId=0;
const def=(code,extra={})=>({handlers:[],constants:[],kind:'NormalFunction',language:'strict',length:0,parameterCount:1,registerCount:8,incoming:2147483647,registerCounts:{},name:'',...extra,id:'s'+(++nextId),code});
const R=n=>({r:n}),C=n=>({c:n});
const programs={
  loop:def([[0,'LdaZero',[]],[1,'Star0',[]],[2,'LdaZero',[]],[3,'Star1',[]],[4,'LdaSmi',[5]],[6,'TestLessThan',[R(1)]],[8,'JumpIfFalse',[],24],[10,'Ldar',[R(0)]],[12,'Add',[R(1)]],[14,'Star0',[]],[15,'Ldar',[R(1)]],[17,'Inc',[]],[18,'Star1',[]],[19,'JumpLoop',[],4],[24,'Ldar',[R(0)]],[26,'Return',[]]]),
  contextSlots:def([[0,'LdaSmi',[41]],[2,'StaContextSlot',[ctx(),3,1]],[6,'LdaSmi',[1]],[8,'StaContextSlotNoCell',[ctx(),4,1]],[12,'StaCurrentContextSlot',[5]],[14,'LdaContextSlot',[ctx(),3,1]],[18,'Star0',[]],[19,'LdaContextSlotNoCell',[ctx(),4,1]],[23,'Add',[R(0)]],[25,'Star0',[]],[26,'LdaImmutableContextSlot',[ctx(),3,1]],[30,'Add',[R(0)]],[32,'Return',[]]]),
  arithmetic:def([[0,'LdaSmi',[7]],[2,'Star0',[]],[3,'LdaSmi',[3]],[5,'Sub',[R(0)]],[7,'Mul',[R(0)]],[9,'Exp',[R(0)]],[11,'Star1',[]],[12,'Ldar',[R(0)]],[14,'ShiftLeftSmi',[2]],[16,'BitwiseXorSmi',[5]],[18,'Negate',[]],[19,'BitwiseNot',[]],[20,'Star2',[]],[21,'LdaSmi',[9]],[23,'ModSmi',[4]],[25,'Star3',[]],[26,'CreateArrayLiteral',[C(0)]],[28,'Return',[]]],{constants:[{type:'array',values:[1,2,3]}]}),
  strings:def([[0,'LdaConstant',[C(0)]],[2,'Star0',[]],[3,'LdaConstant',[C(1)]],[5,'Add',[R(0)]],[7,'TypeOf',[]],[8,'Star1',[]],[9,'LdaConstant',[C(1)]],[11,'TestEqual',[R(0)]],[13,'Return',[]]],{constants:['a','b']}),
  throwCaught:def([[0,'Mov',[{special:'context'},R(0)]],[3,'LdaSmi',[5]],[5,'Throw',[]],[6,'LdaSmi',[1]],[8,'Return',[]],[9,'Star1',[]],[10,'LdaSmi',[100]],[12,'Add',[R(1)]],[14,'Return',[]]],{handlers:[[3,6,9,1,0]]}),
  throwNested:def([[0,'Mov',[{special:'context'},R(0)]],[3,'LdaSmi',[1]],[5,'Throw',[]],[6,'LdaZero',[]],[7,'Return',[]],[8,'Star1',[]],[9,'Ldar',[R(1)]],[11,'AddSmi',[10]],[13,'Throw',[]],[14,'LdaZero',[]],[15,'Return',[]],[16,'Star1',[]],[17,'Ldar',[R(1)]],[19,'AddSmi',[100]],[21,'Return',[]]],{handlers:[[0,16,16,1,0],[3,6,8,1,0],[8,14,16,1,0]]}),
  throwUncaught:def([[0,'LdaConstant',[C(0)]],[2,'Throw',[]]],{constants:['boom']}),
  throwUncaughtError:def([[0,'LdaGlobal',[C(0),0]],[3,'Star0',[]],[4,'Construct',[R(0),R(1),0]],[8,'Throw',[]]],{constants:['Error']}),
  readMissingGlobal:def([[0,'LdaGlobal',[C(0),0]],[3,'Return',[]]],{constants:['definitelyMissing']}),
  typeofMissingGlobal:def([[0,'LdaGlobalInsideTypeof',[C(0),0]],[3,'TypeOf',[]],[4,'Return',[]]],{constants:['definitelyMissing']}),
  holeAccess:def([[0,'LdaTheHole',[]],[1,'ThrowReferenceErrorIfHole',[C(0)]],[3,'LdaZero',[]],[4,'Return',[]]],{constants:['x']}),
  superChecks:def([[0,'LdaTheHole',[]],[1,'ThrowSuperNotCalledIfHole',[]],[2,'LdaZero',[]],[3,'Return',[]]]),
  superAlready:def([[0,'LdaZero',[]],[1,'ThrowSuperAlreadyCalledIfNotHole',[]],[2,'Return',[]]]),
  notConstructor:def([[0,'LdaZero',[]],[1,'Star0',[]],[2,'ThrowIfNotSuperConstructor',[R(0)]],[4,'Return',[]]]),
  newTarget:def([[0,'Mov',[{special:'new.target'},R(0)]],[3,'Ldar',[R(0)]],[5,'TestUndefined',[]],[6,'Return',[]]],{kind:'NormalFunction'}),
  thisValue:def([[0,'Mov',[{special:'this'},R(0)]],[3,'Ldar',[R(0)]],[5,'Return',[]]],{language:'sloppy'}),
  closureMaker:def([[0,'CreateClosure',[C(0),0,0]],[4,'Star0',[]],[5,'Mov',[{special:'closure'},R(1)]],[8,'LdaSmi',[3]],[10,'Star2',[]],[11,'CallUndefinedReceiver1',[R(0),R(2),0]],[15,'Return',[]]],{constants:[{type:'function',id:'sInner'}]}),
  dynamicImport:def([[0,'LdaZero',[]],[1,'Star0',[]],[2,'LdaConstant',[C(0)]],[4,'Star1',[]],[5,'LdaZero',[]],[6,'Star2',[]],[7,'LdaUndefined',[]],[8,'Star3',[]],[9,'CallRuntime',['DynamicImportCall',{range:[0,3]}]],[13,'Return',[]]],{constants:['node:path']}),
  forIn:def([[0,'CreateObjectLiteral',[C(0)]],[2,'Star0',[]],[3,'ForInEnumerate',[R(0)]],[5,'Return',[]]],{constants:[{type:'object',entries:[['a',1],['b',2]]}]}),
  restParams:def([[0,'CreateRestParameter',[]],[1,'Return',[]]],{parameterCount:2}),
  switchTable:def([[0,'LdaSmi',[2]],[2,'SwitchOnSmiNoFeedback',[{table:{2:10,3:12}}]],[6,'LdaSmi',[0]],[8,'Return',[]],[10,'LdaSmi',[22]],[12,'Return',[]]]),
  unsupportedOpcode:def([[0,'NopeNotAnOpcode',[]]]),
  badOperand:def([[0,'Ldar',[{special:'nonsense'}]]]),
  missingJump:def([[0,'Jump',[],999]]),
  stepLimit:def([[0,'Jump',[],0]]),
};
programs.sInner=def([[0,'Ldar',[{a:0}]],[2,'AddSmi',[1]],[4,'Return',[]]]);
programs.sInner.id='sInner';
programs.closureMaker.constants=[{type:'function',id:'sInner'}];
const definitionsMap=Object.fromEntries(Object.values(programs).map(d=>[d.id,d]));

const summarize=value=>inspect(value,{depth:6,breakLength:Infinity});
async function run(engineModule,supportModule,program,{thisValue,args=[],construct=false,setup}={}) {
  const log=[];
  const globals={Error,Object,Array,String,Number,JSON,console:{log:(...a)=>log.push(['console',...a])},__esmImport:undefined};
  if(setup)setup(globals,log);
  const engine=engineModule.createEngine(definitionsMap,{globals,maxSteps:500,onInvoke:(id,callArgs)=>log.push(['invoke',id,callArgs.length]),tick:()=>log.push('tick')});
  const parent=engine.context(8,null);parent[2]='parent-2';parent[3]='parent-3';
  const child=engine.context(8,parent);child[2]='child-2';
  const fn=engine.makeFunction(program.id,child,{thisValue:'lexicalThis',newTarget:undefined});
  let outcome;
  try{
    const result=construct?new fn(...args):fn.apply(thisValue,args);
    outcome=['ok',summarize(result instanceof Promise?await result:result)];
  }catch(error){
    outcome=['throw',error instanceof Error?[error.name,error.message,summarize(error.recoveredFrames)]:summarize(error)];
  }
  return{outcome,log:summarize(log),parentSlots:[parent[2],parent[3],parent[4],parent[5]],childSlots:[child[2],child[3],child[4],child[5]],name:fn.name,length:fn.length,isMeta:Object.getOwnPropertySymbols(fn).length};
}
const scenarioArgs={thisValue:{tag:'T'},args:[1,2,3]};

for(const[name,program]of Object.entries(programs).filter(([n])=>n!=='sInner'))
  test('program '+name+': original interpreter and migrated interpreter agree',async()=>{
    const variants=[scenarioArgs,{thisValue:undefined,args:[]},{thisValue:null,args:['x'],construct:false},{construct:true,args:[9]}];
    for(const variant of variants) {
      const setup=name==='dynamicImport'?(globals,log)=>{if(variant.args.length>=3)globals.__esmImport=(...a)=>{log.push(['esm',...a]);return'stubbed-import';};}:undefined;
      const expected=await run(legacyEngine,legacySupport,program,{...variant,setup});
      const actual=await run(newEngine,newSupport,program,{...variant,setup});
      assert.deepEqual(actual,expected,name+' '+summarize(variant));
    }
  });

test('programs compute the expected results (guards against comparing two broken engines)',async()=>{
  const r=async(name,v={})=>(await run(newEngine,newSupport,programs[name],v)).outcome;
  assert.deepEqual(await r('loop'),['ok','10']);
  assert.deepEqual(await r('throwCaught'),['ok','105']);
  assert.deepEqual(await r('throwNested'),['ok','111']);
  assert.deepEqual(await r('switchTable'),['ok','22']);
  assert.deepEqual(await r('closureMaker'),['ok','4']);
  assert.deepEqual(await r('forIn'),['ok',"[ 'a', 'b' ]"]);
  assert.equal((await r('contextSlots'))[0],'ok');
  assert.equal((await r('throwUncaughtError'))[0],'throw');
  assert.equal((await r('dynamicImport',{args:[1,2,3]}))[0],'ok');
  assert.equal((await r('stepLimit'))[0],'throw');
});

test('dynamic import: real ECMAScript import when the world supplies no loader',async()=>{
  for(const[engineModule,supportModule]of[[legacyEngine,legacySupport],[newEngine,newSupport]]) {
    const result=await run(engineModule,supportModule,programs.dynamicImport,{args:[]});
    assert.equal(result.outcome[0],'ok');
    assert.match(result.outcome[1],/join/);
  }
});

// ---- real recovered functions, independent of the migrated code ------------------------------------------------------------
test('real recovered functions: opcode-covering set agrees between the original and migrated engines and compiled runtimes',()=>{
  const definitions=require('../src/main/generated/index.cjs');
  // greedy cover: pick definitions until every opcode (and every runtime helper name) used anywhere is covered
  const need=new Set(),features=id=>{const out=new Set();for(const row of definitions[id].code){out.add(/^Star\d+$/.test(row[1])?'StarN':row[1]);if(row[1]==='CallRuntime'||row[1]==='InvokeIntrinsic')out.add('rt:'+row[2][0]);}out.add('kind:'+definitions[id].kind);out.add('lang:'+definitions[id].language);if(definitions[id].handlers.length)out.add('handlers');return out;};
  const ids=Object.keys(definitions),all=new Map(ids.map(id=>[id,features(id)]));
  for(const set of all.values())for(const feature of set)need.add(feature);
  const chosen=[];const covered=new Set();
  while([...need].some(f=>!covered.has(f))) {
    let best=null,gain=0;
    for(const[id,set]of all){let g=0;for(const f of set)if(!covered.has(f))g++;if(g>gain||(g===gain&&best&&g>0&&definitions[id].code.length<definitions[best].code.length)){best=id;gain=g;}}
    chosen.push(best);for(const f of all.get(best))covered.add(f);
  }
  // add every async definition with suspension, a sample of class/derived constructors and the largest definitions
  const extra=ids.filter(id=>definitions[id].code.some(r=>r[1]==='SuspendGenerator')).slice(0,40);
  const bigs=ids.slice().sort((a,b)=>definitions[b].code.length-definitions[a].code.length).slice(0,20);
  const selection=[...new Set([...chosen,...extra,...bigs])];
  assert.ok(selection.length>=60,'selection size '+selection.length);
  const child=spawnSync(process.execPath,[path.join(__dirname,'..','tools','compiler','engine-parity.cjs'),'--mode','both','--seeds','3','--shards','4',...selection],{encoding:'utf8',maxBuffer:1<<26,timeout:280000});
  const summaryLine=child.stdout.split('\n').find(line=>line.startsWith('{"checked"'));
  assert.ok(summaryLine,'no summary: '+child.stdout.slice(-400)+child.stderr.slice(-400));
  const summary=JSON.parse(summaryLine);
  assert.equal(summary.confirmed,0,child.stdout.slice(-800));
  assert.equal(summary.mismatching,0);
  assert.equal(summary.checked,selection.length*2*3);
});

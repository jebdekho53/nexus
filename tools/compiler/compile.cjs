'use strict';
const {buildCfg,Unsupported}=require('./cfg.cjs');
const {Lowering}=require('./lower.cjs');
const {structure}=require('./structure.cjs');
const {print}=require('./print.cjs');
const {optimizeBlock,liveness}=require('./optimize.cjs');
const {identifierOf}=require('./names.cjs');

const SUPPORTED_KINDS=/^(DerivedConstructor|ClassMembersInitializerFunction(PrecededByStatic)?|ClassStaticInitializerFunction(PrecededByMember)?|NormalFunction|ArrowFunction|AsyncFunction|AsyncArrowFunction|AsyncConciseMethod|ConciseMethod|StaticConciseMethod|GetterFunction|SetterFunction|BaseConstructor|DefaultBaseConstructor)$/;

// Collapses the generator-style await protocol of async functions into one pseudo instruction:
//   _AsyncFunctionAwait, SuspendGenerator, ResumeGenerator, Star A, _GeneratorGetResumeMode, Star B, LdaZero,
//   TestReferenceEqual B, JumpIfTrue +5, Ldar A, ReThrow      =>  AwaitPseudo [value, A, B]
const starRegister=row=>/^Star\d+$/.test(row[1])?Number(row[1].slice(4)):row[1]==='Star'&&row[2][0]&&'r' in row[2][0]?row[2][0].r:null;
function rewriteAsync(code) {
  const out=[];
  for(let index=0;index<code.length;index++) {
    const row=code[index];
    if(row[1]==='InvokeIntrinsic'&&row[2][0]==='_AsyncFunctionAwait') {
      // Register copies that the generator protocol saves before suspending are kept; they run before the await.
      let at=index+1;
      const saves=[];
      while(code[at]&&code[at][1]==='Mov'){saves.push(code[at]);at++;}
      const seq=code.slice(at,at+10);
      const ok=seq.length===10&&seq[0][1]==='SuspendGenerator'&&seq[1][1]==='ResumeGenerator'&&starRegister(seq[2])!==null
        &&seq[3][1]==='InvokeIntrinsic'&&seq[3][2][0]==='_GeneratorGetResumeMode'&&starRegister(seq[4])!==null&&seq[5][1]==='LdaZero'
        &&seq[6][1]==='TestReferenceEqual'&&seq[7][1]==='JumpIfTrue'&&seq[8][1]==='Ldar'&&seq[9][1]==='ReThrow'
        &&code[at+10]&&seq[7][3]===code[at+10][0];
      if(!ok)throw new Unsupported('unrecognised await sequence');
      const value=row[2][1].range[0]+1;
      out.push(...saves);
      out.push([row[0],'AwaitPseudo',[value,starRegister(seq[2]),starRegister(seq[4])]]);
      index=at+9;
      continue;
    }
    out.push(row);
  }
  return out;
}

// The standard handler of an async function only rejects the result promise: letting the exception propagate out of
// the compiled async function has the same effect.
function plainRejection(handlerBlock) {
  const ops=handlerBlock.rows.map(row=>row[1]);
  if(ops[ops.length-1]!=='Return'||handlerBlock.pred.length)return false;
  const intrinsic=handlerBlock.rows.findIndex(row=>row[1]==='InvokeIntrinsic'&&row[2][0]==='_AsyncFunctionReject');
  if(intrinsic<0||intrinsic!==ops.length-2)return false;
  return handlerBlock.rows.slice(0,intrinsic).every(row=>/^Star\d*$/.test(row[1])||['LdaTheHole','SetPendingMessage','Mov'].includes(row[1]));
}

// Compiles one recovered definition to JavaScript source: `exports.<id>=function(rt,fn,self,args,newTarget,ctx,K){...}`.
// Throws Unsupported for shapes that are not translated yet; those functions keep running in the interpreter.
function compileDefinition(definition,options={}) {
  if(!SUPPORTED_KINDS.test(definition.kind))throw new Unsupported('kind '+definition.kind);
  const isAsync=definition.kind.includes('Async');
  const working=isAsync?{...definition,code:rewriteAsync(definition.code)}:definition;
  const cfg=buildCfg(working);
  const lowering=new Lowering(working,options);
  const lowerBlock=block=>{
    const rows=block.rows;
    const term=block.term;
    const keepLast=term.kind==='fallOff'||(term.kind==='jump'&&term.implicit);
    const body=keepLast?rows:rows.slice(0,-1);
    const lines=body.flatMap(row=>lowering.instruction(row));
    const resolved=term.kind==='cond'&&term.row?{...term,test:lowering.forInDone(term.row)}:term;
    const termText=resolved.kind==='cond'?resolved.test:['return','throw','switch'].includes(resolved.kind)?'acc':null;
    return{lines,term:resolved,termText};
  };
  // lower every block reachable from the entry or a handler, so liveness and register statistics are exact
  const lowered=new Map();
  if(options.optimize!==false) {
    const roots=[cfg.entry,...(working.handlers??[]).map(handler=>cfg.blocks.find(block=>block.pc===handler[2])).filter(Boolean)];
    const pending=[...roots];
    while(pending.length) {
      const block=pending.pop();
      if(lowered.has(block))continue;
      lowered.set(block,lowerBlock(block));
      pending.push(...block.succ);
    }
  }
  const optimized=new Map();
  if(options.optimize!==false) {
    const exceptionalSuccessors=new Map(),entryReads=new Map();
    for(const[start,end,target,,contextRegister]of working.handlers??[]) {
      const handlerBlock=cfg.blocks.find(block=>block.pc===target);
      if(!handlerBlock)continue;
      if(Number.isInteger(contextRegister))entryReads.set(handlerBlock,[...(entryReads.get(handlerBlock)??[]),'r'+contextRegister]);
      for(const block of cfg.blocks)if(block.pc>=start&&block.pc<end)exceptionalSuccessors.set(block,[...(exceptionalSuccessors.get(block)??[]),handlerBlock]);
    }
    const info=liveness([...lowered.keys()],lowered,exceptionalSuccessors,entryReads);
    for(const[block,entry]of lowered) {
      const state=info.get(block);
      const result=optimizeBlock(entry.lines,entry.termText,{liveOut:state.liveOut,exceptional:state.exceptional});
      optimized.set(block,{lines:result.lines,term:entry.term,expr:result.term});
    }
  }
  const emit=block=>{
    const entry=optimized.get(block);
    if(entry) {
      const term=entry.term;
      if(term.kind==='cond')return{lines:entry.lines,term:{...term,test:entry.expr}};
      if(entry.expr!==null&&['return','throw','switch'].includes(term.kind))return{lines:entry.lines,term:{...term,expr:entry.expr}};
      return{lines:entry.lines,term};
    }
    const plain=lowerBlock(block);
    return{lines:plain.lines,term:plain.term};
  };
  const tree=structure(cfg,working.handlers??[],emit,{isPlainRejection:isAsync?plainRejection:undefined});
  const source=print(tree,options);
  const registers=new Set();
  for(const match of source.matchAll(/\br(\d+)\b/g))registers.add(Number(match[1]));
  const incoming=Number.isInteger(definition.incoming)&&definition.incoming>=0&&definition.incoming<definition.registerCount?definition.incoming:null;
  if(incoming!==null)registers.add(incoming);
  const declarations=['acc','pending=HOLE',...[...registers].sort((a,b)=>a-b).map(index=>'r'+index+(index===incoming?'=newTarget':''))];
  const label=options.names?.get(definition.id);
  const own=definition.name&&/^[A-Za-z_$][\w$]*$/.test(definition.name)?definition.name:'';
  const readable=identifierOf(own||label?.hint||'');
  const header=['// '+definition.id+(own?' '+own:'')+(label?.parent?' (created in '+label.parent+(label.hint?', hint: '+label.hint:'')+')':'')];
  return[
    ...(options.names?header:[]),
    'exports.'+definition.id+'='+(isAsync?'async ':'')+'function'+(options.names&&readable?' '+readable+'_'+definition.id:'')+'(rt,fn,self,args,newTarget,ctx,K){',
    '  const{HOLE}=rt;',
    '  let '+declarations.join(',')+';',
    source,
    '};',
  ].join('\n');
}

module.exports={compileDefinition,Unsupported};

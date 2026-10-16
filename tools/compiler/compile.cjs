'use strict';
const {buildCfg,Unsupported}=require('./cfg.cjs');
const {Lowering}=require('./lower.cjs');
const {structure}=require('./structure.cjs');
const {print}=require('./print.cjs');

const SUPPORTED_KINDS=/^(NormalFunction|ArrowFunction|AsyncFunction|AsyncArrowFunction|AsyncConciseMethod|ConciseMethod|StaticConciseMethod|GetterFunction|SetterFunction|BaseConstructor|DefaultBaseConstructor)$/;

// Collapses the generator-style await protocol of async functions into one pseudo instruction:
//   _AsyncFunctionAwait, SuspendGenerator, ResumeGenerator, Star A, _GeneratorGetResumeMode, Star B, LdaZero,
//   TestReferenceEqual B, JumpIfTrue +5, Ldar A, ReThrow      =>  AwaitPseudo [value, A, B]
const starRegister=row=>/^Star\d+$/.test(row[1])?Number(row[1].slice(4)):row[1]==='Star'&&row[2][0]&&'r' in row[2][0]?row[2][0].r:null;
function rewriteAsync(code) {
  const out=[];
  for(let index=0;index<code.length;index++) {
    const row=code[index];
    if(row[1]==='InvokeIntrinsic'&&row[2][0]==='_AsyncFunctionAwait') {
      const seq=code.slice(index,index+11);
      const ok=seq.length===11&&seq[1][1]==='SuspendGenerator'&&seq[2][1]==='ResumeGenerator'&&starRegister(seq[3])!==null
        &&seq[4][1]==='InvokeIntrinsic'&&seq[4][2][0]==='_GeneratorGetResumeMode'&&starRegister(seq[5])!==null&&seq[6][1]==='LdaZero'
        &&seq[7][1]==='TestReferenceEqual'&&seq[8][1]==='JumpIfTrue'&&seq[9][1]==='Ldar'&&seq[10][1]==='ReThrow'
        &&code[index+11]&&seq[8][3]===code[index+11][0];
      if(!ok)throw new Unsupported('unrecognised await sequence');
      const value=row[2][1].range[0]+1;
      out.push([row[0],'AwaitPseudo',[value,starRegister(seq[3]),starRegister(seq[5])]]);
      index+=10;
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
  const emit=block=>{
    const rows=block.rows;
    const term=block.term;
    const keepLast=term.kind==='fallOff'||(term.kind==='jump'&&term.implicit);
    const body=keepLast?rows:rows.slice(0,-1);
    const lines=body.flatMap(row=>lowering.instruction(row));
    return{lines,term};
  };
  const tree=structure(cfg,working.handlers??[],emit,{isPlainRejection:isAsync?plainRejection:undefined});
  const source=print(tree,options);
  const registers=new Set();
  for(const match of source.matchAll(/\br(\d+)\b/g))registers.add(Number(match[1]));
  const incoming=Number.isInteger(definition.incoming)&&definition.incoming>=0&&definition.incoming<definition.registerCount?definition.incoming:null;
  if(incoming!==null)registers.add(incoming);
  const declarations=['acc','pending=HOLE',...[...registers].sort((a,b)=>a-b).map(index=>'r'+index+(index===incoming?'=newTarget':''))];
  return[
    'exports.'+definition.id+'='+(isAsync?'async ':'')+'function(rt,fn,self,args,newTarget,ctx,K){',
    '  const{HOLE}=rt;',
    '  let '+declarations.join(',')+';',
    source,
    '};',
  ].join('\n');
}

module.exports={compileDefinition,Unsupported};

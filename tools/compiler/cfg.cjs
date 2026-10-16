'use strict';
// Control-flow graph construction for recovered instruction definitions.
//
// A definition is a list of rows [offset, opcode, operands, jumpTarget?]. Blocks start at every jump target,
// after every jump/return/throw and at exception-handler boundaries. Edges are labelled so the lowering can
// turn them into structured JavaScript control flow.

const UNCONDITIONAL=new Set(['Jump','JumpConstant','JumpLoop']);
const CONDITIONAL=new Map([
  ['JumpIfTrue','acc===true'],['JumpIfTrueConstant','acc===true'],
  ['JumpIfFalse','acc===false'],['JumpIfFalseConstant','acc===false'],
  ['JumpIfToBooleanTrue','acc'],['JumpIfToBooleanTrueConstant','acc'],
  ['JumpIfToBooleanFalse','!acc'],['JumpIfToBooleanFalseConstant','!acc'],
  ['JumpIfNull','acc===null'],['JumpIfNotNull','acc!==null'],
  ['JumpIfUndefined','acc===undefined'],['JumpIfNotUndefined','acc!==undefined'],
  ['JumpIfUndefinedOrNull','acc==null'],['JumpIfUndefinedOrNullConstant','acc==null'],
  ['JumpIfJSReceiver','rt.receiver(acc)'],
]);
const TERMINATORS=new Set(['Return','Throw','ReThrow']);

class Unsupported extends Error {}

function buildCfg(definition) {
  const code=definition.code;
  const indexOf=new Map(code.map((row,index)=>[row[0],index]));
  const leaders=new Set([0]);
  for(let index=0;index<code.length;index++) {
    const[,op,args,target]=code[index];
    const next=index+1<code.length?index+1:null;
    if(UNCONDITIONAL.has(op)||CONDITIONAL.has(op)) {
      if(target===undefined||!indexOf.has(target))throw new Unsupported('jump without target at '+code[index][0]);
      leaders.add(indexOf.get(target));
      if(next!==null)leaders.add(next);
    } else if(TERMINATORS.has(op)) {
      if(next!==null)leaders.add(next);
    } else if(op==='SwitchOnSmiNoFeedback') {
      const table=args.find(value=>value&&value.table)?.table;
      if(!table)throw new Unsupported('switch without table');
      for(const destination of Object.values(table)) {
        if(!indexOf.has(destination))throw new Unsupported('switch target missing');
        leaders.add(indexOf.get(destination));
      }
      if(next!==null)leaders.add(next);
    }
  }
  for(const[start,end,handler]of definition.handlers??[]) {
    for(const offset of[start,end,handler])if(indexOf.has(offset))leaders.add(indexOf.get(offset));
  }
  const starts=[...leaders].sort((a,b)=>a-b);
  const blocks=starts.map((start,order)=>({id:order,start,pc:code[start][0],end:(starts[order+1]??code.length),rows:null,succ:[],pred:[]}));
  const byIndex=new Map(blocks.map(block=>[block.start,block]));
  for(const block of blocks) {
    block.rows=code.slice(block.start,block.end);
    const last=block.rows[block.rows.length-1];
    const[,op,args,target]=last;
    const fall=byIndex.get(block.end);
    if(UNCONDITIONAL.has(op)) {
      block.term={kind:'jump',to:byIndex.get(indexOf.get(target))};
    } else if(CONDITIONAL.has(op)) {
      block.term={kind:'cond',test:CONDITIONAL.get(op),then:byIndex.get(indexOf.get(target)),otherwise:fall};
    } else if(op==='Return') {
      block.term={kind:'return'};
    } else if(op==='Throw'||op==='ReThrow') {
      block.term={kind:'throw'};
    } else if(op==='SwitchOnSmiNoFeedback') {
      const table=args.find(value=>value&&value.table).table;
      block.term={kind:'switch',cases:Object.entries(table).map(([key,destination])=>[Number(key),byIndex.get(indexOf.get(destination))]),otherwise:fall};
    } else if(fall) {
      block.term={kind:'jump',to:fall,implicit:true};
    } else {
      block.term={kind:'fallOff'};
    }
    if(block.term.kind==='jump')block.succ=[block.term.to];
    else if(block.term.kind==='cond')block.succ=[block.term.then,block.term.otherwise].filter(Boolean);
    else if(block.term.kind==='switch')block.succ=[...new Set([...block.term.cases.map(row=>row[1]),block.term.otherwise].filter(Boolean))];
    for(const successor of block.succ)successor.pred.push(block);
  }
  return{blocks,entry:blocks[0],indexOf};
}

module.exports={buildCfg,Unsupported,UNCONDITIONAL,CONDITIONAL};

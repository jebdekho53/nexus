'use strict';
// Structured control-flow recovery for reducible graphs (Ramsey, "Beyond Relooper").
// The result is a tree of statements, labelled blocks and loops; every jump becomes a labelled break/continue,
// an inlined dominated block, a return or a throw. Irreducible graphs are rejected (the function then keeps
// running in the interpreter).
const {Unsupported}=require('./cfg.cjs');

function analyse(cfg) {
  const blocks=cfg.blocks;
  // depth-first search: reverse postorder and back edges
  const state=new Map(),postorder=[],backEdges=new Set();
  const visit=block=>{
    state.set(block,1);
    for(const next of block.succ) {
      if(!state.has(next))visit(next);
      else if(state.get(next)===1)backEdges.add(block.id+'>'+next.id);
    }
    state.set(block,2);
    postorder.push(block);
  };
  visit(cfg.entry);
  const reachable=new Set(postorder);
  const rpo=new Map();
  [...postorder].reverse().forEach((block,index)=>rpo.set(block,index));
  // dominators (Cooper-Harvey-Kennedy)
  const order=[...postorder].reverse();
  const idom=new Map([[cfg.entry,cfg.entry]]);
  const intersect=(x,y)=>{
    while(x!==y) {
      while(rpo.get(x)>rpo.get(y))x=idom.get(x);
      while(rpo.get(y)>rpo.get(x))y=idom.get(y);
    }
    return x;
  };
  for(let changed=true;changed;) {
    changed=false;
    for(const block of order) {
      if(block===cfg.entry)continue;
      let candidate=null;
      for(const pred of block.pred) {
        if(!reachable.has(pred)||!idom.has(pred))continue;
        candidate=candidate===null?pred:intersect(pred,candidate);
      }
      if(candidate!==null&&idom.get(block)!==candidate){idom.set(block,candidate);changed=true;}
    }
  }
  const dominates=(a,b)=>{
    for(let node=b;;node=idom.get(node)) {
      if(node===a)return true;
      if(node===idom.get(node))return false;
    }
  };
  const forwardPreds=new Map(),isBack=(from,to)=>backEdges.has(from.id+'>'+to.id);
  for(const block of order) {
    forwardPreds.set(block,block.pred.filter(pred=>reachable.has(pred)&&!isBack(pred,block)).length);
  }
  for(const key of backEdges) {
    const[from,to]=key.split('>').map(Number);
    if(!dominates(blocks[to],blocks[from]))throw new Unsupported('irreducible control flow');
  }
  const children=new Map(order.map(block=>[block,[]]));
  for(const block of order)if(block!==cfg.entry)children.get(idom.get(block)).push(block);
  const loopHeaders=new Set();
  for(const key of backEdges)loopHeaders.add(blocks[Number(key.split('>')[1])]);
  return{order,rpo,idom,children,loopHeaders,isBack,forwardPreds,reachable};
}

// emit(block) -> {lines:[...], term} is supplied by the caller
function structure(cfg,emit) {
  const info=analyse(cfg);
  const isMerge=block=>info.forwardPreds.get(block)>=2;
  let labelCounter=0;
  const labels=new Map();
  const labelOf=(block,kind)=>{
    const key=kind+block.id;
    if(!labels.has(key))labels.set(key,kind+block.id);
    return labels.get(key);
  };
  const used=new Set();

  function doTree(x,context) {
    const merges=info.children.get(x).filter(isMerge).sort((a,b)=>info.rpo.get(b)-info.rpo.get(a));
    const body=()=>nodeWithin(x,merges,x_context(x,context));
    if(info.loopHeaders.has(x)) {
      const label=labelOf(x,'L');
      return[{k:'loop',label,body:nodeWithin(x,merges,[{kind:'loop',block:x},...context])}];
    }
    return nodeWithin(x,merges,context);
  }
  const x_context=(x,context)=>context;

  function nodeWithin(x,ys,context) {
    if(!ys.length)return codeFor(x,context);
    const[y,...rest]=ys;
    const label=labelOf(y,'B');
    const inner=nodeWithin(x,rest,[{kind:'block',block:y},...context]);
    return[{k:'block',label,body:inner},...doTree(y,context)];
  }

  function branch(source,target,context) {
    if(info.isBack(source,target)) {
      used.add('L'+target.id);
      return[{k:'continue',label:'L'+target.id}];
    }
    if(isMerge(target)) {
      if(!context.some(entry=>entry.kind==='block'&&entry.block===target))throw new Unsupported('missing block for merge');
      return[{k:'break',label:'B'+target.id}];
    }
    return doTree(target,context);
  }

  function codeFor(x,context) {
    const{lines,term}=emit(x);
    const out=[];
    if(lines.length)out.push({k:'stmts',lines});
    switch(term.kind) {
      case 'jump': out.push(...branch(x,term.to,context)); break;
      case 'cond': out.push({k:'if',test:term.test,then:branch(x,term.then,context),else:branch(x,term.otherwise,context)}); break;
      case 'return': out.push({k:'return'}); break;
      case 'throw': out.push({k:'throw'}); break;
      case 'fallOff': out.push({k:'return-undefined'}); break;
      case 'switch': out.push({k:'switch',cases:term.cases.map(([key,target])=>[key,branch(x,target,context)]),otherwise:branch(x,term.otherwise,context)}); break;
      default: throw new Unsupported('terminator '+term.kind);
    }
    return out;
  }

  return{tree:doTree(cfg.entry,[]),info};
}

module.exports={structure,analyse};

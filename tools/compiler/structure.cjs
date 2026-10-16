'use strict';
// Structured control-flow recovery for reducible graphs (Ramsey, "Beyond Relooper"), with exception-handler
// regions collapsed into `try` nodes first. The result is a tree of statements, labelled blocks, loops and
// try/catch; every jump becomes a labelled break/continue, an inlined dominated block, a return or a throw.
// Irreducible graphs and regions with more than one entry are rejected (the function keeps running in the
// interpreter).
const {Unsupported}=require('./cfg.cjs');

class BlockNode {
  constructor(block){this.id=block.id;this.kind='block';this.block=block;this.blocks=new Set([block]);this.pc=block.pc;}
}
class TryNode {
  constructor(id,members,entry,catchTo,contextRegister){
    this.id=id;this.kind='try';this.members=members;this.entry=entry;this.catchTo=catchTo;this.contextRegister=contextRegister;
    this.blocks=new Set(members.flatMap(member=>[...member.blocks]));
    this.pc=Math.min(...members.map(member=>member.pc));
  }
}

// Builds the node hierarchy: blocks wrapped by try nodes for each handler range (smallest ranges first).
function collapseHandlers(cfg,handlers,isPlainRejection) {
  let nodes=cfg.blocks.map(block=>new BlockNode(block));
  const sorted=[...handlers].sort((a,b)=>(a[1]-a[0])-(b[1]-b[0])||a[0]-b[0]);
  let nextId=cfg.blocks.length;
  const blockAt=pc=>cfg.blocks.find(block=>block.pc===pc);
  for(const[start,end,target,,contextRegister]of sorted) {
    const handlerBlock=blockAt(target);
    if(!handlerBlock)throw new Unsupported('handler target is not a block start');
    if(isPlainRejection&&isPlainRejection(handlerBlock,start,end))continue;
    const members=nodes.filter(node=>node.pc>=start&&node.pc<end);
    if(!members.length)continue;
    const entryNode=members.find(node=>node.pc===start);
    if(!entryNode)throw new Unsupported('handler range does not start at a block');
    const memberBlocks=new Set(members.flatMap(member=>[...member.blocks]));
    if(memberBlocks.has(handlerBlock))throw new Unsupported('handler inside its own region');
    for(const block of cfg.blocks) {
      if(memberBlocks.has(block))continue;
      for(const successor of block.succ) {
        if(memberBlocks.has(successor)&&![...entryNode.blocks][0]!==successor&&successor!==firstBlockOf(entryNode))throw new Unsupported('region with several entries');
      }
    }
    const node=new TryNode(nextId++,members,entryNode,handlerBlock,contextRegister);
    nodes=nodes.filter(item=>!members.includes(item));
    nodes.push(node);
  }
  return nodes;
}
function firstBlockOf(node) {
  return node.kind==='block'?node.block:firstBlockOf(node.entry);
}

function analyse(nodes,entry,succOf) {
  const state=new Map(),postorder=[],backEdges=new Set();
  const visit=node=>{
    state.set(node,1);
    for(const next of succOf(node)) {
      if(!state.has(next))visit(next);
      else if(state.get(next)===1)backEdges.add(node.id+'>'+next.id);
    }
    state.set(node,2);
    postorder.push(node);
  };
  visit(entry);
  const reachable=new Set(postorder);
  const order=[...postorder].reverse();
  const rpo=new Map(order.map((node,index)=>[node,index]));
  const preds=new Map(order.map(node=>[node,[]]));
  for(const node of order)for(const next of succOf(node))preds.get(next).push(node);
  const idom=new Map([[entry,entry]]);
  const intersect=(x,y)=>{
    while(x!==y) {
      while(rpo.get(x)>rpo.get(y))x=idom.get(x);
      while(rpo.get(y)>rpo.get(x))y=idom.get(y);
    }
    return x;
  };
  for(let changed=true;changed;) {
    changed=false;
    for(const node of order) {
      if(node===entry)continue;
      let candidate=null;
      for(const pred of preds.get(node)) {
        if(!idom.has(pred))continue;
        candidate=candidate===null?pred:intersect(pred,candidate);
      }
      if(candidate!==null&&idom.get(node)!==candidate){idom.set(node,candidate);changed=true;}
    }
  }
  const dominates=(a,b)=>{
    for(let node=b;;node=idom.get(node)) {
      if(node===a)return true;
      if(node===idom.get(node))return false;
    }
  };
  const byId=new Map(order.map(node=>[node.id,node]));
  const isBack=(from,to)=>backEdges.has(from.id+'>'+to.id);
  for(const key of backEdges) {
    const[from,to]=key.split('>').map(Number);
    if(!dominates(byId.get(to),byId.get(from)))throw new Unsupported('irreducible control flow');
  }
  const forwardPreds=new Map(order.map(node=>[node,preds.get(node).filter(pred=>!isBack(pred,node)).length]));
  const children=new Map(order.map(node=>[node,[]]));
  for(const node of order)if(node!==entry)children.get(idom.get(node)).push(node);
  const loopHeaders=new Set([...backEdges].map(key=>byId.get(Number(key.split('>')[1]))));
  return{order,rpo,idom,children,loopHeaders,isBack,forwardPreds,reachable};
}

// emitBlock(block) -> {lines, term}; term targets are original blocks.
function structure(cfg,handlers,emitBlock,options={}) {
  const topNodes=collapseHandlers(cfg,handlers,options.isPlainRejection);
  const topEntry=topNodes.find(node=>node.blocks.has(cfg.entry));
  if(firstBlockOf(topEntry)!==cfg.entry)throw new Unsupported('entry is inside a region');

  function level(nodes,entry,externalBranch) {
    const owner=new Map();
    for(const node of nodes)for(const block of node.blocks)owner.set(block,node);
    const succOf=node=>{
      const found=new Set();
      for(const block of node.blocks)for(const next of block.succ) {
        const target=owner.get(next);
        if(target&&target!==node)found.add(target);
      }
      if(node.kind==='try') {
        const target=owner.get(node.catchTo);
        if(target&&target!==node)found.add(target);
      }
      return[...found];
    };
    const info=analyse(nodes,entry,succOf);
    const forced=new Set();
    for(const node of info.order)if(node.kind==='try')for(const next of succOf(node))forced.add(next);
    const isMerge=node=>info.forwardPreds.get(node)>=2||forced.has(node);

    function doTree(x,context) {
      const merges=info.children.get(x).filter(isMerge).sort((a,b)=>info.rpo.get(b)-info.rpo.get(a));
      if(info.loopHeaders.has(x))return[{k:'loop',label:'L'+x.id,body:nodeWithin(x,merges,[{kind:'loop',node:x},...context])}];
      return nodeWithin(x,merges,context);
    }
    function nodeWithin(x,ys,context) {
      if(!ys.length)return codeFor(x,context);
      const[y,...rest]=ys;
      const inner=nodeWithin(x,rest,[{kind:'block',node:y},...context]);
      return[{k:'block',label:'B'+y.id,body:inner},...doTree(y,context)];
    }
    function branch(source,targetBlock,context) {
      const target=owner.get(targetBlock);
      if(!target)return externalBranch(targetBlock);
      if(target.kind==='block'&&target.block!==targetBlock)throw new Unsupported('unexpected owner');
      if(target.kind==='try'&&firstBlockOf(target)!==targetBlock)throw new Unsupported('jump into a try region');
      if(info.isBack(source,target))return[{k:'continue',label:'L'+target.id}];
      if(isMerge(target)) {
        if(!context.some(entry=>entry.kind==='block'&&entry.node===target))throw new Unsupported('missing block for merge');
        return[{k:'break',label:'B'+target.id}];
      }
      return doTree(target,context);
    }
    function codeFor(x,context) {
      if(x.kind==='try') {
        const body=level(x.members,x.entry,targetBlock=>branch(x,targetBlock,context));
        const handler=branch(x,x.catchTo,context);
        return[{k:'try',id:x.id,body,contextRegister:x.contextRegister,handler}];
      }
      const{lines,term}=emitBlock(x.block);
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
    return doTree(entry,[]);
  }

  return level(topNodes,topEntry,()=>{throw new Unsupported('branch outside the function');});
}

module.exports={structure};

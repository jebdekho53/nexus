'use strict';
// Readability optimiser for lowered basic blocks. The lowering emits accumulator/register code
// (`acc=...; r3=acc; ...`); this pass folds single-use temporaries back into nested expressions and rewrites
// `rt.call(x.f,x,[...])` into `x.f(...)`.
//
// Safety model (every step is a local, order-preserving move of one expression):
//  * a register is inlined only when it has exactly one definition and one read in the whole function and both
//    sit in the same basic block; `acc` only when the read is its only use before it is overwritten or dead;
//  * the moved expression may cross only statements/operands that cannot observe or change what it reads or does
//    (see movable()), and never a conditionally evaluated position.
const IDENT=/^[A-Za-z_$][\w$]*$/;
const REGISTER=/^r\d+$/;
const KEYWORDS=new Set(['typeof','return','throw','await','new','delete','void','in','instanceof','case','else']);
const TOKEN=/\s*("(?:[^"\\]|\\.)*"|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\.\.|>>>|===|!==|\*\*|<<|>>|<=|>=|==|!=|&&|\|\||[^\s])/y;

function tokenize(text) {
  const tokens=[];
  TOKEN.lastIndex=0;
  while(TOKEN.lastIndex<text.length) {
    const match=TOKEN.exec(text);
    if(!match)throw new Error('cannot tokenize: '+text);
    tokens.push({s:match[1],w:match[0].slice(0,match[0].length-match[1].length)});
  }
  return tokens;
}
const render=tokens=>tokens.map(token=>token.w+token.s).join('');
const tracked=name=>name==='acc'||name==='ctx'||name==='self'||name==='pending'||name==='args'||REGISTER.test(name);
const isNumber=text=>/^\d/.test(text);

// Classification of an expression: atom (no memory, no effects), mem (reads one context slot), general.
function expressionClass(tokens) {
  const t=tokens.map(token=>token.s);
  if(t.length===1&&(IDENT.test(t[0])&&!KEYWORDS.has(t[0])||isNumber(t[0])||t[0][0]==='"'))return 'atom';
  if(t.length===2&&t[0]==='-'&&isNumber(t[1]))return 'atom';
  if(t.length===4&&t[1]==='['&&isNumber(t[2])&&t[3]===']') {
    if(t[0]==='args')return 'atom';
    if(t[0]==='ctx')return 'mem';
  }
  return 'general';
}

function analyse(tokens,isTerm=false) {
  const t=tokens.map(token=>token.s);
  const n=t.length;
  const a={tokens,assign:null,reads:[],writes:new Set(),kind:'expr',cls:'G',rhsClass:'general'};
  if(isTerm) {
    a.kind='term';
    t.forEach((name,index)=>{if(tracked(name))a.reads.push(index);});
    return a;
  }
  let simple=n>=4&&t[n-1]===';'&&t[1]==='='&&(t[0]==='acc'||t[0]==='ctx'||t[0]==='self'||REGISTER.test(t[0]));
  if(simple)for(let index=2;index<n-1;index++)if(t[index]===';'||t[index]==='='){simple=false;break;}
  if(simple) {
    a.kind='assign';a.assign=t[0];a.writes.add(t[0]);
    for(let index=2;index<n-1;index++)if(tracked(t[index]))a.reads.push(index);
    a.rhsClass=expressionClass(tokens.slice(2,-1));
    a.cls=a.rhsClass==='atom'?'T0':a.rhsClass==='mem'?'T1':'G';
    return a;
  }
  t.forEach((name,index)=>{if(tracked(name))a.reads.push(index);});
  if(t[0]==='{'||t.slice(0,-1).includes(';')) {
    a.kind='multi';
    for(const index of a.reads)a.writes.add(t[index]);
    return a;
  }
  if(t.includes('=')) {
    a.kind='store';
    if(t[0]==='args')a.writes.add('args');
    return a;
  }
  return a;
}

// ---- local checks --------------------------------------------------------------------------------------------

function movable(klass,reads,statements) {
  for(const statement of statements) {
    if(statement.dead)continue;
    for(const name of statement.a.writes)if(reads.has(name))return false;
    if(klass==='atom')continue;
    if(klass==='mem'&&(statement.a.cls==='T0'||statement.a.cls==='T1'))continue;
    if(klass==='general'&&statement.a.cls==='T0')continue;
    return false;
  }
  return true;
}

// Is everything evaluated before position `pos` free of effects the moved expression could interact with?
function prefixInert(tokens,pos,klass) {
  if(klass==='atom')return true;
  const stack=[];
  for(let index=0;index<pos;index++) {
    const text=tokens[index].s;
    if(text==='&&'||text==='||'||text==='?'||text==='??')return false; // conditionally evaluated from here on
    if(text==='('||text==='['||text==='{') {
      const before=index>0?tokens[index-1].s:'';
      stack.push({open:text,at:index,access:(IDENT.test(before)&&!KEYWORDS.has(before))||before===']'||before===')'});
    } else if(text===')'||text===']'||text==='}') {
      const opener=stack.pop();
      if(!opener)continue;
      if(text===')'&&opener.access)return false;
      if(text===']'&&opener.access) {
        const base=tokens[opener.at-1].s;
        const inner=tokens.slice(opener.at+1,index);
        const numeric=inner.length===1&&isNumber(inner[0].s);
        if(numeric&&(base==='args'||(base==='ctx'&&klass==='mem')))continue;
        return false;
      }
    } else if(text==='.') {
      const base=tokens[index-1].s;
      if(base!=='rt'&&base!=='Reflect')return false;
    }
  }
  return true;
}

function isChain(tokens) {
  const t=tokens.map(token=>token.s);
  let index=0;
  const skip=(open,close)=>{
    let depth=0;
    for(;index<t.length;index++) {
      if(t[index]===open)depth++;
      else if(t[index]===close&&--depth===0){index++;return true;}
    }
    return false;
  };
  const first=t[0];
  if(IDENT.test(first)&&!KEYWORDS.has(first)&&first!=='function'){index=1;}
  else if(first[0]==='"')index=1;
  else if(first==='('){if(!skip('(',')'))return false;}
  else if(first==='['){if(!skip('[',']'))return false;}
  else if(first==='{'){if(!skip('{','}'))return false;}
  else if(isNumber(first)){return t.length===1;}
  else return false;
  while(index<t.length) {
    if(t[index]==='.'&&index+1<t.length&&IDENT.test(t[index+1]))index+=2;
    else if(t[index]==='['){if(!skip('[',']'))return false;}
    else if(t[index]==='('){if(!skip('(',')'))return false;}
    else return false;
  }
  return true;
}

function wrapIfNeeded(expression,tokens,pos,leading) {
  const before=pos>0?tokens[pos-1].s:'(';
  const after=pos+1<tokens.length?tokens[pos+1].s:')';
  const delimited=(before==='('||before==='['||before===','||(before==='='&&pos===2))&&(after===')'||after===']'||after===','||after===';');
  let result=expression;
  const postfixed=after==='.'||after==='['||after==='(';
  if(!(delimited||(isChain(expression)&&!(postfixed&&isNumber(expression[0].s)))))result=[{s:'(',w:''},...expression,{s:')',w:''}];
  result=result.map((token,index)=>index===0?{s:token.s,w:leading}:token);
  return result;
}

// ---- block optimisation ---------------------------------------------------------------------------------------

function optimizeBlock(lines,termText,context) {
  const statements=lines.map(line=>({a:analyse(tokenize(line)),dead:false}));
  let term=null;
  if(termText!==null&&termText!==undefined) {
    term={a:analyse([{s:'(',w:''},...tokenize(termText),{s:')',w:''}],true),dead:false,isTerm:true};
    statements.push(term);
  }
  const{liveOut,exceptional}=context;
  const windowSize=256;

  const readCount=(statement,name)=>statement.a.reads.filter(index=>statement.a.tokens[index].s===name).length;
  const deadAfter=(index,name)=>{
    if(statements[index].a.assign===name)return true;
    for(let at=index+1;at<statements.length;at++) {
      const next=statements[at];
      if(next.dead)continue;
      if(readCount(next,name)>0)return false;
      if(next.a.assign===name)return true;
      if(next.a.writes.has(name))return false;
    }
    return !liveOut.has(name);
  };

  function tryInline(index,pos) {
    const user=statements[index];
    if(user.a.kind==='multi')return false;
    const name=user.a.tokens[pos].s;
    if(name!=='acc'&&!REGISTER.test(name))return false;
    if(exceptional.has(name)||readCount(user,name)!==1)return false;
    let at=-1;
    for(let back=index-1;back>=0&&index-back<=windowSize;back--) {
      const candidate=statements[back];
      if(candidate.dead)continue;
      if(candidate.a.writes.has(name)){at=back;break;}
      if(readCount(candidate,name)>0)return false;
    }
    if(at<0||statements[at].a.assign!==name)return false;
    // the defining statement itself may read the old value (acc=r2[acc]); that read keeps its meaning after the move
    if(!deadAfter(index,name))return false;
    const definition=statements[at];
    const expression=definition.a.tokens.slice(2,-1);
    const klass=definition.a.rhsClass;
    const reads=new Set(expression.map(token=>token.s).filter(tracked));
    if(!movable(klass,reads,statements.slice(at+1,index)))return false;
    if(!prefixInert(user.a.tokens,pos,klass))return false;
    const tokens=user.a.tokens;
    const replacement=wrapIfNeeded(expression,tokens,pos,tokens[pos].w);
    const next=[...tokens.slice(0,pos),...replacement,...tokens.slice(pos+1)];
    user.a=analyse(next,user.isTerm===true);
    definition.dead=true;
    return true;
  }

  for(let round=0;round<12;round++) {
    let changed=false;
    for(let index=0;index<statements.length;index++) {
      if(statements[index].dead)continue;
      let progress=true;
      while(progress) {
        progress=false;
        const positions=[...statements[index].a.reads].reverse();
        for(const pos of positions) {
          if(tryInline(index,pos)){progress=true;changed=true;break;}
        }
      }
    }
    if(!changed)break;
  }

  const out=[];
  for(const statement of statements) {
    if(statement.dead||statement.isTerm)continue;
    out.push(render(callPeephole(statement.a.tokens)));
  }
  let termOut=null;
  if(term)termOut=render(callPeephole(term.a.tokens.slice(1,-1))).trim();
  return{lines:out,term:termOut};
}

// rt.call(F,undefined,[a]) -> F(a) for plain identifiers; rt.call(x.f,x,[a]) / rt.call(x[k],x,[a]) -> x.f(a)
function callPeephole(tokens) {
  let current=tokens;
  for(let guard=0;guard<10000;guard++) {
    let found=false;
    for(let index=current.length-4;index>=0;index--) {
      if(current[index].s!=='rt'||current[index+1].s!=='.'||current[index+2].s!=='call'||current[index+3].s!=='(')continue;
      const open=index+3;
      const args=[];
      let depth=0,start=open+1,close=-1;
      for(let at=open;at<current.length;at++) {
        const text=current[at].s;
        if(text==='('||text==='['||text==='{')depth++;
        else if(text===')'||text===']'||text==='}') {
          depth--;
          if(depth===0){args.push([start,at]);close=at;break;}
        } else if(text===','&&depth===1){args.push([start,at]);start=at+1;}
      }
      if(close<0||args.length!==3)continue;
      const part=([from,to])=>current.slice(from,to);
      const callee=part(args[0]),receiver=part(args[1]),list=part(args[2]);
      if(!list.length||list[0].s!=='['||list[list.length-1].s!==']')continue;
      let match=0,balance=0;
      for(let at=0;at<list.length;at++){if(list[at].s==='[')balance++;else if(list[at].s===']'){balance--;if(balance===0){match=at;break;}}}
      if(match!==list.length-1)continue;
      let replacement=null;
      const plain=token=>IDENT.test(token.s)&&!KEYWORDS.has(token.s);
      if(receiver.length===1&&receiver[0].s==='undefined'&&callee.length===1&&plain(callee[0])&&callee[0].s!=='undefined')replacement=callee;
      else if(receiver.length===1&&plain(receiver[0])&&receiver[0].s!=='undefined'&&callee.length>=3&&callee[0].s===receiver[0].s&&tracked(receiver[0].s)) {
        if(callee[1].s==='.'&&callee.length===3&&IDENT.test(callee[2].s))replacement=callee;
        else if(callee[1].s==='[') {
          let level=0,end=-1;
          for(let at=1;at<callee.length;at++){if(callee[at].s==='[')level++;else if(callee[at].s===']'){level--;if(level===0){end=at;break;}}}
          if(end===callee.length-1)replacement=callee;
        }
      }
      if(!replacement)continue;
      const inner=list.slice(1,-1);
      const lead=current[index].w;
      const callTokens=[...replacement.map((token,at)=>at===0?{s:token.s,w:lead}:token),{s:'(',w:''},...inner,{s:')',w:''}];
      current=[...current.slice(0,index),...callTokens,...current.slice(close+1)];
      found=true;
      break;
    }
    if(!found)break;
  }
  return current;
}

// ---- function-level analysis --------------------------------------------------------------------------------

// Variable liveness over lowered blocks. Normal edges follow block.succ. Exceptional edges (try regions) carry
// register liveness only: the catch entry overwrites acc with the exception and re-reads its context register.
function liveness(blocks,lowered,exceptionalSuccessors,entryReads) {
  const info=new Map();
  for(const block of blocks) {
    const entry=lowered.get(block);
    if(!entry)continue;
    const statements=entry.lines.map(line=>analyse(tokenize(line)));
    if(entry.termText!=null)statements.push(analyse([{s:'(',w:''},...tokenize(entry.termText),{s:')',w:''}],true));
    const use=new Set(entryReads.get(block)??[]),defined=new Set();
    for(const statement of statements) {
      for(const index of statement.reads) {
        const name=statement.tokens[index].s;
        if(!defined.has(name))use.add(name);
      }
      for(const name of statement.writes)defined.add(name);
    }
    info.set(block,{use,defined,liveIn:new Set(use),liveOut:new Set(),exceptional:new Set()});
  }
  for(let changed=true;changed;) {
    changed=false;
    for(const block of blocks) {
      const entry=info.get(block);
      if(!entry)continue;
      const liveOut=new Set(),exceptional=new Set();
      for(const next of block.succ)for(const name of info.get(next)?.liveIn??[])liveOut.add(name);
      for(const next of exceptionalSuccessors.get(block)??[])for(const name of info.get(next)?.liveIn??[])if(name!=='acc')exceptional.add(name);
      const liveIn=new Set(entry.use);
      for(const name of liveOut)if(!entry.defined.has(name))liveIn.add(name);
      for(const name of exceptional)liveIn.add(name);
      if(liveIn.size!==entry.liveIn.size||liveOut.size!==entry.liveOut.size||exceptional.size!==entry.exceptional.size){
        entry.liveIn=liveIn;entry.liveOut=liveOut;entry.exceptional=exceptional;changed=true;
      }
    }
  }
  return info;
}

module.exports={tokenize,render,optimizeBlock,liveness,analyse};

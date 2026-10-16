'use strict';
// Synthetic "world" for differential execution of a recovered function: a seeded pseudo-random environment whose
// every interaction (property reads, calls, writes) is recorded. The interpreter and the compiled body must
// produce identical interaction logs, return values and errors in identical worlds. No real service, profile or
// network is involved.
const SYMBOL_PRIMITIVE=Symbol.toPrimitive;

function mulberry32(seed) {
  let state=seed>>>0;
  return()=>{
    state=(state+0x6D2B79F5)>>>0;
    let t=state;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return((t^(t>>>14))>>>0)/4294967296;
  };
}

const WORDS=['','a','abc','x y','123','true','GN','SL','3A','irctc.co.in','https://x.invalid/a?b=1','  pad  ','manual','{"a":1}','null','TQ','e'];
const NUMBERS=[0,1,2,3,5,10,59,60,100,255,-1,0.5,1e6,19800000,NaN];

function createWorld(seed) {
  const random=mulberry32(seed);
  const log=[];
  let nextId=1,steps=0;
  const record=entry=>{
    log.push(entry);
    if(++steps>1500)throw new Error('WORLD_STEP_LIMIT');
  };
  const pick=list=>list[Math.floor(random()*list.length)];
  const ids=new WeakMap();
  const idOf=value=>{
    if(!ids.has(value))ids.set(value,nextId++);
    return ids.get(value);
  };

  function summary(value,depth=0) {
    if(value===undefined)return 'undefined';
    if(value===null)return 'null';
    const type=typeof value;
    if(type==='number')return Number.isNaN(value)?'NaN':Object.is(value,-0)?'-0':'n:'+value;
    if(type==='string')return 's:'+value.slice(0,60);
    if(type==='boolean'||type==='bigint')return type[0]+':'+String(value);
    if(type==='symbol')return 'sym';
    if(ids.has(value))return 'stub#'+ids.get(value);
    if(type==='function')return 'fn:'+(value.name||'');
    if(Array.isArray(value))return depth>2?'[..]':'['+value.map(item=>summary(item,depth+1)).join(',')+']';
    if(value instanceof Error)return 'err:'+value.name+':'+String(value.message).slice(0,60);
    if(value instanceof RegExp)return 're:'+value;
    if(depth>2)return '{..}';
    try {return '{'+Reflect.ownKeys(value).slice(0,12).map(key=>String(key)+'='+summary(value[key],depth+1)).join(',')+'}';}
    catch{return '{?}';}
  }

  function stubObject(label) {
    const memo=new Map(),target={};
    const proxy=new Proxy(target,{
      get(object,key){
        if(key==='then')return undefined;
        if(key===SYMBOL_PRIMITIVE)return hint=>{record(['toPrimitive',idOf(proxy),hint]);return hint==='number'?7:'prim';};
        if(!memo.has(key))memo.set(key,generate(1));
        const value=memo.get(key);
        record(['get',idOf(proxy),String(key),summary(value)]);
        return value;
      },
      set(object,key,value){record(['set',idOf(proxy),String(key),summary(value)]);memo.set(key,value);return true;},
      has(object,key){record(['has',idOf(proxy),String(key)]);return memo.has(key)||random()<0.5;},
      deleteProperty(object,key){record(['delete',idOf(proxy),String(key)]);memo.delete(key);return true;},
      ownKeys(){record(['ownKeys',idOf(proxy)]);return[...memo.keys()].filter(key=>typeof key==='string').slice(0,4);},
      getOwnPropertyDescriptor(object,key){return memo.has(key)?{value:memo.get(key),writable:true,enumerable:true,configurable:true}:undefined;},
      defineProperty(object,key,descriptor){record(['define',idOf(proxy),String(key)]);memo.set(key,descriptor.value);return true;},
    });
    idOf(proxy);
    return proxy;
  }

  function stubFunction(label) {
    const proxy=new Proxy(function stub(){},{
      apply(target,thisValue,args){
        record(['call',idOf(proxy),summary(thisValue),args.map(arg=>summary(arg)).join('|')]);
        return generate(1);
      },
      construct(target,args){
        record(['construct',idOf(proxy),args.map(arg=>summary(arg)).join('|')]);
        return stubObject('constructed');
      },
      get(target,key){
        if(key==='name')return 'stub';
        if(key==='then')return undefined;
        if(key===SYMBOL_PRIMITIVE)return undefined;
        if(key==='prototype')return Reflect.get(target,key);
        record(['fget',idOf(proxy),String(key)]);
        return key==='call'||key==='apply'||key==='bind'?Reflect.get(Function.prototype,key):undefined;
      },
    });
    idOf(proxy);
    return proxy;
  }

  function generate(depth=0) {
    const roll=random();
    if(roll<0.08)return undefined;
    if(roll<0.14)return null;
    if(roll<0.28)return pick(NUMBERS);
    if(roll<0.5)return pick(WORDS);
    if(roll<0.56)return random()<0.5;
    if(roll<0.68)return stubFunction('fn');
    if(roll<0.84)return stubObject('obj');
    if(depth>2)return pick(NUMBERS);
    const length=Math.floor(random()*4);
    return Array.from({length},()=>generate(depth+1));
  }

  // Fake Math/Date keep results deterministic.
  const fakeMath=Object.create(Math);
  fakeMath.random=()=>{const value=random();record(['random']);return value;};
  const fakeDate=class extends Date{constructor(...args){super(...(args.length?args:[1760000000000]));}static now(){record(['now']);return 1760000000000;}};
  const realNames=['Object','Array','String','Number','Boolean','JSON','RegExp','Promise','Error','TypeError','RangeError','SyntaxError','ReferenceError','Symbol','Map','Set','WeakMap','WeakSet','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','Reflect','Infinity','NaN','undefined','BigInt','URLSearchParams','URL'];
  const stubNames=['process','require','Buffer','setTimeout','setInterval','clearTimeout','clearInterval','console','module','exports','globalThis','navigator','document','window','fetch','AbortController','TextEncoder','TextDecoder','crypto'];
  const globals={};
  for(const name of realNames)globals[name]=globalThis[name];
  globals.Math=fakeMath;globals.Date=fakeDate;
  for(const name of stubNames)globals[name]=name.charAt(0)<'a'||name==='console'||name==='process'?stubObject(name):stubFunction(name);

  function context(depth,slots=24) {
    let parent=null;
    const chain=[];
    for(let level=0;level<depth;level++) {
      const items=new Array(slots);
      chain.unshift(items);
    }
    return chain;
  }

  // The string decoder lives in slot 5 of the outermost context and in slot 2 of function contexts.
  function decoder() {
    const fn=function(index,key){record(['decode',summary(index),summary(key)]);return pick(WORDS);};
    return fn;
  }

  return{random,log,generate,summary,stubObject,stubFunction,globals,decoder,record,pick};
}

module.exports={createWorld,mulberry32};

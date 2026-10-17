'use strict';
const test=require('node:test');
const {harness,compare,outcome}=require('./helpers/recovered-harness.cjs');
function scenario(name,text,options={}) {
  test('record import matches recovered: '+name,async()=>compare(async native=>{
    const trace=[],records=[];let ids=0,objects=0;
    const fail=name=>{if(options.fail===name)throw new Error('synthetic '+name);};
    const parseObject=(value,id,now)=>{trace.push(['object',value,id,now]);objects++;if(options.failObjectAt===objects)throw new Error('synthetic object');return value&&{parsed:value,id};};
    const parseText=(value,id,now)=>{trace.push(['text',value,id,now]);fail('text');return value&&!value.startsWith('#')?{line:value,id}:null;};
    const now=()=>{trace.push(['now']);fail('now');return 1234;};
    const h=harness({native,slots:{23:{randomUUID(){trace.push(['uuid']);fail('uuid');return 'synthetic-'+(++ids);}},256:parseText,257:parseObject},globals:{Date:{now}},dependencies:{now}});
    const target={push(value){trace.push(['push',value]);if(options.fail==='push')throw new Error('synthetic push');records.push(value);}};
    return {result:await outcome(()=>h.rootFunction('f3580')(text,target)),trace,records};
  }));
}
for(const text of [undefined,null,false,0,'','  ','\uFEFF Alice|synthetic\r\nBob|synthetic ','one\n\n#ignored\nthree','[]','{}','[null,false,0,{},"x"]','[{"username":"synthetic"},{"username":"second"}]','{invalid','[invalid\nsecond','  {"a":1}  ','\uFEFF[]',true,42,{}])scenario(JSON.stringify(text),text);
for(const fail of ['uuid','now','text','push'])scenario('line failure '+fail,'one\ntwo',{fail});
for(const fail of ['uuid','now','push'])scenario('JSON fallback failure '+fail,'[{},{}]',{fail});
for(const failObjectAt of [1,2,3])scenario('partial JSON then line fallback '+failObjectAt,'[{},\n{},\n{}]',{failObjectAt});
for(const value of [null,false,0,'',{},'record'])for(const initial of [0,2,'3',4n]) {
  test('append record '+String(value)+' count '+String(initial),async()=>compare(async native=>{
    const h=harness({native}),records=[];const ctx=h.engine.context(5,h.root);ctx[2]=records;ctx[3]=h.root[5];ctx[4]=initial;
    const result=await outcome(()=>h.engine.makeFunction('f3581',ctx)(value));
    return {result,records,count:String(ctx[4]),countType:typeof ctx[4]};
  }));
}

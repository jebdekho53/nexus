'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');
const {HOLE}=require('../src/main/runtime/engine.cjs');
const path=require('node:path');

function world(o={}) {
  const trace=[],written=[];let clock=1000,uuid=0;
  const record=(name,...args)=>trace.push([name,...args]);
  const fail=name=>{if(o.fail===name)throw new Error('synthetic '+name);};
  const form=o.form===undefined?{label:'Weekend trip',journey:{origin:'AAA',destination:'BBB'}}:o.form;
  const vault={get(id){record('get',id);fail('get');return form;},saveMany(models){record('saveMany',models);fail('save');return models.slice(0,o.limit??models.length);}};
  const fs={readFileSync(file,encoding){record('read',file,encoding);fail('read');if(!(file in (o.files??{})))throw new Error('synthetic missing file');return o.files[file];},
    writeFileSync(file,text,encoding){record('write',file,text,encoding);fail('write');written.push([file,text]);}};
  const electron={BrowserWindow:{fromWebContents(sender){record('window',sender);fail('window');return o.parent?'parent':null;}},dialog:{
    async showSaveDialog(...args){record('saveDialog',...args);fail('dialog');return o.save??{canceled:false,filePath:'out.json'};},
    async showOpenDialog(...args){record('openDialog',...args);fail('dialog');return o.open??{canceled:false,filePaths:['a.json']};},
  }};
  const slots={22:electron,18:fs,14:{basename(file){record('basename',file);fail('basename');return path.basename(file);}},
    1712:()=>{record('vault');fail('vault');return vault;},
    325:(name,text)=>{record('parse',name,text.length>200?'large:'+text.length:text);fail('parse');if(text==='THROW')throw new Error('synthetic parse');return text==='EMPTY'?[]:JSON.parse(text);},
    320:(model,id,now)=>{record('normalize',model,id,now);fail('normalize');if(model?.bad)throw new Error('synthetic bad model');return {input:model,id,now};},
    326:model=>{record('serialize',model);fail('serialize');return {version:1,model};},
    1720:()=>{record('changed');fail('changed');},23:{randomUUID(){record('uuid');fail('uuid');return 'uuid-'+(++uuid);}}};
  for(const slot of o.holes??[])slots[slot]=HOLE;
  const Date_={now(){record('now');fail('now');return clock++;}};
  return {trace,written,slots,Date_};
}
function scenario(name,o,id,arg,mask=false) {
  test('forms transfer matches recovered: '+name,async()=>{
    const result=await compare(async native=>{
      const env=world(o),{engine,root}=harness({native,slots:env.slots,globals:{Date:env.Date_},dependencies:{now:()=>env.Date_.now()}});
      const ctx=engine.context(3,root);ctx[2]=root[5];
      return {result:await outcome(()=>engine.makeFunction(id,ctx)({sender:'sender'},arg)),trace:env.trace,written:env.written};
    },mask?x=>({...x,result:{...x.result,value:{...x.result.value,error:typeof x.result.value?.error}}}):undefined);
    // Every successful export with a selected path must actually write.
    if(result.result.value?.ok&&/^f3949$|^f3952$/.test(id)&&!o.save?.canceled&&o.save?.filePath!==''&&o.save?.filePath!==undefined&&o.save)
      assert.equal(result.written.length,1);
  });
}
for(const parent of [false,true]) {
  for(const label of ['Trip','///','x'.repeat(90),'',undefined]) {
    const form={label,journey:{origin:'AAA',destination:'BBB'}};
    scenario('export saved '+parent+' '+label,{parent,form},'f3949','id');
    scenario('export model '+parent+' '+label,{parent},'f3952',form);
  }
  scenario('import files '+parent,{parent,files:{'a.json':'[{"name":"a"},{"name":"b"}]'}},'f3950');
  scenario('single file '+parent,{parent,files:{'a.json':'[{"name":"a"},{"name":"b"}]'}},'f3953');
}
for(const id of ['f3949','f3952','f3950','f3953']) {
  const arg=id==='f3952'?{label:'Trip',journey:{}}:'id';
  scenario(id+' cancelled',{save:{canceled:true},open:{canceled:true,filePaths:[]}},id,arg);
  scenario(id+' empty selection',{save:{canceled:false,filePath:''},open:{canceled:false,filePaths:[]}},id,arg);
  for(const fail of ['window','dialog','read','write','uuid','now','normalize','serialize','get','vault','save','changed'])
    scenario(id+' failure '+fail,{fail,files:{'a.json':'[{"name":"a"}]'}},id,arg);
  for(const slot of [14,18,22,23])scenario(id+' uninitialized '+slot,{holes:[slot],files:{'a.json':'[{}]'}},id,arg);
}
scenario('missing saved form',{form:null},'f3949','absent');
scenario('export missing journey',{form:{label:''}},'f3949','id',true);
scenario('numeric label',{form:{label:42,journey:{}}},'f3949','id',true);
scenario('export missing model',{},'f3952',undefined,true);
const files={'a.json':'[{"name":"a"},{"bad":true},{"name":"b"}]','empty.json':'EMPTY','bad.json':'THROW','model.json':'{"name":"single"}','none.json':'[]','syntax.json':'{'};
for(const selected of [['a.json'],['missing.json','empty.json','bad.json','a.json'],['empty.json'],['syntax.json'],['model.json'],['none.json']])
  scenario('file selection '+selected,{files,open:{canceled:false,filePaths:selected}},'f3950');
for(const file of ['a.json','model.json','none.json','syntax.json','missing.json'])
  scenario('single '+file,{files,open:{canceled:false,filePaths:[file]}},'f3953');
for(const items of [undefined,null,{},'',[],[null,{}, {name:42,text:0}], [{name:'a.json',text:'[{"name":"a"}]'}],
  [{name:'empty',text:'EMPTY'},{name:'bad',text:'[{"bad":true},{"name":"good"}]'}],
  [{name:'bad',text:'THROW'},{text:'[{}]'}],Array.from({length:205},(_,n)=>({name:n+'.json',text:'[{}]'})),
  [{text:' '.repeat(5242878)+'[]'},{text:' '.repeat(5242879)+'[]'}]])
  scenario('pasted '+JSON.stringify(items)?.slice(0,80),{},'f3951',items);
for(const fail of ['vault','parse','normalize','uuid','now','save','changed'])
  scenario('pasted failure '+fail,{fail},'f3951',[{name:'a.json',text:'[{},{}]'}]);
for(const limit of [0,1]) {
  scenario('partial save '+limit,{files,limit},'f3950');
  scenario('pasted partial '+limit,{limit},'f3951',[{text:'[{},{}]'}]);
}

test('forms import actually returns normalized saved models and skips failures',async()=>{
  const env=world({files}),{engine,root}=harness({native:true,slots:env.slots,globals:{Date:env.Date_},dependencies:{now:()=>env.Date_.now()}});
  const ctx=engine.context(3,root);ctx[2]=root[5];
  assert.deepEqual(await engine.makeFunction('f3950',ctx)({sender:'sender'}),{ok:true,data:{imported:2,skipped:1}});
  assert.equal(env.trace.filter(x=>x[0]==='normalize').length,3);
  assert.equal(env.trace.filter(x=>x[0]==='changed').length,1);
});

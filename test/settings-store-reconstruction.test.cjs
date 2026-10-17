'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');
const {HOLE}=require('../src/main/runtime/engine.cjs');
function world(o={}) {
  const trace=[],files=new Map([['settings.json',o.text??'{}']]);let renames=0;
  const call=(name,fn)=>(...args)=>{trace.push([name,...args]);if(o.fail===name)throw Error('synthetic '+name);return fn(...args);};
  const fs={readFileSync:call('read',file=>{if(!files.has(file))throw Error('synthetic missing');return files.get(file);}),
    mkdirSync:call('mkdir',()=>{}),writeFileSync:call('write',(file,text)=>{files.set(file,text);if(o.partialWrite)throw Error('synthetic partial write');}),
    renameSync:call('rename',(from,to)=>{renames++;if(o.renameFails===true||(o.renameFails==='first'&&renames===1))throw Error('synthetic rename');if(!files.has(from))throw Error('synthetic missing temp');files.set(to,files.get(from));files.delete(from);}),
    unlinkSync:call('unlink',file=>{if(o.unlinkOldFails&&file==='settings.json')throw Error('synthetic unlink old');if(o.unlinkTempFails&&file!=='settings.json')throw Error('synthetic unlink temp');files.delete(file);})};
  const slots={18:fs,22:{app:{getPath:call('userData',()=>'/synthetic')}},1766:call('path',()=> 'settings.json'),1768:()=>o.settings};
  for(const slot of o.holes??[])slots[slot]=HOLE;
  const Date_={now:call('now',()=>1234)};
  return {trace,files,slots,Date_};
}
function check(name,id,arg,o={}) {
  test('settings store matches recovered: '+name,async()=>{
    await compare(async native=>{const env=world(o),h=harness({native,slots:env.slots,globals:{Date:env.Date_,process:{pid:77}},dependencies:{now:()=>env.Date_.now(),processObject:{pid:77}}});
      return {result:await outcome(()=>h.rootFunction(id)(arg)),trace:env.trace,files:[...env.files]};});
  });
}
for(const value of [null,false,0,'text',[],{}, {autoUpdate:true,aiEnabled:false,qrPopup:false,newTheme:true,pinnedOnTop:false},
  {aiKeyEnc:'synthetic-envelope',gologinTokenEnc:'synthetic-envelope',hostLocationEnc:'synthetic-envelope',fingerprintChromiumPath:'synthetic-path'}])
  check('read '+JSON.stringify(value),'f3553',undefined,{text:JSON.stringify(value)});
check('read malformed','f3553',undefined,{text:'{'});
for(const field of ['autoUpdate','aiEnabled','qrPopup','newTheme','pinnedOnTop','autoUpdateOffMigrated','availTimingResetMigrated','clientUpdateLedgerInitialized'])
  for(const value of [true,false,0,1,'true',null,[],{}])check('boolean '+field+' '+String(value),'f3553',undefined,{text:JSON.stringify({[field]:value})});
for(const field of ['aiKeyEnc','aiKey','gologinTokenEnc','gologinToken','hostLocationEnc','fingerprintChromiumPath'])
  for(const value of ['', 'synthetic-only',0,false,null,{},[]])check('opaque string '+field+' '+String(value),'f3553',undefined,{text:JSON.stringify({[field]:value})});
for(const fail of ['path','read'])check('read failure '+fail,'f3553',undefined,{fail});
check('read uninitialized fs','f3553',undefined,{holes:[18]});
for(const value of [undefined,null,false,0,'text',{}, {qrPopup:false},[1,2],BigInt(2)])check('write '+String(value),'f3554',value);
const circular={};circular.self=circular;check('write circular','f3554',circular);
for(const options of [{renameFails:'first'},{renameFails:true},{renameFails:'first',unlinkOldFails:true},
  {renameFails:true,unlinkOldFails:true},{unlinkTempFails:true},{partialWrite:true}])check('atomic fallback '+JSON.stringify(options),'f3554',{qrPopup:true},options);
for(const fail of ['userData','mkdir','path','now','write','rename','unlink'])check('write failure '+fail,'f3554',{qrPopup:true},{fail});
for(const slot of [18,22])check('write uninitialized '+slot,'f3554',{}, {holes:[slot]});
for(const settings of [undefined,null,{}, {autoUpdate:false,pinnedOnTop:false},{autoUpdate:true,pinnedOnTop:true},{autoUpdate:0,pinnedOnTop:0}])
  for(const id of ['f3552','f3555'])check('accessor '+id+' '+JSON.stringify(settings),id,undefined,{settings});
for(const destroyed of [false,true])for(const pin of [false,true,0,1,null,undefined,'yes'])for(const level of [undefined,'floating','screen-saver'])
  test('window pin matches recovered '+destroyed+' '+pin+' '+level,async()=>{
    await compare(async native=>{
      const trace=[],win={isDestroyed(){trace.push(['destroyed']);return destroyed;}};
      for(const name of ['setAlwaysOnTop','setVisibleOnAllWorkspaces','setSkipTaskbar','moveTop'])win[name]=(...args)=>trace.push([name,...args]);
      const h=harness({native});return {result:await outcome(()=>h.rootFunction('f3556')(win,pin,level)),trace};
    });
  });
test('settings writer falls back and really replaces the target',async()=>{
  const env=world({renameFails:'first'}),h=harness({native:true,slots:env.slots,globals:{Date:env.Date_,process:{pid:77}},dependencies:{now:()=>env.Date_.now(),processObject:{pid:77}}});
  h.rootFunction('f3554')({qrPopup:false});assert.equal(env.files.get('settings.json'),'{"qrPopup":false}');
  assert.deepEqual([...env.files.keys()],['settings.json']);assert.equal(env.trace.filter(row=>row[0]==='rename').length,2);
});

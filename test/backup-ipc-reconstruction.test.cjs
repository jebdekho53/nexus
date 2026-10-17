'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');
const {HOLE}=require('../src/main/runtime/engine.cjs');
const clone=value=>structuredClone(value);
function world(o={}) {
  const trace=[],writes=[];let uuid=0,clock=1000;
  const rec=(...args)=>trace.push(args);
  const fail=name=>{if(o.fail===name)throw Error('synthetic '+name);};
  const call=(name,fn)=>(...args)=>{rec(name,...args);fail(name);return fn(...args);};
  const content=o.content??'{}';
  const fs={readFileSync:call('read',()=>content),writeFileSync:call('write',(file,text,enc)=>writes.push([file,text,enc])),mkdirSync:call('mkdir',()=>{})};
  const vault=(name,items)=>({list:call(name+'.list',()=>o[name]??items),all:call(name+'.all',()=>o[name]??items),
    saveMany:call(name+'.save',records=>records.slice(0,o.limit??records.length)),importEntries:call(name+'.import',()=>{})});
  const vaults={forms:vault('forms',[{id:'f1',journey:{},account:{}}]),users:vault('users',[{id:'u1',username:'synthetic'}]),
    proxies:vault('proxies',[{id:'p1',host:'proxy.invalid'}]),payments:vault('payments',[{id:'pay1',upiId:'synthetic@example'}]),history:vault('history',[{id:'h1'}])};
  class Clock {constructor(){rec('date');fail('date');}toISOString(){rec('iso');fail('iso');return '2026-11-01T01:02:03.000Z';}
    static now(){rec('now');fail('now');return clock++;}}
  const electron={app:{getPath:call('getPath',()=>'/private-synthetic')},BrowserWindow:{fromWebContents:call('window',()=>o.parent?'parent':null)},
    dialog:{showSaveDialog:call('saveDialog',async()=>o.save??{canceled:false,filePath:'out.tsbak'}),showOpenDialog:call('openDialog',async()=>o.open??{canceled:false,filePaths:['in.tsbak']})}};
  const normalize=name=>call(name,(value,id,now)=>!value||value.bad?null:{...value,id,now});
  const slots={18:fs,22:electron,23:{randomUUID:call('uuid',()=> 'uuid-'+(++uuid))},
    1712:call('forms',()=>vaults.forms),1789:call('users',()=>vaults.users),1798:call('proxies',()=>vaults.proxies),1796:call('payments',()=>vaults.payments),1792:call('history',()=>vaults.history),
    1786:call('token',()=>o.token??'synthetic-token'),1785:call('setToken',()=>{}),1761:call('aadhaar',()=>o.aadhaar??{synthetic:{test:true}}),1760:call('aadhaarPath',()=>'/private-synthetic/metadata.json'),
    1773:call('lock',()=>o.lock===undefined?{salt:'synthetic-salt',hash:'synthetic-hash',attempts:2}:o.lock),1775:call('restoreLock',()=>{}),
    962:call('seal',(payload,password)=>({syntheticOnly:true,payload,password})),
    963:call('unseal',()=>o.payload===undefined?{}:clone(o.payload)),257:normalize('normalizeUser'),264:normalize('normalizeProxy'),
    261:call('normalizePayment',value=>!value||value.bad?null:{...value,id:'normalized-payment',kind:'upi'})};
  for(const slot of o.holes??[])slots[slot]=HOLE;
  return {trace,writes,slots,Clock};
}
function execute(native,o,id,args) {
  const env=world(o),h=harness({native,slots:env.slots,globals:{Date:env.Clock},dependencies:{dateConstructor:env.Clock,now:()=>env.Clock.now()}});
  return {env,run:()=>h.nestedFunction(id)({sender:'sender'},...args)};
}
function check(name,id,args=[],o={}) {
  test('backup IPC matches recovered: '+name,async()=>{
    await compare(async native=>{const {env,run}=execute(native,o,id,args);return {result:await outcome(run),trace:env.trace,writes:env.writes};},value=>{
      if (args[0]===42 && (id==='f4032'||id==='f4033')) {
        // Malformed numeric IPC password: the two engines name the failed
        // call differently. Accept these exact messages only, not other errors.
        assert.ok(['Reflect.apply is not a function',
          'Function.prototype.apply was called on undefined, which is a undefined and not a function',
          '(password || "").trim is not a function'].includes(value.result.value.error),String(value.result.value.error));
        return {...value,result:{value:{...value.result.value,error:'non-callable trim'}}};
      }
      return value;
    });
  });
}
const ALL={forms:true,users:true,proxies:true,payments:true,gologinToken:true,aadhaar:true,appLock:true,history:true};
check('info','f4031');
for(const fail of ['forms','forms.all','payments','payments.list','users','users.list','proxies','proxies.list','token','aadhaar','lock','history','history.list'])
  check('info failure '+fail,'f4031',[],{fail});
for(const token of ['',null,false,0,'synthetic'])check('info token '+String(token),'f4031',[],{token});
for(const lock of [null,false,{}, {salt:'s',hash:'h'}])check('info lock '+String(lock),'f4031',[],{lock});

for(const password of [undefined,null,'',' ','abc','abcd','  abcd  ',0,42])check('backup password '+String(password),'f4032',[password]);
for(const selection of [undefined,null,{},false,ALL,...Object.keys(ALL).map(key=>({[key]:true})),{forms:1,users:'yes'}])
  for(const parent of [false,true])check('backup selection '+JSON.stringify(selection)+' '+parent,'f4032',['synthetic-password',selection],{parent});
for(const save of [{canceled:true},{canceled:false},{canceled:false,filePath:''}])check('backup cancel '+JSON.stringify(save),'f4032',['synthetic-password'],{save});
for(const fail of ['forms','forms.all','users','users.list','proxies','proxies.list','payments','payments.list','lock','history','history.list','date','iso','token','aadhaar','seal','window','saveDialog','write'])
  check('backup failure '+fail,'f4032',['synthetic-password'],{fail});
for(const slot of [18,22])check('backup uninitialized '+slot,'f4032',['synthetic-password'],{holes:[slot]});

const full={forms:[{id:'saved',journey:{},account:{}},null,{}, {id:3,journey:{},account:{}},{id:'',journey:[],account:[]}],
  users:[{id:'u1',username:'synthetic'},null,{username:'generated'}, {bad:true}],
  proxies:[{id:'p1',host:'proxy.invalid'},null,{host:'another.invalid'},{bad:true}],
  payments:[{id:'pay1',upiId:'synthetic@example'},null,{upiId:'other@example'},{bad:true}],
  gologinToken:'synthetic-token',aadhaar:{newSynthetic:{test:true}},appLock:{salt:'synthetic-salt',hash:'synthetic-hash',attempts:99},history:[{id:'h2'}]};
for(const payload of [{},full,null,0,'text',{forms:[],users:[],proxies:[],payments:[],history:[]},
  {forms:'wrong',users:{},proxies:null,payments:false,history:'wrong'},
  {gologinToken:''},{gologinToken:123},{aadhaar:[]},{aadhaar:'wrong'}, {payments:[null,{bad:true}]},
  {appLock:{}},{appLock:{salt:'s'}},{appLock:{salt:1,hash:'h'}},{appLock:{salt:'',hash:''}}])
  for(const parent of [false,true])check('restore payload '+JSON.stringify(payload)+' '+parent,'f4033',['synthetic-password'],{payload,parent});
for(const password of [undefined,null,'',' ','a',' synthetic-password ',0,42])check('restore password '+String(password),'f4033',[password],{payload:full});
for(const open of [{canceled:true,filePaths:[]},{canceled:false,filePaths:[]}])check('restore cancel '+JSON.stringify(open),'f4033',['synthetic-password'],{open,payload:full});
check('restore malformed JSON','f4033',['synthetic-password'],{content:'{',payload:full});
for(const fail of ['window','openDialog','read','unseal','forms','forms.save','normalizeUser','uuid','now','users','users.save','normalizeProxy','proxies','proxies.save','normalizePayment','payments','payments.save','setToken','aadhaar','getPath','mkdir','aadhaarPath','write','restoreLock','history','history.import'])
  check('restore failure '+fail,'f4033',['synthetic-password'],{fail,payload:full});
for(const limit of [0,1])check('restore partial save '+limit,'f4033',['synthetic-password'],{payload:full,limit});
for(const slot of [18,22,23])check('restore uninitialized '+slot,'f4033',['synthetic-password'],{payload:full,holes:[slot]});

test('backup really seals selected data and restore really saves valid records',async()=>{
  const backup=execute(true,{},'f4032',['synthetic-password',{forms:true}]);
  assert.deepEqual(await backup.run(),{ok:true,data:{count:{forms:1,users:0}}});
  assert.equal(backup.env.writes.length,1);
  const sealed=JSON.parse(backup.env.writes[0][1]);assert.equal(sealed.syntheticOnly,true);assert.equal(sealed.payload.forms.length,1);
  assert.deepEqual(sealed.payload.users,[]);assert.equal(sealed.payload.gologinToken,'');
  const restored=execute(true,{payload:full},'f4033',['synthetic-password']);
  assert.deepEqual(await restored.run(),{ok:true,data:{count:{forms:2,users:2}}});
  assert.ok(restored.env.trace.some(row=>row[0]==='proxies.save'));
  assert.ok(restored.env.trace.some(row=>row[0]==='history.import'));
});

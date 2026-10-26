const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/renderer/matrix-scheduler.js'),'utf8');
const providers=['chrome','brave','brave-beta','edge','fingerprint','brahmos'];
for(const provider of providers)test('scheduler starts exactly the selected '+provider+' browser using backend type identifiers',async()=>{
 const intervals=[],picked=[],options=[];
 const classes={add(){},remove(){},contains(){return false}};
 const select={innerHTML:'',appendChild(option){options.push(option)},addEventListener(){}};
 const nodes={schedBrowserSel:select,browserModal:{classList:classes},statusText:{textContent:''}};
 const tiles=['brave','brahmos','brave-beta','chrome','edge','fingerprint'].map(type=>({dataset:{type},textContent:type==='brahmos'?'Matrix Browser':type==='fingerprint'?'Chrome Advance':type.replace('-',' '),disabled:false,classList:classes,click(){picked.push(type)}}));
 const window={api:{detectBrowsers:async()=>({ok:true,data:[...providers.map(type=>({type,installed:true})),{type:'gologin',installed:false}]})}};
 const document={readyState:'complete',getElementById:id=>nodes[id]||null,querySelector:selector=>selector==='.act-weblogin'?{click(){}}:null,querySelectorAll:selector=>selector==='#browserList .browser-tile'?tiles:[],createElement:()=>({})};
 vm.runInNewContext(source,{window,document,console:{log(){}},Date,Math,setTimeout(){return 1},clearTimeout(){},setInterval(fn){intervals.push(fn);return intervals.length},clearInterval(){},alert(){}});
 await Promise.resolve();assert.deepEqual(options.map(o=>o.value),providers);
 const future=new Date(Date.now()+60000),time=[future.getHours(),future.getMinutes(),future.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
 window.matrixScheduler.arm(time,provider,true,'login');window.matrixScheduler.triggerNow();intervals.at(-1)();
 assert.deepEqual(picked,[provider]);
});

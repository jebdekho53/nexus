'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const flushAll=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));};
const FORM='<form action="/start"><input name="mid" value="synthetic-final-mid"><input name="encData" value="synthetic-final-enc"><input name="checksum" value="synthetic-final-checksum">';
// Real recovered/native f1693 and f1712 over synthetic pages, WebSocket and fetch effects.
function installFullWatch({engine,context,root,gateway,trace,options,fire}) {
  root[2132]=source=>vm.runInNewContext('('+source+')');
  let pages=0;const open=new Set();
  const makePage=()=>{
    const id=++pages;open.add(id);
    return{
      async goto(url,settings){trace.push(['page-goto',id,url,settings]);},url(){return 'https://gateway.invalid/';},
      isClosed(){return !open.has(id);},async close(){trace.push(['page-close',id]);open.delete(id);},
      evaluate(fn,args){
        const document={title:'',body:{style:{},innerHTML:''},nodes:{},getElementById(name){return this.nodes[name]||null;},createElement(){return{style:{}};}};
        document.body.appendChild=node=>{document.nodes[node.id]=node;};
        if(args&&args.wsUrl) {
          trace.push(['socket',id,args]);
          let socket;
          class FakeSocket{constructor(){socket=this;}send(data){trace.push(['send',id,data]);}close(){trace.push(['socket-close',id]);}}
          const result=vm.runInNewContext('('+fn.toString()+')',{document,WebSocket:FakeSocket,JSON,setTimeout(){return 1;},clearTimeout(){}})(args);
          if(options.fullWatch==='ws'||options.fullWatch==='both') {
            socket.onopen();socket.onmessage({data:'#1'});socket.onmessage({data:JSON.stringify({rid:1})});
            socket.onmessage({data:JSON.stringify({event:args.roomId,data:{merchantId:'synthetic-ws-mid',orderId:'synthetic-ws-order',acquirementId:'synthetic-ws-acq'}})});
          }
          return result;
        }
        if(!args&&String(fn).includes('__pwslog'))return Promise.resolve('');
        if(args&&args.url) {
          return Promise.resolve(vm.runInNewContext('('+fn.toString()+')',{fetch:async(url,settings)=>{
            trace.push(['page-fetch',id,url,JSON.parse(JSON.stringify(settings))]);
            const post=settings.method==='POST',paid=options.fullWatch==='poll'||options.fullWatch==='both';
            return{status:200,async text(){return post?FORM:paid?'SUCCESS<input name="acquirementId" value="synthetic-poll-acq">':'pending';}};
          }})(args));
        }
        vm.runInNewContext('('+fn.toString()+')',{document})();trace.push(['progress',id]);return Promise.resolve();
      },
    };
  };
  gateway.page={context(){return{async newPage(){trace.push(['new-page',pages+1]);return makePage();}};}};
  gateway.paytmOriginPage=engine.makeFunction('f1704',context).bind(gateway);
  gateway.paytmInPageFetch=engine.makeFunction('f1708',context).bind(gateway);
  gateway.disposePaytmPage=engine.makeFunction('f1710',context).bind(gateway);
  gateway.pollPaytmStatus=engine.makeFunction('f1689',context).bind(gateway);
  gateway.paytmBankResponse=engine.makeFunction('f1717',context).bind(gateway);
  gateway.waitForPaytmWs=engine.makeFunction('f1693',context).bind(gateway);
  gateway.getFinalPaytmStatus=engine.makeFunction('f1712',context).bind(gateway);
  gateway.bankResponseOrigin=()=>undefined;
  trace.openPages=()=>[...open];
}
async function run(native,options={}) {
  const trace=[],random=()=>0.25,math=Object.create(Math);math.random=random;
  const intervals=[],timers={setInterval(fn,ms){trace.push(['interval',ms]);intervals.push({fn,ms,live:true});return intervals.length;},clearInterval(id){trace.push(['clear',id]);if(intervals[id-1])intervals[id-1].live=false;}};
  const fire=ms=>intervals.filter(i=>i.live&&i.ms===ms).forEach(i=>i.fn());
  const logs=[];
  const globals={URLSearchParams,URL,Buffer,String,Promise,Math:math,JSON,RegExp,encodeURIComponent,...timers};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{globals,random,timers}}):{},globals}),root=engine.context(1842,null),context=engine.context(2,root);
  root[5]=root[1841]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined);return table[n+'|'+key];};
  for(const[slot,id]of [[775,'f1599'],[776,'f1601'],[779,'f1605'],[780,'f1606'],[781,'f1607'],[783,'f1609'],[784,'f1610'],[785,'f1611']])root[slot]=engine.makeFunction(id,root);
  let redirects=0;
  const gateway={hosts:{wps:'https://provider.invalid',paytm:'https://gateway.invalid'},
    async reqRetry(label,fn){trace.push(['retry',label]);return fn();},
    async gwHeaders(host,settings){trace.push(['headers',host,settings]);return{synthetic:'header'};},
    log(value){logs.push(String(value));},snip(){return 'synthetic-redacted';},async sleep(ms){trace.push(['sleep',ms]);if(options.fullWatch)await new Promise(resolve=>setImmediate(resolve));},
    req:{async post(url,settings){trace.push(['post',url,settings]);const redirect=url.includes('/PaymentRedirect');if(redirect)redirects++;
      const data=options.noQr?{}:{qr:{dataurl:'data:image/png;base64,synthetic-image'},orderId:'synthetic-order'};
      const html=redirect?(options.retry&&redirects===1?'':'<form action="/start"><input name="mid" value="synthetic-mid"><input name="encData" value="synthetic-enc"><input name="checksum" value="synthetic-checksum">'):'pushAppData="'+Buffer.from(JSON.stringify(data)).toString('base64')+'"';
      return{async text(){return html;},status(){return 200;},url(){return url.includes('/BankResponse')?'https://provider.invalid/booking-confirm':url;}};
    }},
    async waitForPaytmWs(mid,order){trace.push(['ws',mid,order]);return{syntheticPaid:true};},
    async pollPaytmStatus(){return null;},
    async getFinalPaytmStatus(value){trace.push(['final',value]);return{mid:'synthetic-mid',encData:'synthetic-final',checksum:'synthetic-checksum'};},
    async disposePaytmPage(){trace.push(['dispose']);},async paytmBankResponse(value){trace.push(['bank',value]);return true;},
  };
  gateway.paytmRedirect=engine.makeFunction('f1684',context).bind(gateway);gateway.paytmFetchQr=engine.makeFunction('f1687',context).bind(gateway);
  if(options.withPageStatus){
    root[2132]=source=>vm.runInNewContext('('+source+')');
    const document={body:{style:{}}};
    const paymentPage={
      async goto(url,settings){trace.push(['page-goto',url,settings]);},url(){return 'https://gateway.invalid/';},
      isClosed(){return false;},async close(){trace.push(['page-close']);},
      evaluate(fn,args){
        const callback=vm.runInNewContext('('+fn.toString()+')',{document,fetch:async(url,settings)=>{
          trace.push(['page-fetch',url,JSON.parse(JSON.stringify(settings))]);
          return{status:200,async text(){return 'SUCCESS<input name="acquirementId" value="synthetic-acq">';}};
        }});
        return Promise.resolve(callback(args));
      },
    };
    gateway.page={context(){return{async newPage(){trace.push(['new-payment-page']);return paymentPage;}};}};
    gateway.paytmOriginPage=engine.makeFunction('f1704',context).bind(gateway);
    gateway.paytmInPageFetch=engine.makeFunction('f1708',context).bind(gateway);
    gateway.disposePaytmPage=engine.makeFunction('f1710',context).bind(gateway);
    gateway.pollPaytmStatus=engine.makeFunction('f1689',context).bind(gateway);
    gateway.paytmBankResponse=engine.makeFunction('f1717',context).bind(gateway);
    gateway.bankResponseOrigin=()=>undefined;
    gateway.waitForPaytmWs=async()=>null;
  }
  if(options.fullWatch)installFullWatch({engine,context,root,gateway,trace,options,fire});
  const actor={gateway,api:{currentCsrf:'synthetic-csrf'},opts:{onQr(value){trace.push(['qr',value]);if(options.fullWatch==='cancel')setImmediate(()=>{actor.stopped=true;fire(300);fire(400);});},onQrClose(){trace.push(['qr-close']);}},
    tok(){return{accessToken:'synthetic-access'};},onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    stopped:false,stoppedResult(){trace.push(['stopped-result']);return{success:false,stopped:true};},pnrSeen:false,paymentSetupFailed(value){trace.push(['failed',value]);return{success:false};},beginSettling(){trace.push(['settle']);},
    async pollBookingData(...args){trace.push(['pnr',...args]);return{syntheticPnr:true};},finishBooking(value){trace.push(['finish',value]);return{success:true};},
  };
  const result=await engine.makeFunction('f2193',context).call(actor,{username:'synthetic-user',origin:'AAA',destination:'BBB'},'synthetic-txn',99);
  if(options.fullWatch){fire(400);await flushAll();}
  return{result,trace,logs:options.fullWatch?logs:undefined};
}
for(const[name,options]of Object.entries({ordinary:{},redirectRetry:{retry:true},missingQr:{noQr:true},pageStatus:{withPageStatus:true}}))test('synthetic PayTM orchestration uses real reconstructed redirect/QR methods: '+name,async()=>{
  assert.deepEqual(await run(true,options),await run(false,options));
});
test('synthetic PayTM chain uses owned browser status page then disposes it',async()=>{
  const {result,trace}=await run(true,{withPageStatus:true});assert.deepEqual(result,{success:true});
  assert.equal(trace.filter(row=>row[0]==='new-payment-page').length,1);
  assert.equal(trace.filter(row=>row[0]==='page-close').length,1);
  const fetch=trace.find(row=>row[0]==='page-fetch');assert.match(fetch[1],/transactionStatus\?MID=synthetic-mid&ORDER_ID=synthetic-order/);
  assert.equal(fetch[2].credentials,'include');assert.deepEqual(trace.find(row=>row[0]==='final')[1],{merchantId:'synthetic-mid',orderId:'synthetic-order',paymentMode:'UPI',topicName:'DYNAMIC_QR',acquirementId:'synthetic-acq',cashierRequestId:'',_id:'synthetic-mid_synthetic-order',status:'SUCCESS'});
  const bank=trace.find(row=>row[0]==='post'&&row[1].includes('/BankResponse'));
  assert.deepEqual(bank[2].form,{MID:'synthetic-mid',ENC_DATA:'synthetic-final',CHECKSUMHASH:'synthetic-checksum'});
});
test('synthetic PayTM chain exposes QR before settlement and uses gateway-specific form',async()=>{
  const {result,trace}=await run(true);assert.deepEqual(result,{success:true});
  assert.ok(trace.findIndex(row=>row[0]==='qr')<trace.findIndex(row=>row[0]==='settle'));
  const posts=trace.filter(row=>row[0]==='post');assert.equal(posts.length,2);
  assert.deepEqual(posts[1][2].form,{MID:'synthetic-mid',ENC_DATA:'synthetic-enc',CHECKSUMHASH:'synthetic-checksum'});
  assert.deepEqual(trace.find(row=>row[0]==='qr')[1],{imageBase64:'synthetic-image',amount:99,caption:'AAA → BBB'});
});

const watchCases=['ws','poll','both','cancel'];
for(const fullWatch of watchCases)test('synthetic PayTM chain uses actual watcher and final-status methods: '+fullWatch,async()=>{
  const actual=await run(true,{fullWatch}),expected=await run(false,{fullWatch});
  const strip=value=>JSON.parse(JSON.stringify({...value,logs:undefined}));
  assert.deepEqual(strip(actual),strip(expected));
  assert.deepEqual(actual.result,fullWatch==='cancel'?{success:false,stopped:true}:{success:true});
  const created=actual.trace.filter(row=>row[0]==='new-page').length,closed=actual.trace.filter(row=>row[0]==='page-close').length;
  // Legacy behavior kept for equivalence: a status-poll attempt that is already sleeping when the winner
  // disposes the owned page reopens one afterwards, and the cancel path never disposes it. Native matches
  // the recovered oracle; correcting the leak is a separate reviewed change.
  assert.equal(created-closed,{ws:1,poll:0,both:1,cancel:1}[fullWatch]);
  assert.doesNotMatch(actual.logs.join(' '),/synthetic-(ws|poll|final)|gateway\.invalid/);
  const finals=actual.trace.filter(row=>row[0]==='page-fetch'&&row[3].method==='POST');
  assert.equal(finals.length,fullWatch==='cancel'?0:1);
  if(fullWatch==='ws')assert.match(actual.trace.find(row=>row[0]==='page-fetch'&&row[3].method==='POST')[2],/MID=synthetic-ws-mid&ORDER_ID=synthetic-ws-order/);
  if(fullWatch==='poll')assert.match(finals[0][2],/MID=synthetic-mid&ORDER_ID=synthetic-order/);
});
test('independent synthetic PayTM actors do not share pages, sockets or watchers',async()=>{
  const sequential=[await run(true,{fullWatch:'ws'}),await run(true,{fullWatch:'poll'})];
  const concurrent=await Promise.all([run(true,{fullWatch:'ws'}),run(true,{fullWatch:'poll'})]);
  const plain=list=>JSON.parse(JSON.stringify(list.map(v=>({...v,logs:undefined}))));
  assert.deepEqual(plain(concurrent),plain(sequential));
});

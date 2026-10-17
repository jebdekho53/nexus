'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const load=name=>[require('./fixtures/legacy/'+name+'.legacy.cjs'),require('../src/main/payment/'+name+'.cjs')];
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// PayTM modules (src/ts/main/payment/paytm*.ts) versus their previous JavaScript.
function fakeTimers(trace) {
  const intervals=new Map();let next=1;
  return{intervals,timers:{setInterval:(callback,ms)=>{const id=next++;trace.push(['setInterval',ms]);intervals.set(id,callback);return id;},clearInterval:id=>{trace.push(['clearInterval',id]);intervals.delete(id);}}};
}

test('paytm-watch: first truthy source wins, both falsy resolves null',async()=>{
  const[legacy,migrated]=load('paytm-watch');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const outcomes=[['pay',null],[null,'pay'],[null,null],['a','b'],[0,''],[new Error('ws'),'pay'],['pay',new Error('poll')],[new Error('a'),new Error('b')],[undefined,undefined]];
  for(const[ws,poll]of outcomes)for(const stopLater of[false,true])
    await check(JSON.stringify([String(ws),String(poll),stopLater]),async(m,trace)=>{
      const{timers,intervals}=fakeTimers(trace);
      const actor={stopped:false,pnrSeen:false,onProgress:(...a)=>trace.push(['progress',...a])};
      const gateway={
        waitForPaytmWs:(...a)=>{trace.push(['ws',a[0],a[1],a[2],typeof a[3]]);return ws instanceof Error?Promise.reject(ws):Promise.resolve(ws);},
        pollPaytmStatus:(mid,orderId,stopped,onWait)=>{trace.push(['poll',mid,orderId,stopped()]);onWait();actor.stopped=true;onWait();actor.stopped=false;return poll instanceof Error?Promise.reject(poll):Promise.resolve(poll);},
      };
      const resolved=[];
      m.startPaytmWatch(value=>resolved.push(value),actor,gateway,{mid:'MID'},'ORD',timers);
      if(stopLater){await tick();actor.stopped=true;[...intervals.values()].forEach(cb=>cb());}
      await tick();await tick();
      return{resolved,intervalsLeft:intervals.size};
    });
  // the 300ms stop watcher resolves null while sources are pending
  await check('stop watcher',async(m,trace)=>{
    const{timers,intervals}=fakeTimers(trace);
    const actor={stopped:true,onProgress(){}};
    const never=new Promise(()=>{});
    const resolved=[];
    m.startPaytmWatch(v=>resolved.push(v),actor,{waitForPaytmWs:()=>never,pollPaytmStatus:()=>never},{mid:'M'},'O',timers);
    [...intervals.values()].forEach(cb=>cb());[...intervals.values()].forEach(cb=>cb());
    return{resolved};
  });
  await check('pnrSeen and settled count as stopped',async(m,trace)=>{
    const{timers}=fakeTimers(trace);const seen=[];
    const actor={stopped:false,pnrSeen:true,onProgress:(...a)=>seen.push(a)};
    let stop;
    m.startPaytmWatch(()=>{},actor,{waitForPaytmWs:(a,b,c,s)=>{stop=s;seen.push(['ws-stopped',s()]);return new Promise(()=>{});},pollPaytmStatus:(a,b,s,w)=>{w();return new Promise(()=>{});}},{mid:'M'},'O',timers);
    return{seen,stop:stop()};
  });
});

test('paytm-watch: a falsy first source must not end the watch while the other is pending',async()=>{
  const[legacy,migrated]=load('paytm-watch');
  const check=differential(legacy,migrated);
  for(const first of['ws','poll'])
    await check('late '+first,async(m,trace)=>{
      const{timers}=fakeTimers(trace);
      const resolved=[];
      const late=value=>new Promise(resolve=>setTimeout(()=>resolve(value),5));
      const gateway={waitForPaytmWs:()=>first==='ws'?Promise.resolve(null):late('pay'),pollPaytmStatus:()=>first==='poll'?Promise.resolve(null):late('pay')};
      m.startPaytmWatch(value=>resolved.push(value),{onProgress(){}},gateway,{mid:'M'},'O',timers);
      await new Promise(resolve=>setTimeout(resolve,30));
      return resolved;
    });
  await check('both late null',async(m,trace)=>{
    const{timers}=fakeTimers(trace);const resolved=[];
    const late=value=>new Promise(resolve=>setTimeout(()=>resolve(value),5));
    m.startPaytmWatch(value=>resolved.push(value),{onProgress(){}},{waitForPaytmWs:()=>late(null),pollPaytmStatus:()=>late(undefined)},{mid:'M'},'O',timers);
    await new Promise(resolve=>setTimeout(resolve,30));
    return resolved;
  });
});

test('paytm-status: polling waits, fallbacks and success parsing',async()=>{
  const[legacy,migrated]=load('paytm-status');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const getField=(text,name)=>{const match=new RegExp('"'+name+'":"([^"]*)"').exec(text);return match?match[1]:'';};
  const success='{"status":"SUCCESS","merchantId":"MM","orderId":"OO","paymentMode":"CC","topicName":"TT","acquirementId":"AQ","cashierRequestId":"CR","_id":"ID"}';
  const scenarios={
    successInPage:{inPage:[{status:200,text:success}]},successBare:{inPage:[{status:200,text:'Transaction Successful'}]},
    successThenFields:{inPage:[{status:200,text:'TXN_SUCCESS'}]},
    waitsThenSuccess:{inPage:[{status:200,text:'pending'},{status:200,text:'pending'},{status:200,text:success}]},
    inPageRejectsThenReq:{inPage:[null],req:[{ok:true,text:success}]},inPageBadStatusReq:{inPage:[{status:500,text:'x'}],req:[{ok:true,text:success}]},
    reqNotOk:{inPage:[null],req:[{ok:false,text:''},{ok:true,text:success}]},reqRejects:{inPage:[null],req:[null,{ok:true,text:success}]},reqTextRejects:{inPage:[null],req:[{ok:true,textRejects:true},{ok:true,text:success}]},
    hintsEveryTen:{inPage:[{status:200,text:'RESPCODE 01 STATUS pending'}],max:23},noHints:{inPage:[{status:200,text:'<html>shell</html>'}],max:3},
    maxAttempts:{inPage:[{status:200,text:'pending'}],max:2},stoppedBefore:{inPage:[{status:200,text:'pending'}],stopAfter:0},stoppedAfterFirst:{inPage:[{status:200,text:'pending'}],stopAfter:1},noOnWait:{inPage:[{status:200,text:'pending'}],max:1,noWait:true},
    encodedIds:{inPage:[{status:200,text:success}],mid:'M&1',order:'O 2'},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,(m,trace)=>{
      let inPageCalls=0,reqCalls=0,stoppedCalls=0;
      const actor={
        hosts:{paytm:'https://paytm.test'},
        sleep:ms=>{trace.push(['sleep',ms]);return Promise.resolve();},
        paytmInPageFetch:(path,options)=>{trace.push(['inPage',path,options]);const value=o.inPage[Math.min(inPageCalls++,o.inPage.length-1)];return value?Promise.resolve(value):Promise.reject(new Error('x'));},
        req:{get:(url,options)=>{trace.push(['get',url,options]);const value=(o.req||[{ok:false}])[Math.min(reqCalls++,(o.req||[{}]).length-1)];return value?Promise.resolve({ok:()=>value.ok,text:()=>value.textRejects?Promise.reject(new Error('t')):Promise.resolve(value.text)}):Promise.reject(new Error('r'));}},
        gwHeaders:async(host,options)=>{trace.push(['headers',host,options]);return{H:1};},
        log:function(...a){trace.push(['log',this===actor?'actor':'other',...a]);},snip:text=>trace.push(['snip',text.length]),
      };
      return m.pollPaytmStatus(actor,o.mid||'MID',o.order||'ORD',()=>{const value=o.stopAfter!==undefined&&stoppedCalls++>=o.stopAfter;trace.push(['stopped?',value]);return value;},o.noWait?undefined:()=>trace.push('onWait'),o.max,{getField});
    });
});

test('paytm-final-status',async()=>{
  const[legacy,migrated]=load('paytm-final-status');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const payment={merchantId:'M 1',orderId:'O&2',acquirementId:'AQ',cashierRequestId:'CR',paymentMode:'UPI',topicName:'T',status:'SUCCESS',_id:'ID'};
  const parseForm=text=>{try{return JSON.parse(text);}catch{return{};}};
  const full=JSON.stringify({mid:'m',encData:'e',checksum:'c'}),partial=JSON.stringify({mid:'m'});
  const scenarios={
    inPageComplete:{inPage:{status:200,text:full}},inPagePartialReqComplete:{inPage:{status:200,text:partial},req:{status:200,text:full}},
    inPageRejectsReqComplete:{inPage:null,req:{status:200,text:full}},inPageRejectsReqPartial:{inPage:null,req:{status:200,text:partial}},
    bothPartial:{inPage:{status:200,text:partial},req:{status:200,text:partial}},bothEmpty:{inPage:{status:500,text:''},req:{status:500,text:''}},
    reqRejects:{inPage:{status:200,text:partial},req:null},reqTextRejects:{inPage:null,req:{status:200,textRejects:true}},noInPageText:{inPage:{status:200}},
    inPageEmptyReqPartial:{inPage:{status:200,text:'{}'},req:{status:200,text:partial}},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,(m,trace)=>m.getFinalPaytmStatus({
      hosts:{paytm:'https://paytm.test'},
      paytmInPageFetch:(path,options)=>{trace.push(['inPage',path,options]);return o.inPage?Promise.resolve(o.inPage):Promise.reject(new Error('x'));},
      req:{post:(url,options)=>{trace.push(['post',url,options]);return o.req?Promise.resolve({status:()=>o.req.status,text:()=>o.req.textRejects?Promise.reject(new Error('t')):Promise.resolve(o.req.text)}):Promise.reject(new Error('r'));}},
      gwHeaders:async(host,options)=>{trace.push(['headers',host,options]);return{H:1};},snip:text=>trace.push(['snip',text]),log:(...a)=>trace.push(['log',...a]),
    },payment,{parseForm}));
});

test('paytm: QR orchestration',async()=>{
  const[legacy,migrated]=load('paytm');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const form=(o={})=>({action:'https://p.test',mid:'m',encData:'e',checksum:'c',...o});
  const scenarios={
    happy:{},redirectRejects:{redirect:new Error('r')},noAction:{redirect:form({action:''})},noRedirect:{redirect:null},qrRejects:{qr:new Error('q')},noQr:{qr:{qrBase64:'',orderId:''}},
    stoppedAfterWatch:{stopWatch:true},timedOut:{payment:null},finalRejects:{final:new Error('f')},finalIncomplete:{final:{mid:'m',encData:'e'}},finalNull:{final:null},
    bankRejects:{bank:new Error('b')},bankFalse:{bank:false},disposeRejects:{dispose:new Error('d')},noQrCallbacks:{noCallbacks:true},noJourneyUser:{journey:{origin:'A',destination:'B'}},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,async(m,trace)=>{
      const settle=(value,def)=>value===undefined?Promise.resolve(def):value instanceof Error?Promise.reject(value):Promise.resolve(value);
      const actor={
        stopped:false,pnrSeen:false,
        gateway:{
          paytmRedirect:request=>{trace.push(['redirect',request]);return settle(o.redirect,form());},paytmFetchQr:r=>{trace.push(['fetchQr',r]);return settle(o.qr,{qrBase64:'QR',orderId:'ORD'});},
          waitForPaytmWs:()=>{trace.push('ws');return Promise.resolve(null);},pollPaytmStatus:(mid,order,stopped,onWait)=>{trace.push(['poll',mid,order]);if(o.stopWatch)actor.stopped=true;return Promise.resolve(o.payment===undefined?{merchantId:'M'}:o.payment);},
          getFinalPaytmStatus:p=>{trace.push(['final',p]);return settle(o.final,{mid:'m',encData:'e',checksum:'c'});},disposePaytmPage:()=>{trace.push('dispose');return settle(o.dispose,undefined);},paytmBankResponse:s=>{trace.push(['bank',s]);return settle(o.bank,true);},
        },
        api:{currentCsrf:'CSRF'},opts:o.noCallbacks?{}:{onQr:q=>trace.push(['onQr',q]),onQrClose:()=>trace.push('qrClose')},
        tok:()=>({accessToken:'TOK'}),onProgress:(...a)=>trace.push(['progress',...a]),log:(...a)=>trace.push(['log',...a]),
        paymentSetupFailed:message=>{trace.push(['setupFailed',message]);return'setup-failed';},stoppedResult:()=>'stopped',beginSettling:()=>trace.push('settling'),
        finishBooking:b=>{trace.push(['finish',b]);return'finished';},pollBookingData:(...a)=>{trace.push(['pollBooking',...a]);return Promise.resolve({pnr:'P'});},
      };
      const timers={setInterval:()=>1,clearInterval:()=>{}};
      return m.runPaytm(actor,o.journey||{username:'user',origin:'A',destination:'B'},'TXN',300,{random:()=>0.5,timers});
    });
  const real=await migrated.runPaytm.length;
  assert.equal(real,4);
});

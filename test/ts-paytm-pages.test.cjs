'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const load=name=>[require('./fixtures/legacy/'+name+'.legacy.cjs'),require('../src/main/payment/'+name+'.cjs')];
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// PayTM page/QR/WebSocket modules (src/ts/main/payment/paytm-{page,qr-request,websocket}.ts) versus the previous JavaScript.
// Page-side functions are serialized into the browser, so they are run here from their *source text* in a sandbox
// with a scripted DOM: that proves the compiled output is self-contained and behaves identically.
const inBrowser=(fn,sandbox)=>vm.runInNewContext('('+fn.toString()+')',sandbox);

const fakeDocument=(o={})=>{
  const elements=new Map();
  const make=()=>({style:{},textContent:'',id:''});
  const body={style:{},innerHTML:'',children:[],appendChild(element){this.children.push(element);elements.set(element.id,element);}};
  return{title:'',body:o.noBody?undefined:body,elements,getElementById:id=>elements.get(id)??null,createElement:()=>make()};
};

test('page-side progress and log readers',async()=>{
  const[lp,mp]=load('paytm-page'),[lw,mw]=load('paytm-websocket');
  for(const[name,legacyFn,migratedFn]of[['progress',lp.showPaytmProgress,mp.showPaytmProgress],['watchProgress',lw.showPaytmWatchProgress,mw.showPaytmWatchProgress]])
    for(const noBody of[false,true]) {
      const runs=[legacyFn,migratedFn].map(fn=>{const document=fakeDocument({noBody});inBrowser(fn,{document})();return JSON.stringify([document.title,document.body&&document.body.innerHTML,document.body&&document.body.style]);});
      assert.equal(runs[1],runs[0],name+noBody);
    }
  for(const text of[undefined,'','abc\u0001']) {
    const results=[lw.readPaytmSocketLog,mw.readPaytmSocketLog].map(fn=>{const document=fakeDocument();if(text!==undefined)document.elements.set('__pwslog',{textContent:text});return inBrowser(fn,{document})();});
    assert.equal(results[1],results[0]);
  }
});

test('requestInPaytmPage',async()=>{
  const[legacy,migrated]=load('paytm-page');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const requests=[{url:'u',method:'GET'},{url:'u',method:'GET',referer:'https://r.test'},{url:'u',method:'POST',body:'a=1',referer:'r'},{url:'u',method:'POST'},{url:'u',method:'POST',body:''},{url:'u',method:'PUT',body:'x'}];
  for(const request of requests)for(const mode of['ok','fetchThrows','textThrows','status500'])
    await check(JSON.stringify([request,mode]),async(m,trace)=>{
      const fetch=(url,options)=>{trace.push(['fetch',url,options]);if(mode==='fetchThrows')return Promise.reject(new Error('f'));return Promise.resolve({status:mode==='status500'?500:200,text:()=>mode==='textThrows'?Promise.reject(new Error('t')):Promise.resolve('body')});};
      return inBrowser(m.requestInPaytmPage,{fetch})(request);
    });
});

const fakePage=(trace,o={})=>{
  let closed=false;
  return{isClosed:()=>closed,goto:(url,options)=>{trace.push(['goto',url,options]);return o.gotoRejects?Promise.reject(new Error('g')):Promise.resolve();},url:()=>o.url??'https://paytm.test/home',close:()=>{trace.push('close');closed=true;return o.closeRejects?Promise.reject(new Error('c')):Promise.resolve();},
    evaluate:(fn,arg)=>{trace.push(['evaluate',fn.name,arg]);return o.evalRejects?Promise.reject(new Error('e')):Promise.resolve(o.evalResult);}};
};
test('paytmOriginPage / paytmPageRequest / disposePaytmPage',async()=>{
  const[legacy,migrated]=load('paytm-page');
  const check=differential(legacy,migrated);
  const modes={ok:{},wrongOrigin:{url:'https://evil.test/'},gotoRejects:{gotoRejects:true},evalRejects:{evalRejects:true},closeRejectsWrongOrigin:{url:'https://evil.test/',closeRejects:true},badUrl:{url:'not a url'}};
  for(const[name,o]of Object.entries(modes))
    await check('origin '+name,async(m,trace)=>{
      const actor={hosts:{paytm:'https://paytm.test'},page:{context:()=>({newPage:()=>o.newPageRejects?Promise.reject(new Error('n')):Promise.resolve(fakePage(trace,o))})}};
      const first=await m.paytmOriginPage(actor);
      const second=await m.paytmOriginPage(actor);
      return{first:!!first,reused:first===second,stored:actor.paytmPage===first};
    });
  await check('origin newPage rejects',async(m,trace)=>m.paytmOriginPage({hosts:{paytm:'https://paytm.test'},page:{context:()=>({newPage:()=>Promise.reject(new Error('n'))})}}));
  await check('origin reopens a closed page',async(m,trace)=>{
    const closedPage=fakePage(trace);await closedPage.close();
    const actor={paytmPage:closedPage,hosts:{paytm:'https://paytm.test'},page:{context:()=>({newPage:()=>Promise.resolve(fakePage(trace))})}};
    return(await m.paytmOriginPage(actor))!==closedPage;
  });
  for(const o of[{evalResult:{status:200,text:'x'}},{evalRejects:true},null])
    await check('pageRequest '+JSON.stringify(o),async(m,trace)=>{
      const page=o&&fakePage(trace,o);
      const actor={hosts:{paytm:'https://paytm.test'},paytmOriginPage:()=>{trace.push('origin');return Promise.resolve(page);}};
      return m.paytmPageRequest(actor,'/p?x=1',{method:'POST',body:'b',referer:'r'});
    });
  for(const state of['open','closed','none','closeRejects'])
    await check('dispose '+state,async(m,trace)=>{
      const page=state==='none'?undefined:fakePage(trace,{closeRejects:state==='closeRejects'});
      if(state==='closed')await page.close();
      const actor={paytmPage:page};
      await m.disposePaytmPage(actor);
      return{cleared:actor.paytmPage===undefined};
    });
});

test('paytm-qr-request parsing helpers',async()=>{
  const[legacy,migrated]=load('paytm-qr-request');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64');
  const htmls=[`pushAppData = "${enc({qr:{dataurl:'data:image/png;base64,AAA'},orderId:'O1'})}"`,`pushAppData='${enc({qr:{image:'BBB'}})}'`,`pushAppData="${enc({qr:{dataUrl:'data:image/png;base64,CCC'},orderid:'O2'})}"`,`pushAppData="${enc({ORDER_ID:5})}"`,`pushAppData="${enc(null)}"`,`pushAppData="!!bad!!"`,'no data','',`pushAppData="${enc({qr:{dataurl:123}})}"`,`pushAppData="${enc({qr:null})}"`];
  for(const html of htmls)for(const globals of[undefined,{atob:t=>Buffer.from(t,'base64').toString('utf8')},{Buffer},{atob:()=>{throw new Error('x');},Buffer}]) {
    await check('appData '+html.slice(0,25),(m,trace)=>m.paytmAppData(html,globals&&{...globals,atob:globals.atob&&(t=>{trace.push('atob');return globals.atob(t);})}));
  }
  const datas=[null,undefined,{},{qr:{dataurl:'data:image/png;base64,ZZ'}},{qr:{dataurl:'',dataUrl:'x',image:'y'}},{qr:{dataurl:null,dataUrl:undefined,image:'img'}},{qr:{image:7}},{orderId:'A',orderid:'B'},{orderid:0,ORDER_ID:'C'},{ORDER_ID:99}];
  for(const data of datas) {
    await check('image '+JSON.stringify(data),m=>m.paytmQrImage(data));
    for(const url of['https://x.test/?orderid=U1','https://x.test/?orderId=U2','https://x.test/?ORDER_ID=U3','https://x.test/?x=1','not a url','','https://x.test/?orderid=&orderId=U4'])
      await check('order '+JSON.stringify([data,url]),m=>[m.paytmOrderFromUrl(url),m.paytmOrderFromData(data,url)]);
  }
});

test('fetchPaytmQr',async()=>{
  const[legacy,migrated]=load('paytm-qr-request');
  const check=differential(legacy,migrated);
  const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64');
  const pages={withQr:`pushAppData="${enc({qr:{dataurl:'data:image/png;base64,QRDATA'},orderId:'OD'})}"`,noQr:'<html></html>',orderOnly:`pushAppData="${enc({orderId:'OO'})}"`};
  const urls=['https://paytm.test/pay?orderid=FROMURL','https://paytm.test/pay'];
  for(const[name,html]of Object.entries(pages))for(const responseUrl of urls)for(const action of[undefined,'','/go?orderid=ACT','https://other.test/x?ORDER_ID=ABS'])for(const throwsAt of[null,'post','text','url']) {
    await check(JSON.stringify([name,responseUrl,action,throwsAt]),(m,trace)=>m.fetchPaytmQr({
      hosts:{paytm:'https://paytm.test'},reqRetry:(label,operation)=>{trace.push(['retry',label]);return operation();},
      req:{post:(url,options)=>{trace.push(['post',url,options]);if(throwsAt==='post')return Promise.reject(new Error('p'));return Promise.resolve({text:()=>throwsAt==='text'?Promise.reject(new Error('t')):Promise.resolve(html),url:()=>{trace.push('response.url');if(throwsAt==='url')throw new Error('u');return responseUrl;},status:()=>202});}},
      gwHeaders:async(host,options)=>{trace.push(['headers',host,options]);return{H:1};},log:function(...a){trace.push(['log',this===undefined,...a]);},snip:text=>trace.push(['snip',text.length]),
    },{action,mid:'M',encData:'E',checksum:'C'},{parseData:h=>m.paytmAppData(h),extractImage:d=>m.paytmQrImage(d),orderFromUrl:u=>m.paytmOrderFromUrl(u),orderFromData:(d,u)=>m.paytmOrderFromData(d,u)}));
  }
});

// scripted browser for the WebSocket room function
function runRoom(fn,script,{constructorThrows=false,sendThrows=false,noTimerFire=false}={}) {
  const log=[];
  const document=fakeDocument();
  let timer,socket;
  class FakeWebSocket{
    constructor(url){if(constructorThrows)throw new Error('ctor');log.push(['ws',url]);socket=this;}
    send(frame){log.push(['send',frame]);if(sendThrows)throw new Error('send');}
    close(){log.push('close');}
  }
  const sandbox={document,WebSocket:FakeWebSocket,JSON,String,Error,setTimeout:(callback,ms)=>{log.push(['setTimeout',ms]);timer=callback;return 1;},clearTimeout:()=>log.push('clearTimeout')};
  const promise=inBrowser(fn,sandbox)({wsUrl:'wss://x.test/ws',roomId:'ROOM',timeoutMs:1234});
  const apply=async()=>{
    for(const step of [...script,'timeout']) {
      if(step==='open')socket?.onopen?.();
      else if(step==='error')socket?.onerror?.();
      else if(step==='timeout')timer?.();
      else socket?.onmessage?.({data:step});
      await tick();
    }
  };
  return apply().then(()=>promise).then(value=>({value,log,note:document.elements.get('__pwslog')?.textContent??null}));
}
test('paytmSocketRoom (run from source text in a scripted browser)',async()=>{
  const[legacy,migrated]=load('paytm-websocket');sameExports(legacy,migrated);
  const room=JSON.stringify({event:'ROOM',data:{status:'SUCCESS'}});
  const scripts={
    full:['open','#1',JSON.stringify({rid:1}),room],stringData:['open',JSON.stringify({event:'ROOM',data:'plain'})],noData:['open',JSON.stringify({event:'ROOM'})],otherEvent:['open',JSON.stringify({event:'OTHER',data:1}),'timeout'],
    joinOnce:['open',JSON.stringify({rid:1}),JSON.stringify({rid:1}),room],badJson:['open','not json','timeout'],nonStringData:['open'],timeout:['open','timeout'],error:['open','error','timeout'],longMessage:['open','x'.repeat(200),'timeout'],
    ping:['#1','#1','timeout'],hitThenTimeout:['open',room,'timeout'],
  };
  for(const[name,script]of Object.entries(scripts))for(const options of[{},{sendThrows:true},{constructorThrows:true}]) {
    const expected=await runRoom(legacy.paytmSocketRoom,script,options),actual=await runRoom(migrated.paytmSocketRoom,script,options);
    assert.deepEqual(actual,expected,name+JSON.stringify(options));
  }
  const hit=await runRoom(migrated.paytmSocketRoom,scripts.full);
  assert.equal(hit.value,JSON.stringify({status:'SUCCESS'}));
});

test('waitForPaytmWs',async()=>{
  const[legacy,migrated]=load('paytm-websocket');
  const check=differential(legacy,migrated);
  const room=JSON.stringify({merchantId:'MM',orderId:'OO',paymentMode:'CC',topicName:'TT',acquirementId:'AQ',cashierRequestId:'CR',_id:'ID',status:'TXN_SUCCESS'});
  const scenarios={
    success:{raw:room},successDefaults:{raw:'{}'},successBadJson:{raw:'not json'},timeout:{raw:null},evaluateRejects:{evalRejects:true},
    wrongOrigin:{url:'https://evil.test/',raw:room},newPageRejects:{newPageRejects:true,raw:room},gotoRejects:{gotoRejects:true,raw:room},cancelled:{raw:'hang',stoppedAfter:1},cancelledNoStopFn:{raw:null,noStopped:true},
    framesLogged:{raw:room,frames:['a','abcd','abcd']},readLogRejects:{raw:room,readRejects:true},closeRejects:{raw:room,closeRejects:true},
  };
  for(const[name,o]of Object.entries(scenarios)) {
    const outcome=await check(name,async(m,trace)=>{
      const intervals=[];
      const timers={setInterval:(callback,ms)=>{trace.push(['setInterval',ms]);intervals.push(callback);return intervals.length;},clearInterval:id=>trace.push(['clearInterval',id])};
      const background=fakePage(trace,{url:o.url,gotoRejects:o.gotoRejects,closeRejects:o.closeRejects});
      let frames=0;
      const handle=(fn,arg)=>{
        trace.push(['evaluate',fn.name,fn.name==='paytmSocketRoom'?arg:undefined]);
        if(fn.name==='paytmSocketRoom')return o.evalRejects?Promise.reject(new Error('e')):o.raw==='hang'?new Promise(()=>{}):Promise.resolve(o.raw);
        if(fn.name==='readPaytmSocketLog')return o.readRejects?Promise.reject(new Error('r')):Promise.resolve((o.frames||[''])[Math.min(frames++,(o.frames||['']).length-1)]);
        return Promise.resolve();
      };
      background.evaluate=handle;
      const mainPage={...fakePage(trace),context:()=>({newPage:()=>o.newPageRejects?Promise.reject(new Error('n')):Promise.resolve(background)}),evaluate:handle};
      const actor={hosts:{paytm:'https://paytm.test'},page:mainPage,log:(...a)=>trace.push(['log',...a]),snip:raw=>trace.push(['snip',raw&&raw.length])};
      let stopCalls=0;
      const stopped=o.noStopped?undefined:()=>{const value=o.stoppedAfter!==undefined&&stopCalls++>=o.stoppedAfter;trace.push(['stopped?',value]);return value;};
      const waiting=m.waitForPaytmWs(actor,'MID','ORD',o.timeoutMs,stopped,{timers});
      await tick();
      intervals.forEach(callback=>callback());await tick();intervals.forEach(callback=>callback());await tick();
      return Promise.race([waiting,new Promise(resolve=>setTimeout(()=>resolve('HUNG:'+name),300))]);
    });
    assert.doesNotMatch(String(outcome.outcome.value),/HUNG/,name);
  }
});

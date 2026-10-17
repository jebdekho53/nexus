'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const legacy=require('./fixtures/legacy/gateway-redirect.legacy.cjs');
const migrated=require('../src/main/payment/gateway-redirect.cjs');

// src/ts/main/payment/gateway-redirect.ts versus the previous JavaScript.
const check=differential(legacy,migrated);

test('form parsing helpers',async()=>{
  sameExports(legacy,migrated);
  const pages=['','<form action="https://pay.test/go"><input name="encdata" value="E1"></form>',"<form method=post action='/relative'><input type=hidden name='mid' value='M'><input name='MID' value='UP'></form>",
    '<input name="encdata">','<input name="encdata" value="">','<input value="X" name="encdata">','<INPUT NAME="encdata" VALUE="C">','<input name="encData" value="E2"><input name="checksum" value="C1"><input name="CHECKSUMHASH" value="C2">',
    '<input name="ENC_DATA" value="E3"><input name="mid" value="">','<input name="MID" value="M2"><input name="checkSum" value="C3"><input name="enc_data" value="E4">','<form action="">','<form action=bad>','no form here'];
  for(const html of pages) {
    for(const name of['encdata','mid','MID','missing','a.b'])await check('hidden '+name+html.slice(0,30),m=>m.hiddenFormValue(html,name));
    await check('action '+html.slice(0,30),m=>m.formAction(html));
    await check('paytmForm '+html.slice(0,30),m=>m.paytmRedirectForm(html));
    await check('paytmForm injected '+html.slice(0,30),(m,trace)=>m.paytmRedirectForm(html,{getAction:h=>{trace.push('action');return'A';},getField:(h,name)=>{trace.push(name);return name==='checkSum'?'LAST':'';}}));
  }
});

const input={username:'user',clientTxnId:'T1',accessToken:'tok',rand8:'12345678',csrf:'csrf'};
const makeActor=(trace,o={})=>{
  let post=0;
  return{
    hosts:{wps:'https://wps.test'},
    req:{post:(url,options)=>{trace.push(['post',url,options]);const index=Math.min(post++,o.pages.length-1);const page=o.pages[index];return page instanceof Error?Promise.reject(page):Promise.resolve({text:()=>Promise.resolve(page.html),status:()=>page.status??200});}},
    reqRetry:(label,operation)=>{trace.push(['retry',label]);return operation();},
    gwHeaders:async(host,options)=>{trace.push(['headers',host,options]);return{H:1};},
    sleep:ms=>{trace.push(['sleep',ms]);return Promise.resolve();},log:function(...a){trace.push(['log',this===undefined?'plain':'actor',...a]);},
    snip:html=>{trace.push(['snip',html.length]);return o.snipThrows?(()=>{throw new Error('snip');})():'x';},noteGatewayPage:action=>trace.push(['note',action]),
  };
};
const ok='<form action="https://p.test/x"><input name="encdata" value="E"></form>';
const full='<form action="https://p.test/x"><input name="encData" value="E"><input name="mid" value="M"><input name="checksum" value="C"></form>';
test('paymentRedirect',async()=>{
  const scenarios={
    firstTry:{pages:[{html:ok}]},blockedFirst:{pages:[{html:'Unable to process your request'}]},retryThenAction:{pages:[{html:'<p>wait</p>'},{html:'<p>wait</p>'},{html:ok}]},
    neverAction:{pages:[{html:'<p>none</p>',status:502}]},postRejects:{pages:[new Error('net')]},rejectAfterRetry:{pages:[{html:''},new Error('late')]},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,(m,trace)=>m.paymentRedirect(makeActor(trace,o),input,{getAction:html=>m.formAction(html),getField:(html,field)=>m.hiddenFormValue(html,field)}));
});
test('paytmRedirect',async()=>{
  const scenarios={
    complete:{pages:[{html:full}]},partialThenComplete:{pages:[{html:ok},{html:full}]},neverComplete:{pages:[{html:ok}]},rejectsThenOk:{pages:[new Error('net'),{html:full}]},alwaysRejects:{pages:[new Error('net')]},
    snipThrows:{pages:[{html:full}],snipThrows:true},empty:{pages:[{html:''}]},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,(m,trace)=>m.paytmRedirect(makeActor(trace,o),input,{parseForm:html=>m.paytmRedirectForm(html)}));
  assert.deepEqual(await migrated.paytmRedirect(makeActor([],{pages:[{html:full}]}),input,{parseForm:html=>migrated.paytmRedirectForm(html)}),{action:'https://p.test/x',encData:'E',mid:'M',checksum:'C'});
});

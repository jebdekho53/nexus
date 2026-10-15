'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../src/main/runtime/matrix-services.cjs');
const {handle}=require('../services/control-plane/desktop-services.cjs');
test('own backend exposes config, status and clock without upstream requests',()=>{
  for(const route of ['config','status','time']){
    let body;const headers={};assert.equal(handle({method:'GET'},{setHeader:(k,v)=>headers[k]=v,end:v=>body=JSON.parse(v)},new URL('https://matrix.vaidya-gpt.com/api/desktop/'+route)),true);
    assert.equal(body.provider,'Matrix');assert.equal(headers['Cache-Control'],'no-store');
    if(route!=='time'){assert.equal(body.capabilities.manualCaptcha,true);assert.equal(body.capabilities.railOne,false);}
  }
  assert.equal(handle({method:'POST'},{},new URL('https://matrix.vaidya-gpt.com/api/desktop/status')),false);
});
test('desktop accepts only fixed Matrix endpoint, reports clock and never enables unsupported integrations',async()=>{
  let ticks=1000;
  const service=create({now:()=>ticks+=20,fetchImpl:async(url,options)=>{
    assert.equal(url,'https://matrix.vaidya-gpt.com/api/desktop/status');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    return {ok:true,json:async()=>({schema:1,provider:'Matrix',ok:true,serverTime:1100,capabilities:{railOne:true},urls:{analytics:'https://evil.example'}})};
  }});
  const state=await service.refresh();assert.equal(state.source,'online');assert.equal(state.clockOffsetMs,70);assert.equal(state.capabilities.railOne,false);assert.equal(state.urls,undefined);
  state.capabilities.webLogin=false;assert.equal(service.snapshot().capabilities.webLogin,true);
});
test('network failure and malformed configuration preserve local manual workflow',async()=>{
  for(const fetchImpl of [async()=>{throw new Error('offline');},async()=>({ok:true,json:async()=>({schema:2})})]){
    const state=await create({fetchImpl}).refresh();assert.equal(state.source,'local');assert.equal(state.capabilities.webLogin,true);assert.equal(state.clockOffsetMs,null);
  }
});
test('service IPC accepts only local Tools page and requires explicit refresh',async()=>{
  const path=require('node:path'),{pathToFileURL}=require('node:url');let callback,refreshes=0;
  require('../src/main/runtime/matrix-services.cjs').install({ipcMain:{handle:(channel,fn)=>{assert.equal(channel,'matrix:services:status');callback=fn;}}},process.cwd(),{snapshot:()=>({source:'local'}),refresh:()=>{refreshes++;return {source:'online'};}});
  for(const url of ['https://matrix.vaidya-gpt.com/tools.html',pathToFileURL(path.join(process.cwd(),'src/renderer/form.html')).href])assert.equal((await callback({sender:{getURL:()=>url}},true)).error,'Unavailable');
  assert.equal(refreshes,0);const event={sender:{getURL:()=>pathToFileURL(path.join(process.cwd(),'src/renderer/tools.html')).href}};
  assert.equal((await callback(event)).source,'local');assert.equal((await callback(event,true)).source,'online');assert.equal(refreshes,1);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {removedUrl,hooks,install}=require('../src/main/runtime/legacy-services.cjs');
const gist='https://gist.githubusercontent.com/2jrp7sv7ddsketch/d2af45d107e3ba3120c9ab13a5aefd9e/raw/captcha.enc';
test('only obsolete vendor destinations and the pinned remote bootstrap are removed',()=>{
  for(const url of ['https://simplycoding.uk/analytics','wss://socket.simplycoding.uk/ws/otp','https://SIMPLYCODING.UK./timeSync',gist+'?cache=1','https://c9fe7387-f.b-cdn.net/news'])assert.equal(removedUrl(url),true,url);
  for(const url of ['https://matrix.vaidya-gpt.com/api/portal/downloads','https://www.irctc.co.in/nget/','https://secure.paytmpayments.com/','https://gist.githubusercontent.com/other/file','https://simplycoding.uk.example/','file:///app/form.html'])assert.equal(removedUrl(url),false,url);
});
test('local bootstrap ignores cached/remote vendor URLs; decoder keeps real provider URLs',async()=>{
  const h=hooks();const result=await h.overrides.f2411({cachePath:'must-not-read',fallback:{analytics:'https://simplycoding.uk/analytics'}});
  assert.equal(result.source,'local');assert.deepEqual(Object.values(result.urls),['','','','','']);
  assert.equal(h.interceptors.f3614(()=>gist,[]),'https://retired.matrix.invalid/');
  assert.equal(h.interceptors.f3614(()=>'wss://simplycoding.uk/ws/otp',[]),'wss://retired.matrix.invalid/');
  assert.equal(h.interceptors.f3614(()=>'https://www.irctc.co.in/',[]),'https://www.irctc.co.in/');
  await assert.rejects(h.overrides.f1778(),{code:'MATRIX_LEGACY_SERVICE_REMOVED'});
  assert.throws(()=>h.overrides.f3627(),{code:'MATRIX_LEGACY_SERVICE_REMOVED'});
  assert.deepEqual(await h.overrides.f2009({url:'https://unlisted.example',account:'qa',train:'13307'}),{ok:true,skipped:true});
  assert.deepEqual(await h.overrides.f3381(),{ok:true,skipped:true});
});
test('fetch, HTTP and Electron requests are blocked before transport while local/provider traffic survives',async()=>{
  const http=require('node:http'),https=require('node:https');
  const saved={fetch:globalThis.fetch,httpRequest:http.request,httpGet:http.get,httpsRequest:https.request,httpsGet:https.get};
  let sent=0;globalThis.fetch=async()=>{sent++;return {ok:true};};
  const app=new EventEmitter();app.whenReady=()=>Promise.resolve();
  const session={webRequest:{onBeforeRequest(fn){this.callback=fn;}}};
  const electron={app,session:{defaultSession:session},net:{fetch:async()=>{sent++;return 'ok';},request:()=>{sent++;return 'ok';}}};
  const server=http.createServer((_req,res)=>res.end('local-ok'));
  try{
    install(electron);await new Promise(resolve=>setImmediate(resolve));
    await assert.rejects(fetch('https://simplycoding.uk/'),{code:'MATRIX_LEGACY_SERVICE_REMOVED'});
    await assert.rejects(electron.net.fetch(gist),{code:'MATRIX_LEGACY_SERVICE_REMOVED'});
    assert.throws(()=>https.request({hostname:'simplycoding.uk',path:'/analytics'}),{code:'MATRIX_LEGACY_SERVICE_REMOVED'});
    assert.throws(()=>https.get('https://www.irctc.co.in/',{hostname:'simplycoding.uk'}),{code:'MATRIX_LEGACY_SERVICE_REMOVED'});
    assert.throws(()=>electron.net.request({url:gist}),{code:'MATRIX_LEGACY_SERVICE_REMOVED'});
    assert.equal(sent,0);await fetch('https://matrix.vaidya-gpt.com/');assert.equal(sent,1);
    session.webRequest.callback({url:'wss://simplycoding.uk/ws/otp'},value=>assert.equal(value.cancel,true));
    session.webRequest.callback({url:'https://www.irctc.co.in/nget/'},value=>assert.equal(value.cancel,false));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const body=await new Promise((resolve,reject)=>http.get('http://127.0.0.1:'+server.address().port,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>resolve(b));}).on('error',reject));
    assert.equal(body,'local-ok');
  }finally{
    Object.assign(http,{request:saved.httpRequest,get:saved.httpGet});Object.assign(https,{request:saved.httpsRequest,get:saved.httpsGet});globalThis.fetch=saved.fetch;
    if(server.listening)await new Promise(resolve=>server.close(resolve));
  }
});

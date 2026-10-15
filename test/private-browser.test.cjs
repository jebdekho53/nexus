'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {privateBrowser,withPrivateLogin,checkAccessDenied,canonicalEntry}=require('../src/main/runtime/private-browser.cjs');

function fixture(){
  const removed=[],launches=[],events=[];let closed=0,disposed=0,oldClosed=0;
  const context=new EventEmitter(),browser=new EventEmitter();
  context.newPage=async()=>Object.assign(new EventEmitter(),{private:true});context.close=async()=>{closed++;context.emit('close');};
  browser.newContext=async options=>{assert.deepEqual(options,{viewport:null});return context;};
  const original=async options=>{launches.push(options);return {context:{browser:()=>browser,pages:()=>[{url:()=>'about:blank',close:async()=>oldClosed++}]},dispose:async()=>disposed++,cdpAttached:true};};
  const fs={mkdtemp:async()=>'/owned/matrix-private-one',rm:async dir=>removed.push(dir)};
  const hook=privateBrowser((...event)=>events.push(event),{fs,tmpdir:'/owned'}).f184;
  return {hook,original,context,browser,removed,launches,events,counts:()=>({closed,disposed,oldClosed})};
}
test('native login receives a private context without copying stored session data',async()=>{
  const f=fixture();const options={id:'synthetic',userDataDir:'/customer/profile'};
  const session=await f.hook(f.original,[options]);
  assert.equal(f.launches[0].userDataDir,'/owned/matrix-private-one');
  assert.equal(options.userDataDir,'/customer/profile');
  assert.equal(session.context,f.context);assert.equal(session.page.private,true);
  await Promise.all([session.dispose(),session.dispose()]);
  assert.deepEqual(f.counts(),{closed:1,disposed:1,oldClosed:1});
  assert.deepEqual(f.removed,['/owned/matrix-private-one']);
});
test('failed private-context creation cleans the owned profile and native browser',async()=>{
  const f=fixture();f.browser.newContext=async()=>{throw Error('creation failed');};
  await assert.rejects(f.hook(f.original,[{}]),/creation failed/);
  assert.deepEqual(f.removed,['/owned/matrix-private-one']);assert.equal(f.counts().disposed,1);
});
test('launcher page cleanup preserves other pair pages and restored nonblank tabs',async()=>{
  const first=fixture(),second=fixture();let unrelatedClosed=0;
  const hook=privateBrowser(()=>{},{fs:{mkdtemp:async()=>'/owned/pair',rm:async()=>{}}}).f184;
  const one=await withPrivateLogin(()=>hook(first.original,[{id:'pair-one'}]));
  one.page.url=()=> 'about:blank';one.page.close=async()=>{unrelatedClosed++;};
  const original=async options=>{const session=await second.original(options);session.context.pages=()=>[one.page,{url:()=> 'https://example.test/restored',close:async()=>unrelatedClosed++}];return session;};
  const two=await withPrivateLogin(()=>hook(original,[{id:'pair-two'}]));
  assert.equal(unrelatedClosed,0);assert.equal(first.counts().disposed,0);
  await two.dispose();assert.equal(first.counts().disposed,0);await one.dispose();
});
test('a failed selected browser never launches a fallback browser in the same login',async()=>{
  const f=fixture();let attempts=0;
  await withPrivateLogin(async()=>{
    await assert.rejects(f.hook(async()=>{attempts++;throw Error('selected Brave failed');},[{nativeBrowser:'brave'}]),/selected Brave failed/);
    await assert.rejects(f.hook(async()=>{attempts++;return f.original({});},[{nativeBrowser:'chrome'}]),{code:'MATRIX_BROWSER_RETRY_STOPPED'});
  });
  assert.equal(attempts,1);
  // A later explicit user retry is independent.
  await withPrivateLogin(async()=>{const session=await f.hook(f.original,[{}]);await session.dispose();});
});
test('private window restores normal bounds, comes to front and overrides hidden launch',async()=>{
  const f=fixture(),calls=[];
  f.context.newPage=async()=>Object.assign(new EventEmitter(),{bringToFront:async()=>calls.push('front')});
  f.context.newCDPSession=async()=>({send:async(method,args)=>{calls.push([method,args]);return {windowId:7};},detach:async()=>calls.push('detach')});
  const session=await f.hook(f.original,[{launchHidden:true,windowPosition:{x:-30000,y:-30000}}]);
  assert.equal(f.launches[0].launchHidden,false);assert.equal(f.launches[0].windowPosition,undefined);
  assert.deepEqual(calls,[['Browser.getWindowForTarget',undefined],['Browser.setWindowBounds',{windowId:7,bounds:{windowState:'normal'}}],'detach','front']);
  await session.dispose();
});
test('browser disconnection triggers cleanup without waiting for a later logout',async()=>{
  const f=fixture();await f.hook(f.original,[{}]);f.browser.emit('disconnected');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.removed,['/owned/matrix-private-one']);
});
test('challenge denial stops browser fallback and reports session rejection instead of guessing an IP block',async()=>{
  const f=fixture();
  const result=await withPrivateLogin(async()=>{
    const session=await f.hook(f.original,[{}]);
    session.page.evaluate=async()=>true;
    assert.equal(await checkAccessDenied(session.page),true);
    await assert.rejects(f.hook(f.original,[{}]),/IRCTC denied/);
    return {ok:false,error:'old guessed IP error'};
  });
  assert.equal(result.code,'IRCTC_ACCESS_DENIED');assert.match(result.error,/has not been confirmed/);
  assert.equal(f.launches.length,1);assert.equal(f.counts().disposed,1);
});
test('Auto and UI login cannot refill a private context from saved cookie pools',()=>{
  const hooks=privateBrowser();const options={cookieState:['saved'],cookieStatePool:['pool'],manual:true};
  for(const id of ['f811','f829'])hooks[id]((credentials,actual)=>{
    assert.equal(credentials,'synthetic');assert.equal(actual.cookieState,undefined);
    assert.equal(actual.cookieStatePool,undefined);assert.equal(actual.manual,true);
  },['synthetic',options]);
  assert.deepEqual(options.cookieState,['saved']);
});
test('one denied login does not change the result of another concurrent login',async()=>{
  const [denied,other]=await Promise.all([
    withPrivateLogin(async()=>{await checkAccessDenied({evaluate:async()=>true});return {ok:true};}),
    withPrivateLogin(async()=>{await new Promise(resolve=>setImmediate(resolve));return {ok:true,data:'separate run'};}),
  ]);
  assert.equal(denied.code,'IRCTC_ACCESS_DENIED');assert.deepEqual(other,{ok:true,data:'separate run'});
});
test('a configured proxy remains explicit in the private context',async()=>{
  const f=fixture(),proxy={server:'http://127.0.0.1:12345',username:'synthetic',password:'synthetic'};
  f.browser.newContext=async options=>{assert.deepEqual(options,{viewport:null,proxy});return f.context;};
  const session=await f.hook(f.original,[{proxy}]);await session.dispose();
});
test('only the bare HTTPS IRCTC entry becomes the SPA entry; security challenges remain untouched',()=>{
  assert.equal(canonicalEntry('https://www.irctc.co.in'),'https://www.irctc.co.in/nget/');
  for(const url of ['https://www.irctc.co.in/_sec/cpr/challenge?x=1','https://www.irctc.co.in/nget/train-search','https://www.irctc.co.in/?x=1','https://other.example/','http://www.irctc.co.in/'])assert.equal(canonicalEntry(url),url);
});

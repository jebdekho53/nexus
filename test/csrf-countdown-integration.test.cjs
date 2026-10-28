'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {csrfTiming}=require('../src/main/runtime/csrf-timing.cjs');
const {attachCsrfRecovery,refreshCsrfFromSpa,resyncCurrentCsrf}=require('../src/main/booking/csrf-recovery.cjs');

function setup(now=0) {
  let tick,token='login-token',calls=0;
  const timers={setInterval(fn){tick=fn;return 1;},clearInterval(id){assert.equal(id,1);tick=undefined;}};
  const actor={session:{mode:'weblogin',tokens:{csrfToken:'login-token'}},serverNow:()=>now,
    api:{csrfToken:()=>token,resyncCsrf:value=>{token=value;},call:async()=>{calls++;token='fresh-'+calls;}},log(){}};
  attachCsrfRecovery(actor);
  actor.csrfPreSlotArmed=true;
  return {actor,timers,hooks:csrfTiming(()=>{},timers),setNow:value=>{now=value;},tick:()=>tick?.(),calls:()=>calls,hasTimer:()=>Boolean(tick)};
}

test('8AM target remains intact: one guarded refresh, preserved callbacks, no request at opening',async()=>{
  const slot={ms:Date.parse('2026-10-25T08:00:00+05:30'),label:'8AM'};
  const h=setup(slot.ms-60000);
  let covers=0,activities=0;
  await h.hooks.f2282(async(target,cover,activity)=>{
    assert.strictEqual(target,slot);
    assert.equal(h.calls(),0);
    h.setNow(slot.ms-35000);
    await h.tick();
    assert.equal(h.calls(),1);
    await cover(); await activity('move');
    h.setNow(slot.ms-10000);await h.tick();
    h.setNow(slot.ms);await h.tick();
    assert.equal(h.calls(),1);
  },[slot,()=>{covers++;},value=>{assert.equal(value,'move');activities++;}],h.actor);
  assert.equal(covers,1);assert.equal(activities,1);assert.equal(h.hasTimer(),false);
  assert.equal(h.actor.session.tokens.csrfToken,'fresh-1');
  resyncCurrentCsrf(h.actor);
  assert.equal(h.actor.api.csrfToken(),'fresh-1');
});

test('8AM late countdown skips token request and still awaits the original target wait',async()=>{
  const h=setup(95000);let waited=false;
  await h.hooks.f2282(async target=>{assert.equal(target.ms,100000);waited=true;h.setNow(100000);},[{ms:100000}],h.actor);
  assert.equal(waited,true);assert.equal(h.actor.csrfPreSlot,'too-close');assert.equal(h.calls(),0);
});

test('opening cannot start availability while refresh is unresolved; concurrent refresh calls are deduplicated',async()=>{
  const h=setup(50000);let finish;
  h.actor.api.call=()=>new Promise(resolve=>{finish=resolve;});
  const first=refreshCsrfFromSpa(h.actor,'first');
  assert.strictEqual(refreshCsrfFromSpa(h.actor,'second'),first);
  let waitFinished=false;
  const waiting=h.hooks.f2282(async()=>{h.setNow(100000);},[{ms:100000}],h.actor).then(()=>{waitFinished=true;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(waitFinished,false);
  finish();await first;await waiting;
  assert.equal(waitFinished,true);assert.equal(h.hasTimer(),false);
});

test('each browser booking invocation resets prior countdown state and disarms when it exits',async()=>{
  const h=setup();h.actor.csrfPreSlot='refreshed';
  const original=async()=>{assert.equal(h.actor.csrfPreSlot,'pending');assert.equal(h.actor.csrfPreSlotArmed,false);h.actor.csrfPreSlotArmed=true;};
  await h.hooks.f2161(original,[],h.actor);assert.equal(h.actor.csrfPreSlotArmed,false);
  h.actor.csrfPreSlot='too-close';await h.hooks.f2161(original,[],h.actor);
});

test('cancelled countdown clears its scheduler and does not call activity callbacks',async()=>{
  const h=setup();let callbacks=0;
  await assert.rejects(h.hooks.f2282(async(target,cover)=>{h.actor.stopped=true;await cover();throw Error('cancelled');},[{ms:100000},()=>callbacks++],h.actor),/cancelled/);
  assert.equal(callbacks,0);assert.equal(h.hasTimer(),false);assert.equal(h.calls(),0);
});

test('browser booking arms CSRF before its probe for 8AM, 10AM and 11AM, and disarms on cancellation',async()=>{
  const {runBrowserBooking}=require('../src/main/booking/browser-booking.cjs');
  for(const hour of [8,10,11])for(const cancelled of [false,true]){
    const slot={ms:Date.parse(`2026-10-27T${String(hour).padStart(2,'0')}:00:00+05:30`)};
    const h=setup(slot.ms-35000),actor=h.actor;let availability=0;
    Object.assign(actor,{
      opts:{hideBrowser:false},captureLocationEarly(){},now:()=>slot.ms-35000,
      resolveTarget:()=>slot,relaunchIfLoggedOut:async()=>false,ensureAuthToken:async()=>true,
      ensureCsrfEstablished:async()=>{},ensureServerTimeSynced:async()=>{},setTokenOwnership(){},onProgress(){},
      preTargetProbe:async()=>{
        assert.equal(actor.csrfPreSlotArmed,true);
        if(cancelled){actor.stopped=true;return 'early';}
        await h.hooks.f2282(async()=>{h.setNow(slot.ms);},[slot],actor);
        assert.equal(h.calls(),1);
        return 'early';
      },
      isChancesFlow:()=>false,pollAvailability:async()=>{availability++;assert.equal(h.calls(),1);actor.stopped=true;},
    });
    actor.session.page={waitForLoadState:async()=>{}};
    const deps={humanFor:()=>({dwell:async()=>{}}),clientTxnId:()=> 'fixture',slotImminent:()=>true,windowLimit:()=>60000,shouldSearch:()=>false,clearOverlays:async()=>{},spaDecision:()=> 'skip',stopped:()=>({stopped:true})};
    await h.hooks.f2161(job=>runBrowserBooking(actor,job,{},deps),[{trainNumber:'12345',origin:'AAA',passengers:[]}],actor);
    assert.equal(availability,cancelled?0:1);assert.equal(h.calls(),cancelled?0:1);
    assert.equal(actor.csrfPreSlotArmed,false);assert.equal(h.hasTimer(),false);
  }
});

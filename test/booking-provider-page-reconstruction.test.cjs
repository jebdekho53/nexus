'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');

for(const[name,url]of Object.entries({
  root:'https://irctc.co.in/',sub:'https://www.irctc.co.in/nget/train-search',upper:'HTTPS://WWW.IRCTC.CO.IN/x',port:'https://irctc.co.in:8443/',other:'https://example.invalid/',lookalike:'https://notirctc.co.in/',suffix:'https://irctc.co.in.evil.invalid/',
  invalid:'not a url',empty:'',undefinedUrl:undefined,nullUrl:null,userinfo:'https://user@www.irctc.co.in/',
}))test('providerOriginOk matches recovered origin rules: '+name,()=>compare(async native=>{
  const{method}=harness({native});
  return outcome(async()=>method('f2255')(url));
}));

for(const[name,scenario]of Object.entries({noPage:{noPage:true},onOrigin:{ok:true},offOrigin:{ok:false},urlThrows:{urlThrows:true},checkThrows:{checkThrows:true},truthy:{ok:'yes'}}))
  test('onProviderPage matches recovered page check: '+name,()=>compare(async native=>{
    const calls=[];
    const classObject={providerOriginOk(url){calls.push(['check',url]);if(scenario.checkThrows)throw Error('synthetic check');return scenario.ok;}};
    const{method}=harness({native,scope:{51:classObject}});
    const actor={session:{page:scenario.noPage?undefined:{url(){calls.push(['url']);if(scenario.urlThrows)throw Error('synthetic url');return 'https://x.invalid/a';}}}};
    return{value:await outcome(async()=>method('f2256').call(actor)),calls};
  }));

async function ensure(native,scenario) {
  const trace=[];let clock=1000000,pageUrl=scenario.startUrl??'https://x.invalid/a';
  const{method}=harness({native});
  const actor={
    stopped:false,opts:{hideBrowser:scenario.hideBrowser},
    session:{page:{url(){if(scenario.urlThrows)throw Error('synthetic url');return pageUrl;},waitForTimeout(ms){trace.push(['wait',ms,clock]);clock+=scenario.tickMs??700;
      if(scenario.returnAfter!==undefined&&trace.filter(r=>r[0]==='wait').length>=scenario.returnAfter)scenario.returned=true;
      if(scenario.stopAfter!==undefined&&trace.filter(r=>r[0]==='wait').length>=scenario.stopAfter)actor.stopped=true;
      return scenario.waitRejects?Promise.reject(Error('synthetic wait')):Promise.resolve();}}},
    now(){return clock;},
    onProviderPage(){trace.push(['on?']);return scenario.alreadyOn||!!scenario.returned;},
    focusBrowser(){trace.push(['focus']);if(scenario.focusThrows)throw Error('synthetic focus');return scenario.focusRejects?Promise.reject(Error('synthetic focus')):Promise.resolve();},
    hideBrowser(){trace.push(['hide']);if(scenario.hideRejects)return Promise.reject(Error('synthetic hide'));return Promise.resolve();},
    onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
  };
  return{value:await outcome(async()=>method('f2257').call(actor,'refresh the search')),trace:trace.slice(0,60),waits:trace.filter(r=>r[0]==='wait').length};
}
for(const[name,scenario]of Object.entries({
  alreadyOn:{alreadyOn:true},returns:{returnAfter:3},returnsFirst:{returnAfter:1},hideOff:{returnAfter:2,hideBrowser:false},hideZero:{returnAfter:2,hideBrowser:0},hideRejects:{returnAfter:2,hideRejects:true},
  stopped:{stopAfter:2},neverReturns:{tickMs:60000},waitRejects:{returnAfter:2,waitRejects:true},focusRejects:{returnAfter:1,focusRejects:true},focusThrows:{returnAfter:1,focusThrows:true},urlThrows:{returnAfter:1,urlThrows:true},
}))test('ensureOnProviderPage matches recovered handover wait: '+name,()=>compare(native=>ensure(native,{...scenario})));

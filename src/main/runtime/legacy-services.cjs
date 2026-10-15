'use strict';
const bootstrapPath='/2jrp7sv7ddsketch/d2af45d107e3ba3120c9ab13a5aefd9e/raw/captcha.enc';
function removedUrl(value){
  try{
    const url=new URL(typeof value==='string'?value:value?.url||value?.href);
    const host=url.hostname.toLowerCase().replace(/\.$/,'');
    return host==='retired.matrix.invalid'||host==='simplycoding.uk'||host.endsWith('.simplycoding.uk')||host==='c9fe7387-f.b-cdn.net'||(host==='gist.githubusercontent.com'&&url.pathname===bootstrapPath);
  }catch{return false;}
}
function unavailable(){return Object.assign(new Error('This legacy vendor service was removed. Its Matrix replacement is not configured. Use manual CAPTCHA entry or a supported WebLogin flow.'),{code:'MATRIX_LEGACY_SERVICE_REMOVED'});}
function hooks(log=()=>{}){
  return {
    overrides:{
      // Replace the remote/cache loader only; retain normal local startup.
      f2411:async()=>{log('matrix-local-service-config');return {urls:{heatMap:'',booksConfig:'',analytics:'',telementry:'',clientUpdate:''},flags:{},source:'local'};},
      f1778:async()=>{throw unavailable();},
      f3627:()=>{throw unavailable();},
      f3381:async()=>({ok:true,skipped:true}),
      // Booking/account reporting stays disabled in release as well as dev,
      // even if an old cache or caller supplies a different destination.
      f2009:async()=>{log('matrix-vendor-reporting-disabled');return {ok:true,skipped:true};},
    },
    interceptors:{
      // Remove inherited endpoint defaults at decoding, before configuration
      // objects receive them. Other GitHub URLs and provider URLs survive.
      f3614:(original,args)=>{const value=original(...args);if(typeof value!=='string'||!removedUrl(value))return value;const url=new URL(value);return (url.protocol==='wss:'||url.protocol==='ws:'?'wss:':'https:')+'//retired.matrix.invalid/';},
    },
  };
}
function install(electron,log=()=>{}){
  const check=value=>{if(removedUrl(value)){log('matrix-legacy-service-blocked');throw unavailable();}};
  const fetch=globalThis.fetch;
  globalThis.fetch=function(input,...args){try{check(input);}catch(error){return Promise.reject(error);}return Reflect.apply(fetch,this,[input,...args]);};
  for(const name of ['node:http','node:https']){
    const module=require(name);
    for(const method of ['request','get']){
      const original=module[method];
      module[method]=function(input,...args){
        const value=typeof input==='string'||input instanceof URL?input:(input?.hostname||input?.host)?(input.protocol||(name==='node:https'?'https:':'http:'))+'//'+(input.hostname||input.host)+(input.path||'/'):input;
        check(value);
        if(args[0]&&typeof args[0]==='object'&&(args[0].hostname||args[0].host))check((args[0].protocol||(name==='node:https'?'https:':'http:'))+'//'+(args[0].hostname||args[0].host)+(args[0].path||'/'));
        return Reflect.apply(original,this,[input,...args]);
      };
    }
  }
  if(electron.net){
    for(const method of ['fetch','request'])if(typeof electron.net[method]==='function'){
      const original=electron.net[method].bind(electron.net);
      electron.net[method]=function(input,...args){if(method==='fetch'){try{check(input);}catch(error){return Promise.reject(error);}}else check(input);return original(input,...args);};
    }
  }
  const sessions=new WeakSet();
  function protect(session){
    if(!session||sessions.has(session))return;
    sessions.add(session);
    session.webRequest.onBeforeRequest((details,callback)=>{
      const cancel=removedUrl(details.url);
      if(cancel)log('matrix-legacy-service-blocked');
      callback({cancel});
    });
  }
  electron.app.on('session-created',protect);
  electron.app.whenReady().then(()=>protect(electron.session.defaultSession));
  return {protect};
}
module.exports={removedUrl,hooks,install};

'use strict';
function normalized(value){if(!value||value.schema!==1||!/^[a-f0-9]{64}$/.test(value.hardware||''))throw Error('Hardware verification required; update Matrix or contact administrator');const result={schema:1};for(const key of ['hardware','board','os','disk','cpu'])if(/^[a-f0-9]{64}$/.test(value[key]||''))result[key]=value[key];return result;}
function matches(a,b){return !!a&&!!b&&(a.hardware===b.hardware||!!a.board&&a.board===b.board||!!a.os&&a.os===b.os||!!a.disk&&a.disk===b.disk);}
function guard(registry,device,value){
 registry.deviceIdentities??={};const previous=Object.hasOwn(registry.deviceIdentities,device)?registry.deviceIdentities[device]:null;
 const identity=value?normalized(value):null;
 if(previous&&!identity)throw Error('Hardware verification required; update Matrix');
 if(registry.blockedDevices?.some(d=>d.device===device||identity&&matches(d.identity,identity)))throw Error('This device has been blocked by the administrator');
 if(previous&&identity){
  const changed=['hardware','board','os','disk','cpu'].filter(key=>previous[key]&&identity[key]&&previous[key]!==identity[key]);
  if(changed.length){registry.deviceSecurityEvents??=[];registry.deviceSecurityEvents.push({device,at:new Date().toISOString(),changed,reason:'identity-change',action:changed.includes('hardware')?'denied':'review'});registry.deviceSecurityEvents=registry.deviceSecurityEvents.slice(-1000);}
  if(changed.includes('hardware'))throw Error('Device hardware changed; administrator review required');
 }
 if(identity)Object.defineProperty(registry.deviceIdentities,device,{value:{...previous,...identity},enumerable:true,writable:true,configurable:true});
}
module.exports={normalized,matches,guard};

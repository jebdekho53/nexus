'use strict';
const test=require('node:test');
const {harness,compare,outcome}=require('./helpers/recovered-harness.cjs');
const {HOLE}=require('../src/main/runtime/engine.cjs');
function scenario(name,id,options={}) {
  test('settings migrations match recovered: '+name,async()=>compare(async native=>{
    const trace=[];let stored=Object.hasOwn(options,'settings')?options.settings:{other:'keep',autoUpdate:true};
    const call=(name,fn)=>(...args)=>{trace.push([name,...args]);if(options.fail===name)throw new Error('synthetic '+name);return fn(...args);};
    const slots={
      1768:call('read',()=>stored),1769:call('write',next=>{stored=next;}),
      1712:call('forms',()=>({clearAvailTimingOverrides:call('clear',()=>Object.hasOwn(options,'result')?options.result:{ok:true,changed:2})})),
      1885:call('log',()=>{}),
      14:{get join(){trace.push(['getJoin']);if(options.fail==='join-getter')throw new Error('synthetic join-getter');return call('join',(directory,name)=>directory+'/'+name);}},
      22:{app:{getPath:call('userData',()=>'/synthetic')}},
    };
    for(const slot of options.holes??[])slots[slot]=HOLE;
    const h=harness({native,slots});
    return {result:await outcome(()=>{const fn=h.rootFunction(id);const first=fn();return options.repeat?fn():first;}),trace,stored};
  }));
}
for(const settings of [undefined,null,false,0,'text',{},[],{autoUpdate:true,other:'keep'},{autoUpdate:false,autoUpdateOffMigrated:false},{autoUpdate:true,autoUpdateOffMigrated:true},{autoUpdateOffMigrated:1},{autoUpdateOffMigrated:'yes'}])
  scenario('auto update '+JSON.stringify(settings),'f3543',{settings});
for(const fail of ['read','write'])scenario('auto update failure '+fail,'f3543',{fail});
scenario('auto update only once','f3543',{repeat:true});
for(const settings of [undefined,null,false,0,'text',{},[],{availTimingResetMigrated:false,other:'keep'},{availTimingResetMigrated:true},{availTimingResetMigrated:1},{availTimingResetMigrated:'yes'}])
  scenario('timing '+JSON.stringify(settings),'f3544',{settings});
for(const result of [undefined,null,false,{}, {ok:false,changed:9},{ok:0,changed:4},{ok:true},{ok:true,changed:0},{ok:true,changed:1},{ok:true,changed:12},{ok:true,changed:'3'},{ok:1,changed:-1},{ok:true,changed:false}])
  scenario('timing result '+JSON.stringify(result),'f3544',{result});
for(const fail of ['read','forms','clear','write','log'])scenario('timing failure '+fail,'f3544',{fail});
scenario('timing only once','f3544',{repeat:true});
for(const fail of [undefined,'userData','join','join-getter'])scenario('settings path '+fail,'f3551',{fail});
for(const slot of [14,22])scenario('settings path uninitialised '+slot,'f3551',{holes:[slot]});

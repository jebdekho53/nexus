'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {webBookingUpgrades}=require('../src/main/runtime/web-booking-upgrades.cjs');
const {createCompiledRuntime}=require('../src/main/runtime/compiled-runtime.cjs');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const strings=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
for(const compiled of [false,true])for(const newSite of [false,true])test(`default ${compiled?'compiled':'instruction'} ${newSite?'new-site':'standard'} availability adapter sends actual recovered URL and object body`,async()=>{
 const options={functionFactories:webBookingUpgrades()};
 const runtime=compiled?createCompiledRuntime(options):createEngine(require('../src/main/generated/index.cjs'),options);
 const root=runtime.context(2000,null),scope=runtime.context(2,root);
 root[5]=(n,k)=>strings[n+'|'+k];root[345]='https://irctc.co.in/eticketing/protected/mapps1';root[346]=d=>d;root[348]=q=>q;
 root[351]=runtime.makeFunction('f505',root);root[369]=runtime.makeFunction('f516',root);
 root[353]='https://irctc.co.in/eticketing/protected/mapps1/new-site-availability';root[371]=()=>({newSite:true});root[408]=b=>b;
 root[363]=5;root[403]=()=>null;root[404]=()=>null;root[405]=b=>b;root[409]=()=>false;root[912]=600000;root[915]=()=>3000;root[916]=()=>({expired:false});root[921]=new Set();root[928]=()=>'';
 root[774]={parseAkScore:()=>null};root[930]=()=> 'ok';root[939]=()=>'';
 const original=Object.freeze({trainNumber:'53047',fromStation:'BWN',toStation:'KAN',coach:'2S',quota:'GN',journeyDate:'2026-10-27'});
 let calls=0;
 const actor={opts:{newSiteFlowAvail:newSite},session:{page:{isClosed:()=>false}},resolveTarget:()=>null,serverNow:()=>0,now:()=>0,log(){},onProgress(){},sensorCheckpoint(){},
  api:{call:async(method,url,body)=>{
   calls++;assert.equal(method,'POST');
   if(newSite){assert.equal(url,root[353]);assert.deepEqual(body,{newSite:true});return{ok:true,status:200,body:{reasonType:'S'}};}
   assert.equal(url,'https://irctc.co.in/eticketing/protected/mapps1/avlFarenquiry/53047/2026-10-27/BWN/KAN/2S/GN/N');
   assert.equal(typeof body,'object');assert.equal(body.journeyDate,'2026-10-27');assert.equal(body.fromStnCode,'BWN');assert.equal(body.toStnCode,'KAN');assert.equal(body.quotaCode,'GN');
   return{ok:true,status:200,body:{reasonType:'S',status:'AVAILABLE 20',totalCollectibleAmount:100}};
  }}};
 actor.safeCall=runtime.makeFunction('f2064',scope);
 const result=await runtime.makeFunction('f2269',scope).call(actor,original,'53047',{},{});
 assert.equal(calls,1);assert.equal(result.reasonType,'S');assert.equal(original.journeyDate,'2026-10-27');
});

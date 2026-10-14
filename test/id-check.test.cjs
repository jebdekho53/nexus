const test=require('node:test'),assert=require('node:assert/strict');
const {classify,fallbackIds}=require('../src/main/runtime/id-check.cjs');
const confirmed=id=>({userId:id,status:'1#1#1#1',isIrctcProfileComplete:true});
test('fallback requires matching ID and explicit complete status',()=>{
 assert.equal(classify('TestUser',confirmed('testuser')).state,'verified');
 for(const data of [null,confirmed('different'),{...confirmed('TestUser'),errorList:['error']},{...confirmed('TestUser'),status:'1#1#1#0'},{...confirmed('TestUser'),error:'Unavailable'}])assert.equal(classify('TestUser',data).state,'unknown');
 assert.equal(classify('TestUser',{...confirmed('TestUser'),isIrctcProfileComplete:false}).state,'unverified');
});
test('primary results survive; fallback uses only encoded IDs and keeps order',async()=>{
 const calls=[],known={userId:'Known',state:'disabled'};
 const result=await fallbackIds(['Known','TestUser','bad/id'],{data:[known]},async(url,options)=>{calls.push(url);assert.ok(options.signal);return{ok:true,json:async()=>confirmed('TestUser')};});
 assert.equal(result.data[0],known);assert.equal(result.data[1].state,'verified');assert.equal(result.data[2].state,'invalid');
 assert.deepEqual(calls,['https://railways.makemytrip.com/api/user/status/TestUser']);
});
test('network, HTTP and malformed JSON failures remain unknown',async()=>{
 for(const request of [async()=>{throw Error('offline')},async()=>({ok:false,status:403}),async()=>({ok:true,json:async()=>{throw Error('invalid JSON')}})])assert.equal((await fallbackIds(['TestUser'],{ok:false},request)).data[0].state,'unknown');
});

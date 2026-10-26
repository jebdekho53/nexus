'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fromHardware}=require('../src/main/runtime/trial-device.cjs');
test('trial identity is stable across users/RDP profiles; sends hashes only',()=>{
 const h={uuid:'50123456-1234-5678-abcd-0123456789ab',board:'BOARD12345',machine:'guid-12345',manufacturer:'Acer',model:'Aspire'};
 const a=fromHardware(h),b=fromHardware({...h,user:'other-rdp-user'});
 assert.deepEqual(a,b);assert.equal(a.hardware.length,64);assert.equal(JSON.stringify(a).includes(h.uuid),false);assert.equal(a.virtual,false);
 assert.equal(fromHardware({...h,manufacturer:'VMware',model:'Virtual Machine'}).virtual,true);
 assert.throws(()=>fromHardware({...h,uuid:'unknown'}));
});

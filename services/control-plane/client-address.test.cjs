'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {clientAddress,recordAccess}=require('./client-address.cjs');
test('forwarded IP cannot be forged through untrusted peers',()=>{
 const before=process.env.MATRIX_TRUSTED_PROXIES;process.env.MATRIX_TRUSTED_PROXIES='172.20.0.2';
 try{assert.equal(clientAddress({socket:{remoteAddress:'198.51.100.2'},headers:{'x-forwarded-for':'1.2.3.4'}}),'198.51.100.2');assert.equal(clientAddress({socket:{remoteAddress:'::ffff:172.20.0.2'},headers:{'x-forwarded-for':'spoof, 203.0.113.2'}}),'203.0.113.2');}finally{if(before===undefined)delete process.env.MATRIX_TRUSTED_PROXIES;else process.env.MATRIX_TRUSTED_PROXIES=before;}
});
test('device IP first/last seen and recent history remain bounded',()=>{const item={};for(let n=1;n<=15;n++)recordAccess(item,'device','192.0.2.'+n,n*1000);assert.equal(item.deviceAccess.length,1);assert.equal(item.deviceAccess[0].firstIp,'192.0.2.1');assert.equal(item.deviceAccess[0].lastIp,'192.0.2.15');assert.equal(item.deviceAccess[0].recentIps.length,10);});

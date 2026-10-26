'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {create}=require('../src/renderer/matrix-account-verification.js');
function harness(check){
 const elements={};
 for(const name of ['mUsername','mPassword','mMobile','mIdStat','mCheckId','modalTitle','userModal']){
  const e=elements[name]={value:'',textContent:'',className:'',disabled:false,listeners:{},focus(){},addEventListener(name,fn){this.listeners[name]=fn;}};
  e.classList={contains:name=>e.className.split(' ').includes(name),add:name=>e.className+=' '+name,remove:name=>e.className=e.className.split(' ').filter(n=>n!==name).join(' ')};
 }
 const results=[],service=create({username:elements.mUsername,status:elements.mIdStat,button:elements.mCheckId,modal:elements.userModal,check,onResult:(...args)=>results.push(args)});service.bind();
 // Execute the production modal open/close functions, preserving their original
 // field initialization and testing their new verification reset integration.
 const source=fs.readFileSync(path.join(__dirname,'../src/renderer/assets/login-data-cJH5cCIl.js'),'utf8');
 const modalSource=source.slice(source.indexOf('function B('),source.indexOf('async function H('));
 const words={0x21f:'modalTitle',0x1e4:'Edit User ID',0x245:'mUsername',0x189:'value',0x1ee:'username',0x215:'mMobile',0x1ea:'mobileNumber',0x1b4:'mPassword',0x1ad:'type',0x1d2:'password',0x1bb:'classList',0x1a3:'hidden'};
 const context={matrixIdVerification:service,i:id=>elements[id],d:id=>elements[id],L:elements.userModal,k:null,_0x3458:n=>{assert(n in words,'Unexpected modal lookup '+n);return words[n];}};
 vm.runInNewContext(modalSource+';globalThis.openAccount=B;globalThis.closeAccount=b;',context);
 return{elements,service,results,open:context.openAccount,close:context.closeAccount};
}
test('new account clears the previous verified badge and credentials; edit keeps only its own credentials',async()=>{
 const h=harness(async id=>({ok:true,data:[{userId:id,state:'verified'}]}));
 h.open();h.elements.mUsername.value='AccountA';h.elements.mPassword.value='synthetic';await h.service.verify();assert.match(h.elements.mIdStat.textContent,/VERIFIED/);
 h.open();assert.equal(h.elements.mUsername.value,'');assert.equal(h.elements.mPassword.value,'');assert.equal(h.elements.mIdStat.textContent,'');assert(h.elements.mIdStat.classList.contains('hidden'));assert.equal(h.elements.mCheckId.disabled,false);
 h.open({username:'AccountB',password:'other-fixture',mobileNumber:'9999999999'});assert.equal(h.elements.mUsername.value,'AccountB');assert.equal(h.elements.mPassword.value,'other-fixture');assert.equal(h.elements.mPassword.type,'password');assert.equal(h.elements.mIdStat.textContent,'');
 assert.deepEqual(h.results,[['AccountA','verified']]);
});
test('late response from an earlier account cannot overwrite a new check or re-enable its button',async()=>{
 const pending=[];const h=harness(id=>new Promise(resolve=>pending.push({id,resolve})));
 h.open();h.elements.mUsername.value='AccountA';const a=h.service.verify();h.open();h.elements.mUsername.value='AccountB';const b=h.service.verify();
 pending[0].resolve({ok:true,data:[{userId:'AccountA',state:'verified'}]});await a;assert.equal(h.elements.mIdStat.textContent,'Checking…');assert.equal(h.elements.mCheckId.disabled,true);assert.deepEqual(h.results,[]);
 pending[1].resolve({ok:true,data:[{userId:'AccountB',state:'verified'}]});await b;assert.match(h.elements.mIdStat.textContent,/VERIFIED/);assert.equal(h.elements.mCheckId.disabled,false);assert.deepEqual(h.results,[['AccountB','verified']]);
});
test('editing the ID or closing the dialog invalidates pending responses',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));h.open();h.elements.mUsername.value='AccountA';const a=h.service.verify();h.elements.mUsername.value='AccountB';h.elements.mUsername.listeners.input();resolve({ok:true,data:[{userId:'AccountA',state:'verified'}]});await a;assert.equal(h.elements.mIdStat.textContent,'');assert.deepEqual(h.results,[]);
 const b=h.service.verify();h.close();resolve({ok:true,data:[{userId:'AccountB',state:'verified'}]});await b;assert.equal(h.elements.mIdStat.textContent,'');assert.deepEqual(h.results,[]);
});
test('blank ID, wrong-account verification and network failures never show verified',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return{ok:true,data:[{userId:'WrongAccount',state:'verified'}]};});h.open();await h.service.verify();assert.equal(calls,0);assert.doesNotMatch(h.elements.mIdStat.textContent,/VERIFIED/);
 h.elements.mUsername.value='AccountB';await h.service.verify();assert.equal(h.elements.mIdStat.className,'id-stat unknown');assert.deepEqual(h.results,[['AccountB','unknown']]);
 const failed=harness(async()=>{throw Error('Offline');});failed.open();failed.elements.mUsername.value='AccountC';await failed.service.verify();assert.equal(failed.elements.mIdStat.className,'id-stat unknown');assert.equal(failed.elements.mCheckId.disabled,false);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('API diagnostics writes only whitelisted fields and never request secrets',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-api-diag-'));fs.mkdirSync(path.join(root,'diagnostics'));
 const before=process.env.MATRIX_DIAGNOSTICS;process.env.MATRIX_DIAGNOSTICS='1';
 try{
  const record=require('../src/main/runtime/api-diagnostics.cjs').create(root);
  record({method:'POST',path:'https://example.test/mapps1/allLapAvlFareEnq/Y?token=private',status:510,category:'highload',body:{password:'private'},headers:{authorization:'private'}});
  const text=fs.readFileSync(path.join(root,'diagnostics/api-summary.jsonl'),'utf8'),row=JSON.parse(text);
  assert.equal(text.includes('private'),false);assert.equal(text.includes('example.test'),false);assert.equal(row.endpoint,'allLapAvlFareEnq/Y');assert.equal(row.status,510);assert.deepEqual(Object.keys(row),['at','endpoint','method','status','category']);
 }finally{if(before===undefined)delete process.env.MATRIX_DIAGNOSTICS;else process.env.MATRIX_DIAGNOSTICS=before;fs.rmSync(root,{recursive:true,force:true});}
});

test('normal release activity receives sanitized timings without enabling diagnostic capture',()=>{
 const before=process.env.MATRIX_DIAGNOSTICS;delete process.env.MATRIX_DIAGNOSTICS;
 try{
  const rows=[],owners=[],actor={};
  const record=require('../src/main/runtime/api-diagnostics.cjs').create('unused',{onRecord:(row,owner)=>{rows.push(row);owners.push(owner);}});
  record({method:'POST',path:'/mapps1/allLapAvlFareEnq/Y/2?csrfToken=PRIVATE',status:510,category:'highload',durationMs:815.6,attempt:2,reason:'provider-highload',body:'PRIVATE'},actor);
  assert.deepEqual({...rows[0],at:0},{at:0,endpoint:'allLapAvlFareEnq/Y',method:'POST',status:510,category:'highload',durationMs:816,attempt:2,reason:'provider-highload'});
  assert.equal(owners[0],actor);
  record({path:'/unrecognized/PRIVATE',method:'PRIVATE',category:'PRIVATE',reason:'PRIVATE',durationMs:NaN,attempt:-1});
  assert.equal(rows[1].endpoint,'other');assert.equal(JSON.stringify(rows).includes('PRIVATE'),false);
  assert.equal(Object.hasOwn(rows[1],'durationMs'),false);
  assert.doesNotThrow(()=>require('../src/main/runtime/api-diagnostics.cjs').create('unused',{onRecord:()=>{throw Error('logger failed');}})({}));
 }finally{if(before!==undefined)process.env.MATRIX_DIAGNOSTICS=before;}
});

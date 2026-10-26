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

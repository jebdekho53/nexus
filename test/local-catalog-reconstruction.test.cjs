'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,compare,outcome}=require('./helpers/recovered-harness.cjs');
const {HOLE}=require('../src/main/runtime/engine.cjs');

function scenario(name,make) {
  test('local catalog matches recovered: '+name,async()=>compare(async native=>{
    const trace=[];
    const {slots,run}=make(trace);
    const h=harness({native,slots});
    return {result:await outcome(()=>run(h)),trace};
  }));
}
const stations=[
  {sc:'XAB',en:'Contains only'}, {sc:'Y',en:'AB name prefix'},
  {sc:'ABC',en:'Code prefix'}, {sc:'AB',en:'Exact code'},
  {sc:'ZZ',en:'name contains ab'}, {sc:'ab',en:'Second exact'},
  {sc:'ABX',en:'AB both prefixes'}, {sc:'NO',en:'No match'},
];
for(const query of ['ab',' AB ','Ab','prefix','no match','nothing','','  ','x','ß','名',undefined,null,1,{},false]) {
  scenario('stations '+JSON.stringify(query),trace=>({
    slots:{1705:stations},run:h=>h.rootFunction('f3496')(query),
  }));
  scenario('trains '+JSON.stringify(query),trace=>({
    slots:{1706:['AB express','no match','prefix special','ab express','x名ß']},run:h=>h.rootFunction('f3497')(query),
  }));
}
for(const count of [0,1,11,12,13,30]) {
  scenario('station cap '+count,()=>({slots:{1705:[...Array.from({length:count},(_,i)=>({sc:'AB'+i,en:'match'})),{sc:'AB',en:'last exact'}]},run:h=>h.rootFunction('f3496')('AB')}));
  scenario('train cap '+count,()=>({slots:{1706:Array.from({length:count},(_,i)=>'AB '+i)},run:h=>h.rootFunction('f3497')('AB')}));
}
for(const id of ['f3496','f3497']) {
  const slot=id==='f3496'?1705:1706;
  scenario(id+' empty does not access uninitialised catalog',()=>({slots:{[slot]:HOLE},run:h=>h.rootFunction(id)('  ')}));
  scenario(id+' uninitialised catalog',()=>({slots:{[slot]:HOLE},run:h=>h.rootFunction(id)('AB')}));
  scenario(id+' invalid catalog',()=>({slots:{[slot]:null},run:h=>h.rootFunction(id)('AB')}));
  for(const failAt of [0,2,14])scenario(id+' iterator read failure '+failAt,trace=>{
    const catalog={*[Symbol.iterator](){try{for(let i=0;i<20;i++){trace.push(['row',i]);if(i===failAt)throw new Error('synthetic iterator');yield id==='f3496'?{sc:'AB'+i,en:'match'}:'AB '+i;}}finally{trace.push(['closed']);}}};
    return {slots:{[slot]:catalog},run:h=>h.rootFunction(id)('AB')};
  });
  scenario(id+' row access error closes iterator',trace=>{
    const catalog={*[Symbol.iterator](){try{trace.push(['row']);yield id==='f3496'?{sc:null,en:'bad'}:null;}finally{trace.push(['closed']);}}};
    return {slots:{[slot]:catalog},run:h=>h.rootFunction(id)('AB')};
  });
}
scenario('station getter access order',trace=>{
  const record={get sc(){trace.push(['code']);return 'AB';},get en(){trace.push(['name']);return 'Alphabet';}};
  return {slots:{1705:[record]},run:h=>h.rootFunction('f3496')('AB')};
});
scenario('custom trim contract',trace=>({slots:{1706:['AB train']},run:h=>h.rootFunction('f3497')({trim(){trace.push(['trim']);return {toUpperCase(){trace.push(['upper']);return 'AB';}};}})}));
for(const text of ['[]','{}','null','42','false','"name"','{invalid','']) {
  scenario('read JSON '+JSON.stringify(text),trace=>({
    slots:{18:{readFileSync(file,encoding){trace.push(['read',file,encoding]);return text;}},1704:name=>{trace.push(['path',name]);return 'synthetic/'+name;}},
    run:h=>h.rootFunction('f3495')('catalog.json',{fallback:true}),
  }));
}
for(const failure of ['path','read','read-getter','fs-hole'])scenario('read failure '+failure,trace=>{
  const fs={get readFileSync(){trace.push(['get-read']);if(failure==='read-getter')throw new Error('synthetic accessor');return (file,encoding)=>{trace.push(['read',file,encoding]);if(failure==='read')throw new Error('synthetic read');return '[]';};}};
  return {slots:{18:failure==='fs-hole'?HOLE:fs,1704:name=>{trace.push(['path',name]);if(failure==='path')throw new Error('synthetic path');return 'catalog';}},run:h=>h.rootFunction('f3495')('catalog',{fallback:true})};
});
test('station ranking and original labels are explicit',()=>{
  const catalog=require('../src/main/storage/local-catalog.cjs');
  assert.deepEqual(catalog.suggestStations('ab',()=>stations).map(row=>row.code),['AB','ab','ABC','ABX','Y','XAB','ZZ']);
});
test('read failure returns the same fallback object',()=>{
  const {readCatalog}=require('../src/main/storage/local-catalog.cjs');
  const fallback={};assert.equal(readCatalog('x',fallback,{fs(){throw new Error('synthetic');},path(){throw new Error('unexpected');}}),fallback);
});

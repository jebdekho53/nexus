'use strict';
// Inspect a compiled recovered body without executing it. Decoder annotations
// come only from the committed static fixture; unknown calls remain visible.
const bodies=require('../src/main/compiled/index.cjs');
const definitions=require('../src/main/generated/index.cjs');
const strings=Object.assign({},...Object.values(require('../test/fixtures/payment-strings.json')));
for(const id of process.argv.slice(2)) {
  if(!/^f\d+$/.test(id)||!bodies[id])throw new Error('Unknown compiled function '+id);
  let source=bodies[id].toString();
  if(source.includes('r0=ctx[2]')||/acc=ctx\[5\];[\s\S]{0,180}r0=acc;/.test(source))source=source.replace(/r0\((\d+),("(?:[^"\\]|\\.)*")\)/g,(call,index,key)=>{
    const value=strings[index+'|'+JSON.parse(key)];
    return value===undefined?call:JSON.stringify(value);
  });
  source=source.replace(/rt.call\(ctx\[2\],undefined,\[(\d+),("(?:[^"\\]|\\.)*")\]\)/g,(call,index,key)=>{
    const value=strings[index+'|'+JSON.parse(key)];
    return value===undefined?call:JSON.stringify(value);
  });
  source=source.replace(/K\[(\d+)\]/g,(call,index)=>JSON.stringify(definitions[id].constants[index])??call);
  console.log('// '+id+'\n'+source);
}

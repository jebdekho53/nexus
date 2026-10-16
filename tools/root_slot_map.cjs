'use strict';
// Map bootstrap (f1) root-scope slots to the recovered function closures stored in them.
// Slots hold helpers that other recovered functions read through LdaImmutableContextSlot/readBinding.
// Writes docs/reconstruction-inventory/root-slots.csv: slot,functionId,instructions,reassigned.
const fs=require('node:fs'),path=require('node:path');
const definitions=require('../src/main/generated/index.cjs');
const f1=definitions.f1,code=f1.code;
const slots=new Map();
for(let i=0;i<code.length;i++) {
  const[,op,args]=code[i];
  if(!/^Sta(Current)?ContextSlot|^StaContextSlot/.test(op))continue;
  const slot=op.startsWith('StaCurrent')?args[0]:args[1];
  let closure=null;
  for(let j=i-1;j>=Math.max(0,i-3);j--) {
    if(code[j][1]==='CreateClosure'){const c=f1.constants[code[j][2][0].c];closure=c&&c.id;break;}
    if(/^Star/.test(code[j][1])===false&&code[j][1]!=='Ldar')break;
  }
  const entry=slots.get(slot)??{closures:[],stores:0};
  entry.stores++;if(closure)entry.closures.push(closure);
  slots.set(slot,entry);
}
const rows=[['slot','functionId','instructions','stores']];
for(const[slot,entry]of[...slots.entries()].sort((a,b)=>a[0]-b[0])) {
  const id=entry.closures[entry.closures.length-1];
  if(!id)continue;
  rows.push([slot,id,definitions[id]?.code.length??'',entry.stores]);
}
fs.writeFileSync(path.resolve(__dirname,'../docs/reconstruction-inventory/root-slots.csv'),rows.map(r=>r.join(',')).join('\n')+'\n');
console.log('Wrote '+(rows.length-1)+' root slot entries');

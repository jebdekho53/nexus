'use strict';
// Produce a compact instruction listing without dumping generated constants.
// Static decoder calls are annotated; branches and offsets remain unchanged.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const definitions=require('../src/main/generated/index.cjs');
const strings=Object.assign({},...Object.values(require('../test/fixtures/payment-strings.json')));
// Hints: context-slot reads that match a bootstrap root slot holding a recovered function (see tools/root_slot_map.cjs).
const slotFile=path.join(root,'docs/reconstruction-inventory/root-slots.csv');
const rootSlotFunctions=fs.existsSync(slotFile)?new Map(fs.readFileSync(slotFile,'utf8').trim().split('\n').slice(1).map(line=>{const[slot,id]=line.split(',');return[Number(slot),id];})):new Map();
function rootSlotHints(definition) {
  const hints={};
  for(const[,operation,args]of definition.code) {
    if(!/^Lda(Immutable)?ContextSlot$/.test(operation))continue;
    const slot=args[1],id=rootSlotFunctions.get(slot);
    if(Number.isInteger(slot)&&slot>=6&&id)hints[slot]=id;
  }
  return hints;
}
for(const id of process.argv.slice(2)){
  if(!/^f\d+$/.test(id)||!definitions[id])throw new Error('Unknown recovered function: '+id);
  const definition=definitions[id],lines=[];
  for(const instruction of definition.code){
    const[offset,operation,args]=instruction,tail=lines.slice(-4);
    if(operation==='CallUndefinedReceiver2'&&tail.length===4&&tail[0][1]==='LdaSmi'&&/^Star\d*$/.test(tail[1][1])&&tail[2][1]==='LdaConstant'&&/^Star\d*$/.test(tail[3][1])){
      const key=tail[0][2][0]+'|'+definition.constants[tail[2][2][0].c];
      if(Object.hasOwn(strings,key)){
        lines.splice(-4);lines.push([offset,'Decoded',[strings[key]]]);continue;
      }
    }
    lines.push([offset,operation,args,...instruction.slice(3)]);
  }
  const header={id,handlers:definition.handlers,constants:definition.constants,rootSlots:rootSlotHints(definition)};
  fs.mkdirSync(path.join(root,'diagnostics'),{recursive:true});
  const output=path.join(root,'diagnostics',id+'-review.txt');
  fs.writeFileSync(output,JSON.stringify(header)+'\n'+lines.map(([offset,op,args,target])=>offset+' '+op+' '+JSON.stringify(args)+(target===undefined?'':' -> '+JSON.stringify(target))).join('\n')+'\n');
  process.stdout.write(id+': '+definition.code.length+' instructions → '+path.relative(root,output)+'\n');
}

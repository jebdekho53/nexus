'use strict';
// Usage: node tools/compiler/survey.cjs  — counts how many recovered definitions the compiler can translate.
const definitions=require('../../src/main/generated/index.cjs');
const{compileDefinition,Unsupported}=require('./compile.cjs');
const reasons=new Map();let ok=0,failed=0,instructions=0,total=0;
for(const definition of Object.values(definitions)) {
  total+=definition.code.length;
  try{compileDefinition(definition);ok++;instructions+=definition.code.length;}
  catch(error) {
    failed++;
    const key=error instanceof Unsupported?error.message.replace(/\d+/g,'N'):'ERROR '+error.message.slice(0,80);
    reasons.set(key,(reasons.get(key)??0)+1);
  }
}
console.log({compiled:ok,failed,instructions,total,share:(instructions/total*100).toFixed(1)+'%'});
console.log([...reasons.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,v])=>v+' '+k).join('\n'));

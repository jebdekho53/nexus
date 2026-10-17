'use strict';
// Usage: node tools/compiler/context-survey.cjs
// Evidence for which lexical contexts could become plain local variables. A context array can only be replaced by
// locals when no closure captures it; the compiled runtime instantiates closures by id with the captured context
// (makeFunction(id, ctx)), and native replacements read slots through readBinding(slot), so contexts that closures
// capture must stay arrays.
const definitions=require('../../src/main/generated/index.cjs');
const{compileDefinition}=require('./compile.cjs');
let functionContexts=0,functionContextsCaptured=0,catchContexts=0,blockContexts=0,closureFree=0;
for(const id of Object.keys(definitions)) {
  let source;
  try{source=compileDefinition(definitions[id]);}catch{continue;}
  const total=(source.match(/rt\.context\(/g)||[]).length;
  if(!total)continue;
  const functionLevel=(source.match(/ctx=rt\.context\(\d+,ctx\);/g)||[]).length;
  const caught=(source.match(/acc=rt\.context\(rt\.constant\(K\[\d+\]\)\.length,ctx\);acc\[2\]=/g)||[]).length;
  const blocks=(source.match(/rt\.context\(rt\.constant\(K\[\d+\]\)\.length,ctx\)/g)||[]).length-caught;
  functionContexts+=functionLevel;catchContexts+=caught;blockContexts+=blocks;
  const captures=/makeFunction|DefineClass/.test(source);
  if(functionLevel&&captures)functionContextsCaptured+=functionLevel;
  if(!captures)closureFree++;
}
console.log({functionContexts,functionContextsCaptured,catchContexts,blockContexts,functionsWithContextButNoClosure:closureFree});

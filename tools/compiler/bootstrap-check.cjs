'use strict';
// Runs the real application bootstrap (f0 -> CommonJS wrapper -> f1) in three runtimes against a recording stub
// environment and compares what the bootstrap did: the instruction interpreter, the compiled bundle (split f1 modules)
// and an in-memory unsplit compile of f1. Nothing here touches the network, the filesystem or Electron.
// Usage: node tools/compiler/bootstrap-check.cjs [--show N]
const{createEngine}=require('../../src/main/runtime/engine.cjs');
const{createCompiledRuntime}=require('../../src/main/runtime/compiled-runtime.cjs');
const definitions=require('../../src/main/generated/index.cjs');
const{compileDefinition}=require('./compile.cjs');
const names=require('./names.cjs').loadNames();

function createStubs(log) {
  let counter=0;
  const describe=value=>typeof value==='function'?'fn':typeof value==='string'?'s:'+value.slice(0,60):value&&typeof value==='object'?(value.__stub?'stub#'+value.__stub:'obj'):String(value);
  function stub(label) {
    const id=++counter;
    const children=new Map();
    const target=function(){};
    const proxy=new Proxy(target,{
      get(_t,key) {
        if(key==='__stub')return id;
        if(key===Symbol.toPrimitive)return()=>'stub#'+id;
        if(typeof key==='symbol')return key===Symbol.iterator?function*(){}:undefined;
        log.push('get '+label+'.'+key);
        if(!children.has(key))children.set(key,stub(label+'.'+key));
        return children.get(key);
      },
      set(_t,key,value){log.push('set '+label+'.'+String(key)+'='+describe(value));return true;},
      has(){return true;},
      apply(_t,that,args){log.push('call '+label+'('+args.map(describe).join(',')+')');return stub(label+'()');},
      construct(_t,args){log.push('new '+label+'('+args.map(describe).join(',')+')');return stub('new '+label);},
    });
    return proxy;
  }
  return{stub};
}

function runBootstrap(makeRuntime) {
  const log=[];
  const{stub}=createStubs(log);
  const runtime=makeRuntime();
  let error=null;
  try {
    const wrapper=runtime.makeFunction('f0')();
    const exports={};
    const moduleObject={exports,filename:'main.js',id:'main.js',paths:[]};
    const required=new Map();
    const require=request=>{log.push('require '+request);if(!required.has(request))required.set(request,stub('module('+request+')'));return required.get(request);};
    wrapper.call(exports,exports,require,moduleObject,'main.js','.');
    log.push('exports '+Object.keys(moduleObject.exports).join(','));
  } catch(caught) {
    error=caught instanceof Error?caught.name+': '+String(caught.message).replace(/\s+/g,' ').slice(0,100):String(caught);
  }
  return{log,error};
}

function main() {
  const interpreter=runBootstrap(()=>createEngine(definitions,{}));
  const compiled=runBootstrap(()=>createCompiledRuntime({}));
  const bundle=require('../../src/main/compiled/index.cjs');
  const unsplitSource=compileDefinition(definitions.f1,{names});
  const exportsObject={};
  new Function('exports','"use strict";'+unsplitSource)(exportsObject);
  const unsplit=runBootstrap(()=>createCompiledRuntime({compiledBodies:{...bundle,f1:exportsObject.f1}}));
  const same=(a,b)=>a.error===b.error&&a.log.length===b.log.length&&a.log.every((line,index)=>line===b.log[index]);
  const report={interpreterLog:interpreter.log.length,compiledLog:compiled.log.length,unsplitLog:unsplit.log.length,
    interpreterError:interpreter.error,compiledError:compiled.error,unsplitError:unsplit.error,
    compiledMatchesInterpreter:same(interpreter,compiled),unsplitMatchesInterpreter:same(interpreter,unsplit)};
  console.log(JSON.stringify(report,null,1));
  const show=Number(process.argv[process.argv.indexOf('--show')+1])||0;
  if(show)console.log(interpreter.log.slice(0,show).join('\n'));
  if(!report.compiledMatchesInterpreter||!report.unsplitMatchesInterpreter)process.exitCode=1;
}
main();

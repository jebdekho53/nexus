'use strict';
// Runs the real application bootstrap (f0 -> CommonJS wrapper -> f1) in three runtimes against a recording stub
// environment and compares what the bootstrap did and what it built: the instruction interpreter, the compiled bundle
// (split f1 modules) and an in-memory unsplit compile of f1. Classes defined by the bootstrap (DefineClass, base and
// derived constructors, class field initialisers) are compared by shape and by constructing instances.
// Nothing here touches the network, the filesystem or Electron.
// Usage: node tools/compiler/bootstrap-check.cjs [--instances]
const{seedRandom,summarise,runtimeFactories,runBootstrap,normaliseText,META}=require('./check-support.cjs');

const CLASS_KIND=/Constructor/;

function describeDescriptors(target) {
  return Reflect.ownKeys(target).filter(key=>key!==META).sort((a,b)=>String(a).localeCompare(String(b))).map(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(target,key);
    const kind=descriptor.get||descriptor.set?'accessor:'+!!descriptor.get+!!descriptor.set:'value:'+summarise(descriptor.value);
    return String(key)+'['+['writable','enumerable','configurable'].map(flag=>descriptor[flag]?flag[0]:'-').join('')+']='+kind;
  });
}

function classesOf(run) {
  const list=[];
  if(!run.root)return list;
  for(let slot=2;slot<run.root.length;slot++) {
    const value=run.root[slot];
    if(typeof value==='function'&&value[META]&&CLASS_KIND.test(value[META].kind))list.push(value);
  }
  return list;
}

function inspectClasses(run) {
  return classesOf(run).map(value=>value[META].id+':'+value[META].kind+':'+value.name+'/'+value.length+' proto='+describeDescriptors(value.prototype||{}).join(';')+' static='+describeDescriptors(value).join(';')+' parent='+(Object.getPrototypeOf(value)?.[META]?.id??'-'));
}

function constructInstances(run) {
  seedRandom(777);
  const results=[];
  for(const value of classesOf(run)) {
    for(const[label,args]of[['none',[]],['mixed',['a',1,true,{k:1},()=>0,'f',run.stub('arg')]]]) {
      const before=run.log.length;
      let outcome;
      try {
        const instance=Reflect.construct(value,args);
        outcome='ok:'+summarise(instance)+' instanceof='+(instance instanceof value);
      } catch(error) {outcome='throw:'+(error instanceof Error?error.name+':'+String(error.message).replace(/\s+/g,' ').slice(0,60):summarise(error));}
      results.push(value[META].id+'/'+label+' '+outcome+' effects='+run.log.slice(before).join('|'));
    }
  }
  return results;
}

const equal=(a,b)=>a.length===b.length&&a.every((line,index)=>normaliseText(line)===normaliseText(b[index]));
function firstDifference(label,a,b) {
  const index=a.findIndex((line,at)=>normaliseText(line)!==normaliseText(b[at]??''));
  if(index>=0)console.error(label+' differs at '+index+':\n  interpreter: '+a[index]+'\n  other:       '+(b[index]??'(missing)'));
}

function main() {
  const factories=runtimeFactories();
  const runs={};
  for(const[name,factory]of Object.entries(factories))runs[name]=runBootstrap(factory);
  const shapes={},instances={};
  for(const name of Object.keys(runs)){shapes[name]=inspectClasses(runs[name]);instances[name]=constructInstances(runs[name]);}
  const report={
    bootstrapLog:runs.interpreter.log.length,
    errors:Object.fromEntries(Object.entries(runs).map(([name,run])=>[name,run.error])),
    compiledMatchesInterpreter:false,unsplitMatchesInterpreter:false,
    classes:shapes.interpreter.length,instances:instances.interpreter.length,
    constructedIds:[...new Set(instances.interpreter.map(line=>line.split('/')[0]))],
  };
  const logsMatch=name=>equal(runs.interpreter.log,runs[name].log)&&runs.interpreter.error===runs[name].error;
  report.compiledMatchesInterpreter=logsMatch('compiled');
  report.unsplitMatchesInterpreter=logsMatch('unsplit');
  report.classShapesMatch=equal(shapes.interpreter,shapes.compiled)&&equal(shapes.interpreter,shapes.unsplit);
  report.instancesMatch=equal(instances.interpreter,instances.compiled)&&equal(instances.interpreter,instances.unsplit);
  console.log(JSON.stringify(report,null,1));
  firstDifference('bootstrap log',runs.interpreter.log,runs.compiled.log);
  firstDifference('class shape',shapes.interpreter,shapes.compiled);
  firstDifference('instance',instances.interpreter,instances.compiled);
  firstDifference('instance (unsplit)',instances.interpreter,instances.unsplit);
  if(process.argv.includes('--instances'))console.log(instances.interpreter.join('\n'));
  if(!(report.compiledMatchesInterpreter&&report.unsplitMatchesInterpreter&&report.classShapesMatch&&report.instancesMatch))process.exitCode=1;
}
main();

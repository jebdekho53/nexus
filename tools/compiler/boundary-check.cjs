'use strict';
// Boundary equivalence check. The application bootstrap runs in the instruction interpreter, the compiled bundle (split
// f1 modules) and an unsplit compile, against a recording stub environment that stands in for Electron, Node modules
// and the network. Every callback the application hands to that environment (IPC handlers, Electron and window events,
// session/cookie and web-request hooks, timer continuations, backend response handlers) is then invoked with synthetic
// arguments; the outcome and everything the code did to the environment must be identical in all runtimes.
// Time is virtual (provider waits are kept, they just cost nothing) and the code sees sandboxed globals: no network,
// no process exit, Node modules are stubs. No stored credentials and no live service are involved.
//
// Each runtime runs in a supervised child process: a callback that stalls or exhausts memory under stub inputs is
// killed, recorded as "aborted" and the run resumes after it, so a hang in only one runtime shows up as a difference.
// Usage: node tools/compiler/boundary-check.cjs [--list] [--max N] [--stall SECONDS]
const{spawn}=require('node:child_process');
const{seedRandom,summarise,runtimeFactories,runBootstrap,normaliseText}=require('./check-support.cjs');

process.on('unhandledRejection',()=>{});
const argument=(name,fallback)=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:fallback;};
const maxCallbacks=Number(argument('--max',400));

async function settleValue(run,value) {
  if(!value||typeof value.then!=='function')return{state:'ok',text:summarise(value)};
  let state='pending',result;
  Promise.resolve(value).then(resolved=>{state='ok';result=resolved;},rejected=>{state='rejected';result=rejected;});
  await run.clock.flush(60_000,500);
  if(state==='pending')return{state:'pending',text:''};
  return{state,text:summarise(result instanceof Error?result.name+':'+result.message:result)};
}

// ---- child: bootstrap one runtime, then invoke callbacks[start..] one by one, reporting each on stdout ---------------
async function child(name,start) {
  const run=runBootstrap(runtimeFactories()[name],{sandbox:true});
  await run.clock.flush(120_000,500);
  const emit=entry=>process.stdout.write('ENTRY '+JSON.stringify(entry)+'\n');
  if(start===0)emit({id:'bootstrap',outcome:run.error??'ok',effects:''});
  const argSets=[[run.stub('event')],[run.stub('event'),{id:1,value:'x',list:[1,2]},'text',3]];
  for(let index=start;index<run.callbacks.length&&index<maxCallbacks;index++) {
    const callback=run.callbacks[index];
    const key=index+':'+callback.label.replace('module(electron).','')+'#'+callback.index+'#'+callback.first;
    for(const[variant,args]of argSets.entries()) {
      seedRandom(1000+index);
      process.stdout.write('BEGIN '+key+'/'+variant+'\n');
      const before=run.log.length;
      let outcome;
      try {
        const value=Reflect.apply(callback.fn,undefined,args);
        const settled=await settleValue(run,value);
        outcome=settled.state+':'+settled.text;
      } catch(error) {outcome='throw:'+(error instanceof Error?error.name+':'+String(error.message).replace(/\s+/g,' ').slice(0,80):summarise(error));}
      await run.clock.flush(30_000,200);
      emit({id:key+'/'+variant,outcome,effects:run.log.slice(before).join('|'),callbackIndex:index});
    }
  }
  process.stdout.write('DONE '+run.callbacks.length+'\n');
}

// ---- parent: supervise the children --------------------------------------------------------------------------------
function superviseRuntime(name,stallSeconds) {
  return new Promise(resolve=>{
    const entries=[];
    let total=0;
    const launch=start=>{
      const proc=spawn(process.execPath,['--max-old-space-size=1536',__filename,'--child',name,'--start',String(start),'--max',String(maxCallbacks)],{stdio:['ignore','pipe','inherit']});
      let buffer='',current=null,timer=null,finished=false;
      const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>proc.kill('SIGKILL'),stallSeconds*1000);};
      arm();
      proc.stdout.on('data',chunk=>{
        buffer+=chunk;arm();
        let at;
        while((at=buffer.indexOf('\n'))>=0) {
          const line=buffer.slice(0,at);buffer=buffer.slice(at+1);
          if(line.startsWith('BEGIN '))current=line.slice(6);
          else if(line.startsWith('ENTRY ')){const entry=JSON.parse(line.slice(6));entries.push(entry);current=null;}
          else if(line.startsWith('DONE ')){finished=true;total=Number(line.slice(5));}
        }
      });
      proc.on('close',()=>{
        clearTimeout(timer);
        if(finished)return resolve({entries,total});
        // aborted callback: record it and resume after it
        const last=entries.filter(entry=>entry.callbackIndex!==undefined).at(-1);
        let next;
        if(current){
          const index=Number(current.split(':')[0]);
          entries.push({id:current,outcome:'aborted',effects:'',callbackIndex:index});
          next=index+1;
        } else next=(last?.callbackIndex??start)+1;
        if(next>=maxCallbacks||next<=start&&!current)return resolve({entries,total:next});
        launch(next);
      });
    };
    launch(0);
  });
}

function compare(reference,other) {
  const problems=[];
  const count=Math.max(reference.entries.length,other.entries.length);
  for(let index=0;index<count;index++) {
    const a=reference.entries[index],b=other.entries[index];
    if(!a||!b||a.id!==b.id||normaliseText(a.outcome)!==normaliseText(b.outcome)||normaliseText(a.effects)!==normaliseText(b.effects)) {
      problems.push({index,reference:a,other:b});
      if(problems.length>=3)break;
    }
  }
  return problems;
}

async function main() {
  const stall=Number(argument('--stall',45));
  const names=argument('--runtimes','interpreter,compiled,unsplit').split(',');
  const results={};
  const directory=argument('--compare');
  // --compare DIR reuses results saved earlier with --runtimes <one> --save DIR/<runtime>.json
  for(const name of names)results[name]=directory?JSON.parse(require('node:fs').readFileSync(require('node:path').join(directory,name+'.json'),'utf8')):await superviseRuntime(name,stall); // one at a time: each child can use 1.5 GB
  if(names.length===1){
    console.log(JSON.stringify({runtime:names[0],invocations:results[names[0]].entries.length,callbacks:results[names[0]].total,
      aborted:results[names[0]].entries.filter(entry=>entry.outcome==='aborted').map(entry=>entry.id)},null,1));
    if(argument('--save'))require('node:fs').writeFileSync(argument('--save'),JSON.stringify(results[names[0]]));
    return;
  }
  const report={callbacksRegistered:results.interpreter.total,invocations:results.interpreter.entries.length,
    aborted:results.interpreter.entries.filter(entry=>entry.outcome==='aborted').map(entry=>entry.id),
    abortedCompiled:results.compiled.entries.filter(entry=>entry.outcome==='aborted').map(entry=>entry.id)};
  for(const name of['compiled','unsplit']) {
    const problems=compare(results.interpreter,results[name]);
    report[name+'MatchesInterpreter']=problems.length===0;
    for(const problem of problems)console.error(name+' differs at '+problem.index+':\n  interpreter: '+JSON.stringify(problem.reference)?.slice(0,900)+'\n  '+name+': '+JSON.stringify(problem.other)?.slice(0,900));
  }
  const groups={};
  for(const entry of results.interpreter.entries){const group=entry.id.split(':')[1]?.split('#')[0]??entry.id;groups[group]=(groups[group]??0)+1;}
  report.groups=groups;
  report.invocationsWithEffects=results.interpreter.entries.filter(entry=>entry.effects).length;
  console.log(JSON.stringify(report,null,1));
  if(process.argv.includes('--list'))console.log(results.interpreter.entries.map(entry=>entry.id+' => '+entry.outcome.slice(0,80)).join('\n'));
  if(!(report.compiledMatchesInterpreter&&report.unsplitMatchesInterpreter))process.exitCode=1;
}

if(process.argv.includes('--child'))child(argument('--child'),Number(argument('--start',0))).catch(error=>{console.error(error);process.exitCode=1;});
else main();

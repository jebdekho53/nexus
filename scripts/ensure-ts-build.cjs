'use strict';
// Check each required main/renderer output before startup or packaging. A newer
// unrelated file must not hide a missing/stale module. Packaged installs retain
// their shipped output when complete but no compiler is installed.
// Usable as a module (scripts/run.cjs, tools) or as a script: `node scripts/ensure-ts-build.cjs`
// (start.cmd runs it with the bundled Electron as Node: ELECTRON_RUN_AS_NODE=1).
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

function sourceFiles(directory) {
  if(!fs.existsSync(directory))return [];
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const file=path.join(directory,entry.name);
    return entry.isDirectory()?sourceFiles(file):entry.name.endsWith('.ts')?[file]:[];
  });
}
function inspect(plan) {
  const files=sourceFiles(plan.source);
  const declarations=files.filter(file=>file.endsWith('.d.ts'));
  const dependencyTime=Math.max(0,...declarations.map(file=>fs.statSync(file).mtimeMs),
    fs.existsSync(plan.config)?fs.statSync(plan.config).mtimeMs:0);
  const missing=[],stale=[];
  for(const source of files.filter(file=>!file.endsWith('.d.ts'))) {
    const output=path.join(plan.output,path.relative(plan.source,source).replace(/\.ts$/,'.js'));
    if(!fs.existsSync(output))missing.push(output);
    else if(fs.statSync(output).mtimeMs<Math.max(dependencyTime,fs.statSync(source).mtimeMs))stale.push(output);
  }
  return {files,missing,stale};
}

function ensureTypeScriptBuild(root=path.dirname(__dirname)) {
  const plans=[
    {source:path.join(root,'src','ts','main'),output:path.join(root,'build','ts','main'),config:path.join(root,'tsconfig.json'),command:'build:ts'},
    {source:path.join(root,'src','ts','renderer'),output:path.join(root,'src','renderer'),config:path.join(root,'tsconfig.renderer.json'),command:'build:renderer'},
  ];
  const tsc=path.join(root,'node_modules','typescript','bin','tsc');
  let hasSources=false,builtAny=false,staleWithoutCompiler=false;
  for(const plan of plans) {
    const state=inspect(plan);
    if(!state.files.length)continue;
    hasSources=true;
    if(!state.missing.length&&!state.stale.length)continue;
    if(!fs.existsSync(tsc)) {
      if(state.missing.length)throw new Error('Compiled TypeScript output is missing ('+path.relative(root,state.missing[0])+'). Run `npm ci` and `npm run '+plan.command+'` from the full source checkout.');
      staleWithoutCompiler=true;continue;
    }
    if(!fs.existsSync(plan.config))throw new Error(path.basename(plan.config)+' is missing. Restore the full source checkout before rebuilding TypeScript.');
    const built=spawnSync(process.execPath,[tsc,'-p',plan.config],{cwd:root,stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
    if(built.error)throw new Error('Unable to start TypeScript compiler: '+built.error.message);
    if(built.status!==0)throw new Error('TypeScript build failed (exit '+built.status+'). Run `npm run '+plan.command+'` to inspect the errors.');
    const after=inspect(plan);
    if(after.missing.length)throw new Error('TypeScript compiler did not produce '+path.relative(root,after.missing[0])+'. Check '+path.basename(plan.config)+'.');
    if(after.stale.length)throw new Error('TypeScript output is still stale ('+path.relative(root,after.stale[0])+'). Check '+path.basename(plan.config)+' and source timestamps.');
    builtAny=true;
  }
  return !hasSources?'no-sources':builtAny?'built':staleWithoutCompiler?'stale-no-compiler':'current';
}

module.exports={ensureTypeScriptBuild};
if(require.main===module) {
  try{console.log('typescript build:',ensureTypeScriptBuild());}
  catch(error){console.error(error.message);process.exit(1);}
}

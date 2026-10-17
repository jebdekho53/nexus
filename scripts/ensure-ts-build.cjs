'use strict';
// Makes sure the compiled TypeScript output (build/ts, from src/ts) exists and is current before Matrix starts or is packaged.
//   * output current, or sources absent               -> nothing to do
//   * output missing/stale and TypeScript installed   -> build it (`tsc -p tsconfig.json`)
//   * output present but stale and no TypeScript      -> keep using it (a packaged install has no compiler)
//   * output missing and no TypeScript                -> actionable error
// Usable as a module (scripts/run.cjs, tools) or as a script: `node scripts/ensure-ts-build.cjs`
// (start.cmd runs it with the bundled Electron as Node: ELECTRON_RUN_AS_NODE=1).
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const newestMtime=dir=>{
  let newest=0;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    newest=Math.max(newest,entry.isDirectory()?newestMtime(full):fs.statSync(full).mtimeMs);
  }
  return newest;
};

function ensureTypeScriptBuild(root=path.dirname(__dirname)) {
  const sources=path.join(root,'src','ts'),output=path.join(root,'build','ts'),config=path.join(root,'tsconfig.json');
  if(!fs.existsSync(sources))return 'no-sources';
  const hasOutput=fs.existsSync(output);
  const stale=!hasOutput||newestMtime(output)<Math.max(newestMtime(sources),fs.existsSync(config)?fs.statSync(config).mtimeMs:0);
  if(!stale)return 'current';
  const tsc=path.join(root,'node_modules','typescript','bin','tsc');
  if(!fs.existsSync(tsc)) {
    if(hasOutput)return 'stale-no-compiler';
    throw new Error('Compiled TypeScript output (build/ts) is missing and TypeScript is not installed. Run `npm install` and then `npm run build:ts`.');
  }
  const built=spawnSync(process.execPath,[tsc,'-p',config],{cwd:root,stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
  if(built.status!==0)throw new Error('TypeScript build failed (exit '+built.status+'). Fix the errors above or run `npm run check:ts`.');
  return 'built';
}

module.exports={ensureTypeScriptBuild};
if(require.main===module) {
  try{console.log('typescript build:',ensureTypeScriptBuild());}
  catch(error){console.error(error.message);process.exit(1);}
}

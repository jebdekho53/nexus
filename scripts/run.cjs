'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const root=path.dirname(__dirname);

// Migrated TypeScript modules (src/ts) run from build/ts. Build when the output is missing or older than a source file.
function newestMtime(dir) {
  let newest=0;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    newest=Math.max(newest,entry.isDirectory()?newestMtime(full):fs.statSync(full).mtimeMs);
  }
  return newest;
}
function ensureTypeScriptBuild() {
  const sources=path.join(root,'src','ts'),output=path.join(root,'build','ts');
  if(!fs.existsSync(sources))return;
  const stamp=fs.existsSync(output)?newestMtime(output):0;
  if(stamp>=Math.max(newestMtime(sources),fs.statSync(path.join(root,'tsconfig.json')).mtimeMs))return;
  const tsc=path.join(root,'node_modules','typescript','bin','tsc');
  if(!fs.existsSync(tsc))throw new Error('Compiled TypeScript output (build/ts) is missing or stale and TypeScript is not installed. Run `npm install` and `npm run build:ts`.');
  const built=require('node:child_process').spawnSync(process.execPath,[tsc,'-p',path.join(root,'tsconfig.json')],{stdio:'inherit'});
  if(built.status!==0)throw new Error('TypeScript build failed (exit '+built.status+'). Fix the errors above or run `npm run check:ts`.');
}
ensureTypeScriptBuild();
const candidates=[process.env.ELECTRON_BINARY,path.join(root,'.runtime','electron.exe'),path.join(os.homedir(),'.cache','ts-v8-recovery','electron-43.6.0-ia32','electron.exe')].filter(Boolean);
const binary=candidates.find(file=>fs.existsSync(file));
if(!binary)throw new Error('Set ELECTRON_BINARY to Electron 43.6.0 ia32 electron.exe. See README.md.');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const args=process.argv.slice(2);
if(!args.includes('--release')&&!args.includes('--original-checks')&&!args.includes('--development'))args.unshift('--development');
const child=spawn(binary,[root,...args],{stdio:'inherit',windowsHide:process.argv.includes('--smoke-test'),env});
child.on('exit',code=>process.exit(code ?? 1));

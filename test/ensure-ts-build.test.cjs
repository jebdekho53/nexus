'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ensureTypeScriptBuild}=require('../scripts/ensure-ts-build.cjs');

function fixture(t,{compiler=true,renderer=true}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-ts-build-check-'));
  t.after(()=>{
    const resolved=path.resolve(root);
    if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('matrix-ts-build-check-'))throw Error('Unsafe fixture cleanup target');
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  const baseline=Date.now()-100000;
  const write=(relative,content='',offset=0)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);fs.utimesSync(file,new Date(baseline+offset),new Date(baseline+offset));return file;};
  write('tsconfig.json','{}');write('src/ts/main/a.ts','source');write('src/ts/main/b.ts','source');
  write('build/ts/main/a.js','built',10000);write('build/ts/main/b.js','built',10000);
  if(renderer){write('tsconfig.renderer.json','{}');write('src/ts/renderer/ui.ts','source');write('src/renderer/ui.js','built',10000);}
  if(compiler)write('node_modules/typescript/bin/tsc',`
    const fs=require('node:fs'),path=require('node:path');
    const config=process.argv[process.argv.indexOf('-p')+1];
    fs.appendFileSync('compiler-runs.txt',path.basename(config)+'\\n');
    const renderer=path.basename(config)==='tsconfig.renderer.json';
    const source=path.resolve(renderer?'src/ts/renderer':'src/ts/main'),output=path.resolve(renderer?'src/renderer':'build/ts/main');
    for(const file of fs.readdirSync(source,{recursive:true})) {
      if(!file.endsWith('.ts')||file.endsWith('.d.ts'))continue;
      const target=path.join(output,file.replace(/\\.ts$/,'.js'));
      fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'compiled');
    }
  `);
  return {root,write,runs:()=>fs.existsSync(path.join(root,'compiler-runs.txt'))?fs.readFileSync(path.join(root,'compiler-runs.txt'),'utf8').trim().split('\n'):[]};
}

test('complete current main and renderer outputs do not invoke the compiler',t=>{
  const f=fixture(t);assert.equal(ensureTypeScriptBuild(f.root),'current');assert.deepEqual(f.runs(),[]);
});
test('one stale module is not hidden by a newer unrelated compiled module',t=>{
  const f=fixture(t);f.write('src/ts/main/a.ts','changed',20000);f.write('build/ts/main/b.js','newer',30000);
  assert.equal(ensureTypeScriptBuild(f.root),'built');assert.deepEqual(f.runs(),['tsconfig.json']);
  assert.equal(fs.readFileSync(path.join(f.root,'build/ts/main/a.js'),'utf8'),'compiled');
});
test('one missing module is rebuilt even when the output directory exists',t=>{
  const f=fixture(t);fs.unlinkSync(path.join(f.root,'build/ts/main/a.js'));
  assert.equal(ensureTypeScriptBuild(f.root),'built');assert.ok(fs.existsSync(path.join(f.root,'build/ts/main/a.js')));
});
test('renderer changes use the browser config rather than the main config',t=>{
  const f=fixture(t);f.write('src/ts/renderer/ui.ts','changed',20000);
  assert.equal(ensureTypeScriptBuild(f.root),'built');assert.deepEqual(f.runs(),['tsconfig.renderer.json']);
});
test('both configs build when both groups need output',t=>{
  const f=fixture(t);f.write('src/ts/main/a.ts','changed',20000);f.write('src/ts/renderer/ui.ts','changed',20000);
  assert.equal(ensureTypeScriptBuild(f.root),'built');assert.deepEqual(f.runs(),['tsconfig.json','tsconfig.renderer.json']);
});
test('renderer declaration changes invalidate the renderer output',t=>{
  const f=fixture(t);f.write('src/ts/renderer/globals.d.ts','declare const example: number;',20000);
  assert.equal(ensureTypeScriptBuild(f.root),'built');assert.deepEqual(f.runs(),['tsconfig.renderer.json']);
});
test('config changes invalidate each required output',t=>{
  const f=fixture(t);f.write('tsconfig.json','{}',20000);
  assert.equal(ensureTypeScriptBuild(f.root),'built');assert.deepEqual(f.runs(),['tsconfig.json']);
});
test('packaged install needs no compiler when outputs are complete',t=>{
  const f=fixture(t,{compiler:false});assert.equal(ensureTypeScriptBuild(f.root),'current');
});
test('packaged timestamp differences retain complete shipped output',t=>{
  const f=fixture(t,{compiler:false});f.write('src/ts/main/a.ts','source',20000);
  assert.equal(ensureTypeScriptBuild(f.root),'stale-no-compiler');
});
test('partial packaged main output fails clearly instead of silently starting',t=>{
  const f=fixture(t,{compiler:false});fs.unlinkSync(path.join(f.root,'build/ts/main/a.js'));
  assert.throws(()=>ensureTypeScriptBuild(f.root),/a\.js.*npm ci.*build:ts/);
});
test('missing packaged renderer output also fails clearly',t=>{
  const f=fixture(t,{compiler:false});fs.unlinkSync(path.join(f.root,'src/renderer/ui.js'));
  assert.throws(()=>ensureTypeScriptBuild(f.root),/ui\.js.*build:renderer/);
});
test('packaged configs may be absent when shipped output is complete',t=>{
  const f=fixture(t,{compiler:false});fs.unlinkSync(path.join(f.root,'tsconfig.json'));fs.unlinkSync(path.join(f.root,'tsconfig.renderer.json'));
  assert.equal(ensureTypeScriptBuild(f.root),'current');
});
test('a needed rebuild with a missing config gives an actionable error',t=>{
  const f=fixture(t);fs.unlinkSync(path.join(f.root,'tsconfig.json'));fs.unlinkSync(path.join(f.root,'build/ts/main/a.js'));
  assert.throws(()=>ensureTypeScriptBuild(f.root),/tsconfig\.json is missing/);
});
test('a failed compiler is reported without claiming a successful build',t=>{
  const f=fixture(t);f.write('src/ts/main/a.ts','changed',20000);f.write('node_modules/typescript/bin/tsc','process.exit(7)');
  assert.throws(()=>ensureTypeScriptBuild(f.root),/build failed \(exit 7\)/);
});
test('a compiler that emits no required output is rejected',t=>{
  const f=fixture(t);fs.unlinkSync(path.join(f.root,'build/ts/main/a.js'));f.write('node_modules/typescript/bin/tsc','process.exit(0)');
  assert.throws(()=>ensureTypeScriptBuild(f.root),/did not produce.*a\.js/);
});
test('a no-emit compiler cannot claim to repair existing stale output',t=>{
  const f=fixture(t);f.write('src/ts/main/a.ts','changed',20000);f.write('node_modules/typescript/bin/tsc','process.exit(0)');
  assert.throws(()=>ensureTypeScriptBuild(f.root),/output is still stale.*a\.js/);
});
test('renderer-free projects still build main output',t=>{
  const f=fixture(t,{renderer:false});f.write('src/ts/main/a.ts','changed',20000);
  assert.equal(ensureTypeScriptBuild(f.root),'built');assert.deepEqual(f.runs(),['tsconfig.json']);
});
test('no TypeScript sources requires no runtime build',t=>{
  const f=fixture(t,{renderer:false});fs.unlinkSync(path.join(f.root,'src/ts/main/a.ts'));fs.unlinkSync(path.join(f.root,'src/ts/main/b.ts'));
  assert.equal(ensureTypeScriptBuild(f.root),'no-sources');
});

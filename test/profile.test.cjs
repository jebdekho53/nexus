const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {releaseProfile}=require('../src/main/runtime/profile.cjs');
test('release storage survives replacement of application files and never overwrites newer data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-profile-')),root=path.join(dir,'installed'),appData=path.join(dir,'appData');
 try{const legacy=path.join(root,'diagnostics','release-profile');fs.mkdirSync(legacy,{recursive:true});fs.writeFileSync(path.join(legacy,'forms.vault'),'existing encrypted forms');const app={getPath:name=>{assert.equal(name,'appData');return appData;}};const profile=releaseProfile(app,root);assert(!profile.startsWith(root));assert.equal(fs.readFileSync(path.join(profile,'forms.vault'),'utf8'),'existing encrypted forms');fs.writeFileSync(path.join(profile,'forms.vault'),'newer encrypted forms');fs.rmSync(root,{recursive:true});assert.equal(releaseProfile(app,root),profile);assert.equal(fs.readFileSync(path.join(profile,'forms.vault'),'utf8'),'newer encrypted forms');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

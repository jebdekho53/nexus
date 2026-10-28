const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLicensing}=require('./licensing.cjs');
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'matrix-license-test-'));
test('device limits, replay activation, persistence, token tampering, and revocation',()=>{
 const data=directory(),service=createLicensing({directory:data,adminPassword:'test-only-password'});
 assert.throws(()=>service.login('incorrect'),/Invalid/);
 const session=service.login('test-only-password');assert(service.authenticated(session));
 const issued=service.issue({customer:'TEST',days:1,maxDevices:1});
 const activated=service.activate(issued.key,'device-A');assert(service.sessionLicense(activated.token));
 service.activate(issued.key,'device-A');assert.throws(()=>service.activate(issued.key,'device-B'),/limit/);
 assert.equal(service.sessionLicense(activated.token+'x'),null);
 assert(!fs.readFileSync(path.join(data,'registry.json'),'utf8').includes(issued.key));
 const restarted=createLicensing({directory:data});assert(restarted.sessionLicense(activated.token));assert.equal(restarted.authenticated(session),false);
 restarted.revoke(issued.license.id);assert.equal(restarted.sessionLicense(activated.token),null);assert.throws(()=>restarted.activate(issued.key,'device-A'),/revoked/);
});
test('expired keys reject activation and existing sessions',()=>{
 const service=createLicensing({directory:directory(),adminPassword:'test-only-password'});
 const issued=service.issue({customer:'TEST',days:1,maxDevices:1}),activated=service.activate(issued.key,'device-A');
 const now=Date.now;try{const future=now()+2*86400000;Date.now=()=>future;assert.throws(()=>service.activate(issued.key,'device-A'),/expired/);assert.equal(service.sessionLicense(activated.token),null);assert.equal(service.list()[0].status,'EXPIRED');}finally{Date.now=now;}
});
test('license input rejects invalid duration and device count',()=>{
 const service=createLicensing({directory:directory(),adminPassword:'test-only-password'});
 assert.throws(()=>service.issue({customer:'TEST',days:0}),/Validity/);assert.throws(()=>service.issue({customer:'TEST',maxDevices:11}),/Device/);assert.throws(()=>service.activate('NOT-A-KEY','device-A'),/not found/);
});
test('admin-issued first key can be personalized without extending validity or device allowance',()=>{
 const service=createLicensing({directory:directory(),adminPassword:'test-only-password'});
 const issued=service.issue({customer:'PERSONAL TEST',days:12,maxDevices:2,preferredKey:'AdminTest!42'});
 assert.throws(()=>service.changeKey({currentKey:issued.key,newKey:'member1'},''),/administrator-issued/);
 const first=service.activate(issued.key,'device-A'),second=service.activate(issued.key,'device-B');
 assert.throws(()=>service.changeKey({currentKey:'incorrect',newKey:'member1'},first.token),/not found/);
 assert.throws(()=>service.changeKey({currentKey:issued.key,newKey:'short'},first.token),/6–64/);
 const changed=service.changeKey({currentKey:issued.key,newKey:'member1'},first.token);
 assert.equal(changed.license.expiresAt,issued.license.expiresAt);assert.equal(changed.license.maxDevices,2);assert.equal(changed.license.devicesUsed,2);
 assert.equal(service.sessionLicense(first.token),null);assert.equal(service.sessionLicense(second.token),null);assert(service.sessionLicense(changed.token));
 assert.throws(()=>service.activate(issued.key,'device-A'),/not found/);assert.throws(()=>service.activate('MEMBER1','device-A'),/not found/);
 assert.throws(()=>service.activate('member1','device-C'),/limit/);assert(service.activate('member1','device-B').token);
 assert.equal(service.list().length,1);
});

test('blocked device is denied across keys and signed sessions, unblock restores access',()=>{
 const dir=directory(),service=createLicensing({directory:dir,adminPassword:'test-only-password'}),first=service.issue({customer:'A',days:2,maxDevices:2}),second=service.issue({customer:'B',days:2,maxDevices:2}),active=service.activate(first.key,'device-A');
 const file=require('node:path').join(dir,'registry.json'),db=JSON.parse(fs.readFileSync(file));db.blockedDevices=[{device:'device-A',at:new Date().toISOString()}];fs.writeFileSync(file,JSON.stringify(db));
 const blocked=createLicensing({directory:dir,adminPassword:'test-only-password'});assert.throws(()=>blocked.activate(first.key,'device-A'),/blocked/);assert.throws(()=>blocked.activate(second.key,'device-A'),/blocked/);assert.equal(blocked.sessionLicense(active.token),null);assert.ok(blocked.activate(first.key,'device-B'));
 const updated=JSON.parse(fs.readFileSync(file));updated.blockedDevices=[];fs.writeFileSync(file,JSON.stringify(updated));assert.ok(createLicensing({directory:dir,adminPassword:'test-only-password'}).activate(first.key,'device-A'));
});

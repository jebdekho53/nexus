'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {createLicensing}=require('./licensing.cjs');
test('custom validity extends active/expired keys, persists ledger, rejects invalid days and unauthorized sellers',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-validity-'));
 const service=createLicensing({directory,adminPassword:'synthetic-admin'});
 const active=service.issue({customer:'Active',days:20}),expired=service.issue({customer:'Expired',days:1}),unpaid=service.issue({customer:'Unpaid',paid:false});
 const server=http.createServer((req,res)=>service.handle(req,res,new URL(req.url,'http://localhost')));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const request=async(route,body,cookie)=>{const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
  const admin=(await request('admin/login',{password:'synthetic-admin'})).cookie;
  assert.equal((await request('admin/manage',{id:active.license.id,action:'add-validity',days:7})).status,401);
  for(const days of [0,-1,1.5,3651,'abc'])assert.equal((await request('admin/manage',{id:active.license.id,action:'add-validity',days},admin)).status,400);
  const added=await request('admin/manage',{id:active.license.id,action:'add-validity',days:'7'},admin);
  assert.equal(added.status,200);assert.equal(Date.parse(added.data.license.expiresAt)-Date.parse(active.license.expiresAt),7*86400000);
  assert.equal((await request('admin/manage',{id:unpaid.license.id,action:'add-validity',days:2},admin)).status,400);
  const seller=(await request('admin/seller-create',{name:'Seller',username:'seller_validity',password:'synthetic-seller',rate:100},admin)).data.seller;
  const token=(await request('seller/login',{username:'seller_validity',password:'synthetic-seller'})).cookie;
  const issued=(await request('seller/issue',{customer:'Seller client',plan:'monthly'},token)).data;
  await request('admin/manage',{id:issued.license.id,action:'paid'},admin);
  const denied=await request('seller/manage',{id:issued.license.id,action:'add-validity',days:10},token);
  assert.equal(denied.status,400);assert.match(denied.data.error,/Only admin/);
  const disk=JSON.parse(fs.readFileSync(path.join(directory,'registry.json'),'utf8'));
  assert.equal(disk.sellers.find(s=>s.id===seller.id).balance,0);
  assert.equal(disk.ledger.find(e=>e.action==='key-validity-added').days,7);
  disk.keys.find(k=>k.id===expired.license.id).expiresAt=new Date(Date.now()-86400000).toISOString();
  fs.writeFileSync(path.join(directory,'registry.json'),JSON.stringify(disk));
  await new Promise(r=>server.close(r));
  const restored=createLicensing({directory}),second=http.createServer((req,res)=>restored.handle(req,res,new URL(req.url,'http://localhost')));
  await new Promise(r=>second.listen(0,'127.0.0.1',r));
  try{
   const cookie='matrix_admin='+restored.login('synthetic-admin');const before=Date.now();
   const r=await fetch('http://127.0.0.1:'+second.address().port+'/api/admin/manage',{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({id:expired.license.id,action:'add-validity',days:3})});
   assert.equal(r.status,200);const expiry=Date.parse((await r.json()).license.expiresAt);
   assert(expiry>=before+3*86400000&&expiry<=Date.now()+3*86400000);
   assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'registry.json'),'utf8')).keys.find(k=>k.id===active.license.id).expiresAt,added.data.license.expiresAt);
  }finally{await new Promise(r=>second.close(r));}
 }finally{if(server.listening)await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
});
test('only admin sees custom validity action and dialog has bounded day input',()=>{
 const source=fs.readFileSync(path.join(__dirname,'admin/portal.js'),'utf8');
 const render=source.slice(source.indexOf('function keyAccess('),source.indexOf('async function refresh()'));
 for(const role of ['admin','seller']){
  const nodes={search:{value:''},keys:{},sellers:{}};
  vm.runInNewContext(render+';render();',{role,el:id=>nodes[id],keys:[{id:'key1',customer:'Client',key:'Example',expiresAt:new Date(Date.now()+86400000).toISOString(),paid:true,devicesUsed:0,maxDevices:1}],sellers:[],escape:String,day:()=>''});
  assert.equal(nodes.keys.innerHTML.includes('data-action="add-validity"'),role==='admin');
 }
 assert.match(fs.readFileSync(path.join(__dirname,'admin/index.html'),'utf8'),/id="manage-days"[^>]*min="1"[^>]*max="3650"/);
});

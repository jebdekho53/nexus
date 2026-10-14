// Explicitly invoked live QA. Only QA seller/client records are mutated.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base='https://matrix.vaidya-gpt.com',privateFile='diagnostics/qa-seller-access.json',reportFile='diagnostics/portal-live-qa.json';
async function run(){
 const access=fs.readFileSync('diagnostics/matrix-admin-access.txt','utf8'),admin={username:access.match(/^Username: (.+)$/m)[1],password:access.match(/^Password: (.+)$/m)[1]},report={checks:[],paymentSubmitted:false};
 let qa=fs.existsSync(privateFile)?JSON.parse(fs.readFileSync(privateFile)): {username:'qa_matrix_20261014',password:crypto.randomBytes(18).toString('base64url')};
 const save=()=>{fs.writeFileSync(privateFile,JSON.stringify(qa,null,2));fs.writeFileSync(reportFile,JSON.stringify(report,null,2));};save();
 async function request(route,body,cookie){const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();return{status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 async function ok(name,route,body,cookie){const r=await request(route,body,cookie);assert.equal(r.status,200,name+': '+(r.data.error||r.status));report.checks.push({name,status:r.status});save();return r;}
 const a=await ok('Admin login','/api/admin/login',admin),adminCookie=a.cookie;
 if(!qa.sellerId){const r=await ok('Create QA seller','/api/admin/seller-create',{name:'Matrix QA Seller',...qa,rate:1600,maxKeys:10,maxDevices:2},adminCookie);qa.sellerId=r.data.seller.id;save();}
 if(!qa.creditAdded){await ok('Add QA credit','/api/admin/credit',{id:qa.sellerId,amount:10000,note:'Authorized QA internal credit; no bank payment'},adminCookie);qa.creditAdded=true;save();}
 const s=await ok('Seller login','/api/seller/login',{username:qa.username,password:qa.password}),sellerCookie=s.cookie;
 for(const role of ['admin','seller'])for(const route of ['session','overview','keys','ledger','audit','ips','export',...(role==='admin'?['sellers','signup-requests','notice']:[])])await ok(role+' '+route,'/api/'+role+'/'+route,undefined,role==='admin'?adminCookie:sellerCookie);
 if(!qa.client){const r=await ok('Seller create monthly client','/api/seller/issue',{customer:'Matrix QA Client',plan:'monthly',maxDevices:2},sellerCookie);qa.client={id:r.data.license.id,key:r.data.key};save();}
 let key=(await ok('Inspect QA key','/api/seller/keys',undefined,sellerCookie)).data.keys.find(k=>k.id===qa.client.id);
 if(key.paid===false)await ok('Mark QA client paid','/api/seller/manage',{id:qa.client.id,action:'paid'},sellerCookie);
 if(!qa.renewed){await ok('Renew QA client','/api/seller/manage',{id:qa.client.id,action:'renew'},sellerCookie);qa.renewed=true;save();}
 await ok('Edit QA client','/api/seller/manage',{id:qa.client.id,action:'edit',customer:'Matrix QA Client - verified'},sellerCookie);
 await ok('Reset QA devices','/api/seller/manage',{id:qa.client.id,action:'reset'},sellerCookie);
 await ok('Deactivate QA key','/api/seller/manage',{id:qa.client.id,action:'deactivate'},sellerCookie);
 const device='matrix-live-qa-browser',rejected=await request('/api/license/activate',{key:qa.client.key,device});assert.notEqual(rejected.status,200);report.checks.push({name:'Deactivated key rejected',passed:true});
 await ok('Reactivate QA key','/api/seller/manage',{id:qa.client.id,action:'activate'},sellerCookie);
 await ok('Disable QA seller','/api/admin/seller-update',{id:qa.sellerId,enabled:false},adminCookie);
 const disabled=await request('/api/seller/session',undefined,sellerCookie);assert.notEqual(disabled.status,200);report.checks.push({name:'Disabled seller session rejected',passed:true});
 await ok('Enable QA seller','/api/admin/seller-update',{id:qa.sellerId,enabled:true},adminCookie);
 const activated=await ok('Client activate','/api/license/activate',{key:qa.client.key,device});const clientCookie=activated.cookie;
 await ok('Client verify','/api/license/verify',{key:qa.client.key,device});await ok('Client state','/api/license/state',undefined,clientCookie);
 await ok('Client renewal request','/api/license/renew-request',{},clientCookie);
 const credit=(await ok('Final seller balance','/api/admin/sellers',undefined,adminCookie)).data.sellers.find(x=>x.id===qa.sellerId);qa.balance=credit.balance;
 fs.writeFileSync('diagnostics/deployment-test-key.json',JSON.stringify({key:qa.client.key,id:qa.client.id}));
 report.ok=true;report.sellerId=qa.sellerId;report.clientId=qa.client.id;report.balance=qa.balance;save();console.log(JSON.stringify({ok:true,checks:report.checks.length,seller:qa.username,balance:qa.balance,clientId:qa.client.id}));
 await request('/api/admin/logout',{},adminCookie);
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});

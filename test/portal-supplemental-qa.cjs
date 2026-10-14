// Explicit live QA of disposable records. Credentials and full keys stay in ignored diagnostics.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
async function run(){
 const base='https://matrix.vaidya-gpt.com',access=fs.readFileSync('diagnostics/matrix-admin-access.txt','utf8');
 const report={checks:[],paymentSubmitted:false},privateData={};
 async function call(route,body,cookie,status=200){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();assert.equal(r.status,status,route+': '+(data.error||''));report.checks.push({route,status});return{data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const login=await call('/api/admin/login',{username:access.match(/^Username: (.+)$/m)[1],password:access.match(/^Password: (.+)$/m)[1]});const admin=login.cookie;
 const suffix=crypto.randomBytes(4).toString('hex');
 for(const action of ['approve','reject']){
  const username='qa_review_'+action+'_'+suffix;
  await call('/api/portal/signup',{name:'QA review '+action,username,email:username+'@example.invalid'});
  const request=(await call('/api/admin/signup-requests',undefined,admin)).data.requests.find(r=>r.username===username);
  const review=await call('/api/admin/signup-'+action,{id:request.id},admin);
  if(action==='approve'){
   const seller=review.data.seller;privateData.reviewSeller={username,password:review.data.initialPassword,id:seller.id};
   const s=await call('/api/seller/login',{username,password:review.data.initialPassword});
   await call('/api/seller/session',undefined,s.cookie);
   await call('/api/seller/logout',{},s.cookie);
   await call('/api/seller/session',undefined,s.cookie,401);
   await call('/api/admin/seller-update',{id:seller.id,enabled:false},admin);
  }
 }
 const issued=await call('/api/admin/issue',{customer:'QA admin issue - disposable',days:1,maxDevices:1},admin);
 const id=issued.data.license.id;privateData.adminClient={id,key:issued.data.key};
 const activated=await call('/api/license/activate',{key:issued.data.key,device:'qa-supplemental-device'});
 await call('/api/license/state',undefined,activated.cookie);
 const newKey='QA-'+crypto.randomBytes(12).toString('hex');
 const changed=await call('/api/license/change',{currentKey:issued.data.key,newKey},activated.cookie);privateData.adminClient.key=newKey;
 await call('/api/license/activate',{key:newKey,device:'qa-supplemental-device'});
 await call('/api/license/renew-request',{},changed.cookie);
 await call('/api/admin/manage',{id,action:'deactivate'},admin);
 await call('/api/admin/logout',{},admin);
 await call('/api/admin/session',undefined,admin,401);
 report.ok=true;fs.writeFileSync('diagnostics/portal-supplemental-private.json',JSON.stringify(privateData,null,2));fs.writeFileSync('diagnostics/portal-supplemental-report.json',JSON.stringify(report,null,2));
 const qa=JSON.parse(fs.readFileSync('diagnostics/qa-seller-access.json'));qa.balance=3700;fs.writeFileSync('diagnostics/qa-seller-access.json',JSON.stringify(qa,null,2));console.log(JSON.stringify({ok:true,checks:report.checks.length,paymentSubmitted:false}));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});

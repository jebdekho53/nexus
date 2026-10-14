'use strict';
function classify(userId,data){
 if(!data||typeof data!=='object'||String(data.userId||'').toLowerCase()!==userId.toLowerCase()||(Array.isArray(data.errorList)&&data.errorList.length))return{userId,state:'unknown',message:'Provider did not confirm this account.'};
 const error=String(data?.errorMessage||data?.error||data?.message||'');
 if(/(?:user|id).*(?:not found|does not exist|invalid)/i.test(error))return{userId,state:'invalid',message:error};
 if(/deactivated|account.*disabled/i.test(error))return{userId,state:'disabled',message:error};
 if(data?.isIrctcProfileComplete===false||data?.verificationFlow)return{userId,state:'unverified',message:'Complete the verification on IRCTC.'};
 const flags=String(data?.status||'').split('#');
 if(!error&&flags.length===4&&flags.every(v=>v.trim()==='1')&&data?.isIrctcProfileComplete===true)return{userId,state:'verified',source:'makemytrip'};
 return{userId,state:'unknown',message:'Provider did not confirm the account status.'};
}
async function fallbackIds(ids,result,request){
 if(!Array.isArray(ids)||ids.length>100)return result;
 const previous=Array.isArray(result?.data)?result.data:[];const data=new Array(ids.length);let cursor=0;
 async function worker(){while(cursor<ids.length){const index=cursor++,userId=String(ids[index]||'').trim(),known=previous.find(v=>String(v.userId).toLowerCase()===userId.toLowerCase());if(known&&['verified','unverified','invalid','disabled'].includes(known.state)){data[index]=known;continue;}
  if(!/^[A-Za-z0-9_.-]{3,35}$/.test(userId)){data[index]={userId,state:'invalid',message:'Invalid ID format.'};continue;}
  try{const response=await request('https://railways.makemytrip.com/api/user/status/'+encodeURIComponent(userId),{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Provider HTTP '+response.status);data[index]=classify(userId,await response.json());}catch{data[index]={userId,state:'unknown',message:'Could not check right now. Network/provider unavailable; nothing decided.'};}
 }}
 await Promise.all(Array.from({length:Math.min(2,ids.length)},()=>worker()));
 return{ok:true,data};
}
module.exports={classify,fallbackIds};

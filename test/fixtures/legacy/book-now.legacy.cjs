'use strict';
// Default General uses standard Auto with GN's null clock target. An explicit
// developer-only candidate reuses Direct login and the existing API enquiry
// branch; it is not promoted on the basis of synthetic timing.
function createBookNow(log=()=>{},{generalApiCandidate=false}={}){
 const forms=new Map(),candidateForms=new Set();
 const automatic=form=>form?.quota==='GN'&&!form.manualLogin&&!form.directLogin&&!form.brahmosLogin;
 return {
  observe(channel,args,result){
   if(!result?.ok)return;
   const form=channel==='app:get-form'?result.data:channel==='app:save-form'?args[0]:null;
   if(form?.id&&form.journey)forms.set(form.id,{quota:form.journey.quota});
   if(channel==='app:delete-form'){forms.delete(args[0]);candidateForms.delete(args[0]);}
  },
  prepare(channel,args){
   const request=args[0];if(!request||typeof request!=='object')return args;
   if(channel==='app:login'){
    candidateForms.delete(request.formId);
    if(request.mode==='weblogin'&&forms.get(request.formId)?.quota==='GN'&&!request.manual&&!request.directLogin&&!request.brahmosLogin){
     if(generalApiCandidate){candidateForms.add(request.formId);log('matrix-general-api-candidate',{page:'Experimental General: reuse login session and existing API train-enquiry branch; speed unverified'});return [{...request,directLogin:true},...args.slice(1)];}
     log('matrix-auto-book-now',{page:'Auto Book now: standard Auto browser-check flow; no opening-time countdown'});
    }
   }
   if(channel==='app:start-booking'&&generalApiCandidate&&candidateForms.has(request.formId)&&automatic(request.form))return [{...request,matrixGeneralApiCandidate:true,form:{...request.form,directLogin:true}},...args.slice(1)];
   if(channel==='app:start-booking'&&automatic(request.form))log('matrix-auto-book-now-start',{page:'General Auto: use standard Auto stages and provider waits now'});
   return args;
  },
 };
}
module.exports={createBookNow};

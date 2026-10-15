'use strict';
// General uses the same Auto branch as opening/Tatkal, with GN's null clock
// target. Do not change the quota or force Direct to bypass Auto preparation.
function createBookNow(log=()=>{}){
 const forms=new Map();
 const automatic=form=>form?.quota==='GN'&&!form.manualLogin&&!form.directLogin&&!form.brahmosLogin;
 return {
  observe(channel,args,result){
   if(!result?.ok)return;
   const form=channel==='app:get-form'?result.data:channel==='app:save-form'?args[0]:null;
   if(form?.id&&form.journey)forms.set(form.id,{quota:form.journey.quota});
   if(channel==='app:delete-form')forms.delete(args[0]);
  },
  prepare(channel,args){
   const request=args[0];if(!request||typeof request!=='object')return args;
   if(channel==='app:login'){
    if(request.mode==='weblogin'&&forms.get(request.formId)?.quota==='GN'&&!request.manual&&!request.directLogin&&!request.brahmosLogin){
     log('matrix-auto-book-now',{page:'Auto Book now: standard Auto browser-check flow; no opening-time countdown'});
    }
   }
   if(channel==='app:start-booking'&&automatic(request.form))log('matrix-auto-book-now-start',{page:'General Auto: use standard Auto stages and provider waits now'});
   return args;
  },
 };
}
module.exports={createBookNow};

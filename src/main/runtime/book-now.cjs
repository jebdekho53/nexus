'use strict';
// Auto Book now uses the authenticated WebLogin session immediately. Scheduled
// opening modes retain their browser-check/re-login workflow.
function createBookNow(log=()=>{}){
 const forms=new Map(),modes=new Map();
 const automatic=form=>form?.quota==='GN'&&!form.manualLogin&&!form.directLogin&&!form.brahmosLogin;
 return {
  observe(channel,args,result){
   if(!result?.ok)return;
   const form=channel==='app:get-form'?result.data:channel==='app:save-form'?args[0]:null;
   if(form?.id&&form.journey)forms.set(form.id,{quota:form.journey.quota});
   if(channel==='app:delete-form'){forms.delete(args[0]);modes.delete(args[0]);}
  },
  prepare(channel,args){
   const request=args[0];if(!request||typeof request!=='object')return args;
   if(channel==='app:login'){
    modes.set(request.formId,{mode:request.mode,automatic:!request.manual&&!request.directLogin&&!request.brahmosLogin});
    if(request.mode==='weblogin'&&forms.get(request.formId)?.quota==='GN'&&!request.manual&&!request.directLogin&&!request.brahmosLogin){
     log('nexus-auto-book-now',{page:'Auto Book now: automatic login; use current session without scheduled browser check'});
     return [{...request,directLogin:true},...args.slice(1)];
    }
   }
   if(channel==='app:start-booking'&&modes.get(request.formId)?.mode==='weblogin'&&modes.get(request.formId)?.automatic&&automatic(request.form))return [{...request,form:{...request.form,directLogin:true}},...args.slice(1)];
   return args;
  },
 };
}
module.exports={createBookNow};

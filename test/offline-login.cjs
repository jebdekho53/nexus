'use strict';
module.exports=async function loginDiagnostic() {
  const result=await window.api.login({mode:'weblogin',provider:'chromium',
    credentials:{username:'local-test-only',password:'synthetic'},
    profileId:'offline-diagnostic',formId:'offline-diagnostic',manual:true});
  return {ok:result?.ok,code:result?.code,error:result?.error,syntheticData:true};
};
